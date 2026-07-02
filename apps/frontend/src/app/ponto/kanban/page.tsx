'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { KanbanCardModal } from '@/components/kanban/KanbanCardModal';
import { KanbanBoardLabelSettings } from '@/components/kanban/KanbanBoardLabelSettings';
import { KanbanCreateBoardModal } from '@/components/kanban/KanbanCreateBoardModal';
import { KanbanBoardShareModal } from '@/components/kanban/KanbanBoardShareModal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  kanbanLabel,
  kanbanInput,
  kanbanInputNumber,
} from '@/components/kanban/kanbanFormStyles';
import api from '@/lib/api';
import { useKanbanDragScrollAssist } from '@/hooks/useKanbanDragScrollAssist';
import {
  type Priority,
  type KanbanCard,
  type KanbanColumn,
  type KanbanBoard,
  type KanbanBoardSummary,
  fetchKanbanBoard,
  fetchKanbanBoards,
  createKanbanBoard,
  updateKanbanBoard,
  deleteKanbanBoard,
  updateKanbanBoardLabelPresets,
  createKanbanColumn,
  updateKanbanColumn,
  deleteKanbanColumn,
  updateKanbanCard,
  deleteKanbanCard,
  duplicateKanbanCard,
  patchCardInBoardCache,
  type KanbanBoardCardChecklistPatch,
  fetchKanbanCard,
  kanbanCardQueryKey,
} from '@/lib/kanban';
import {
  resolveKanbanDefaultBoard,
  saveKanbanDefaultBoard,
  clearKanbanDefaultBoard,
  getKanbanDefaultBoard,
} from '@/lib/kanbanDefaultBoard';
import { KanbanUserAvatar } from '@/components/kanban/KanbanUserAvatar';
import { KANBAN_PRIORITY_CONFIG, KANBAN_PRIORITY_ORDER } from '@/components/kanban/kanbanPriority';
import { KanbanPriorityBars } from '@/components/kanban/KanbanPriorityBars';
import {
  getKanbanLabelPalette,
  normalizeKanbanLabels,
  type KanbanLabelPreset,
} from '@/components/kanban/kanbanLabels';
import {
  formatKanbanCardEndDate,
  splitDateTime,
} from '@/components/kanban/kanbanDateTime';
import {
  Plus,
  MoreHorizontal,
  X,
  Search,
  Filter,
  Calendar,
  MessageSquare,
  Paperclip,
  BarChart2,
  ListChecks,
  Tag,
  Trash2,
  Edit3,
  Copy,
  ArrowRightLeft,
  AlertCircle,
  ChevronDown,
  Clock,
  Flag,
  Circle,
  CheckCircle2,
  XCircle,
  Loader,
  LayoutGrid,
  ChevronUp,
  Eye,
  Users,
  Star,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const PRIORITY_CONFIG = KANBAN_PRIORITY_CONFIG;

const KANBAN_PRIORITY_ALL_VALUES = KANBAN_PRIORITY_ORDER;

/** Quantidade inicial de cards visíveis por coluna; "Ver mais" carrega mais este lote. */
const KANBAN_COLUMN_VISIBLE_BATCH = 10;

/** Todos marcados (ou lista vazia) = sem filtro restritivo nesse campo. */
function multiselectFilterShowsAll(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return true;
  return selected.length === 0 || selected.length >= allValues.length;
}

function isMultiselectFilterActive(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return false;
  return selected.length > 0 && selected.length < allValues.length;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const { date } = splitDateTime(dateStr);
  if (!date) return false;
  return new Date(date + 'T23:59:59') < new Date();
}

function resolveKanbanInsertIndex(
  columnCards: KanbanCard[],
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  rawIndex: number,
): number {
  const bounded = Math.max(0, Math.min(rawIndex, columnCards.length));
  if (fromColumnId !== toColumnId) {
    const targetWithoutCard = columnCards.filter((card) => card.id !== cardId);
    return Math.max(0, Math.min(bounded, targetWithoutCard.length));
  }

  const sourceIndex = columnCards.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0) return bounded;

  let insertIndex = bounded;
  if (insertIndex > sourceIndex) insertIndex -= 1;
  return Math.max(0, Math.min(insertIndex, columnCards.length - 1));
}

function moveCardInBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  targetIndex?: number,
): KanbanBoard | undefined {
  if (!board) return board;

  const fromColumn = board.columns.find((col) => col.id === fromColumnId);
  const toColumn = board.columns.find((col) => col.id === toColumnId);
  if (!fromColumn || !toColumn) return board;

  const sourceIndex = fromColumn.cards.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0) return board;

  const movedCard = fromColumn.cards[sourceIndex];
  const fromCards = fromColumn.cards.filter((card) => card.id !== cardId);

  const insertIndex = resolveKanbanInsertIndex(
    fromColumnId === toColumnId ? fromColumn.cards : toColumn.cards,
    cardId,
    fromColumnId,
    toColumnId,
    targetIndex ?? toColumn.cards.length,
  );

  const toCardsWithoutMoved =
    fromColumnId === toColumnId ? fromCards : toColumn.cards.filter((card) => card.id !== cardId);
  const toCards = [
    ...toCardsWithoutMoved.slice(0, insertIndex),
    movedCard,
    ...toCardsWithoutMoved.slice(insertIndex),
  ];

  return {
    ...board,
    columns: board.columns.map((col) => {
      if (fromColumnId === toColumnId && col.id === fromColumnId) {
        return { ...col, cards: toCards };
      }
      if (col.id === fromColumnId) return { ...col, cards: fromCards };
      if (col.id === toColumnId) return { ...col, cards: toCards };
      return col;
    }),
  };
}

const KANBAN_REORDER_MS = 380;

type KanbanReorderIdAttr = 'data-kanban-card-id' | 'data-kanban-column-id';
type KanbanReorderClass = 'kanban-card-reordering' | 'kanban-column-reordering';

function kanbanPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function captureKanbanReorderRects(
  container: HTMLElement,
  idAttribute: KanbanReorderIdAttr,
): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  container.querySelectorAll(`[${idAttribute}]`).forEach((node) => {
    if (node instanceof HTMLElement) {
      const id = node.getAttribute(idAttribute);
      if (id) map.set(id, node.getBoundingClientRect());
    }
  });
  return map;
}

function animateKanbanReorder(
  container: HTMLElement,
  beforeRects: Map<string, DOMRect>,
  idAttribute: KanbanReorderIdAttr,
  reorderingClass: KanbanReorderClass,
): void {
  if (kanbanPrefersReducedMotion()) return;

  container.querySelectorAll(`[${idAttribute}]`).forEach((node) => {
    const el = node as HTMLElement;
    const id = el.getAttribute(idAttribute);
    if (!id) return;

    const first = beforeRects.get(id);
    if (!first) return;

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    el.classList.add(reorderingClass);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = 'none';

    const cleanup = () => {
      el.classList.remove(reorderingClass);
      el.style.transition = '';
      el.style.transform = '';
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${KANBAN_REORDER_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = '';
        el.addEventListener('transitionend', cleanup, { once: true });
        window.setTimeout(cleanup, KANBAN_REORDER_MS + 80);
      });
    });
  });
}

function scheduleKanbanReorderAnimation(
  container: HTMLElement | null,
  beforeRects: Map<string, DOMRect>,
  idAttribute: KanbanReorderIdAttr,
  reorderingClass: KanbanReorderClass,
): void {
  if (!container || kanbanPrefersReducedMotion()) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateKanbanReorder(container, beforeRects, idAttribute, reorderingClass);
    });
  });
}

function resolveColumnInsertIndex(
  boardColumns: KanbanColumn[],
  columnId: string,
  rawIndex: number,
): number {
  const bounded = Math.max(0, Math.min(rawIndex, boardColumns.length));
  const sourceIndex = boardColumns.findIndex((col) => col.id === columnId);
  if (sourceIndex < 0) return bounded;

  let insertIndex = bounded;
  if (insertIndex > sourceIndex) insertIndex -= 1;
  return Math.max(0, Math.min(insertIndex, boardColumns.length - 1));
}

function setKanbanColumnDragGhost(
  e: React.DragEvent,
  ghostRef: React.MutableRefObject<HTMLElement | null>,
) {
  const columnEl = e.currentTarget;
  if (!(columnEl instanceof HTMLElement)) return;

  ghostRef.current?.remove();
  const ghost = columnEl.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('kanban-column-drag-ghost');
  ghost.style.position = 'fixed';
  ghost.style.top = '-10000px';
  ghost.style.left = '-10000px';
  ghost.style.width = `${columnEl.offsetWidth}px`;
  ghost.style.zIndex = '9999';
  document.body.appendChild(ghost);
  ghostRef.current = ghost;
  e.dataTransfer.setDragImage(ghost, 48, 36);
}

function shouldStartColumnDrag(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-kanban-card]')) return false;
  if (target.closest('button')) return false;
  return true;
}

function resolveColumnDropIndex(
  columnIndex: number,
  clientX: number,
  rect: DOMRect,
): number {
  const before = clientX < rect.left + rect.width / 2;
  return before ? columnIndex : columnIndex + 1;
}

function moveColumnInBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  rawIndex: number,
): KanbanBoard | undefined {
  if (!board) return board;

  const cols = [...board.columns];
  const sourceIndex = cols.findIndex((col) => col.id === columnId);
  if (sourceIndex < 0) return board;

  const insertIndex = resolveColumnInsertIndex(cols, columnId, rawIndex);
  if (insertIndex === sourceIndex) return board;

  const [moved] = cols.splice(sourceIndex, 1);
  cols.splice(insertIndex, 0, moved);
  return { ...board, columns: cols };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityIndicator({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 text-gray-500 dark:text-gray-400 shrink-0',
        className,
      )}
      title={cfg.label}
    >
      <KanbanPriorityBars priority={priority} />
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
        {cfg.label}
      </span>
    </div>
  );
}

function CardActivityCounts({ card }: { card: KanbanCard }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400">
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <Paperclip className="h-3.5 w-3.5" />
        {card.attachments}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <MessageSquare className="h-3.5 w-3.5" />
        {card.comments}
      </span>
    </div>
  );
}

function CardMetaRow({ card }: { card: KanbanCard }) {
  const dateLabel = formatKanbanCardEndDate(card.endDate);
  const hasDate = !!dateLabel;
  const hasTasks = card.checklistEnabled && card.totalTasks > 0;

  return (
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400">
        {hasDate && (
          <>
            <span className="inline-flex min-w-0 items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{dateLabel}</span>
            </span>
            {hasTasks && (
              <span
                className="h-3.5 w-px shrink-0 bg-gray-300 dark:bg-gray-600"
                aria-hidden
              />
            )}
          </>
        )}
        {hasTasks && <CardActivityCounts card={card} />}
      </div>

      <PriorityIndicator priority={card.priority} className="ml-auto" />
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const size = 22;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FEE2E2"
          strokeWidth={stroke}
          className="dark:stroke-red-900/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#DC2626"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="min-w-[2.25rem] text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">
        {value}%
      </span>
    </div>
  );
}

function getCardMembers(card: KanbanCard) {
  if (card.members && card.members.length > 0) return card.members;
  if (card.assignee && card.assignee !== 'Sem responsável') {
    return [
      {
        userId: card.assigneeUserId ?? card.assignee,
        name: card.assignee,
        profilePhotoUrl: card.assigneeProfilePhotoUrl ?? null,
        avatarColor: card.assigneeColor,
      },
    ];
  }
  return [];
}

function CardMemberAvatars({ card }: { card: KanbanCard }) {
  const list = getCardMembers(card);

  if (list.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {list.slice(0, 4).map((m) => (
        <KanbanUserAvatar
          key={m.userId}
          name={m.name}
          profilePhotoUrl={m.profilePhotoUrl}
          colorKey={m.userId}
          colorClass={m.avatarColor}
          size="sm"
          className="ring-2 ring-white dark:ring-gray-800 shadow-sm"
        />
      ))}
      {list.length > 4 && (
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 ring-2 ring-white dark:ring-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-700 dark:text-gray-200">
          +{list.length - 4}
        </div>
      )}
    </div>
  );
}

// ─── Card Component ───────────────────────────────────────────────────────────

interface KanbanCardItemProps {
  card: KanbanCard;
  columnId: string;
  labelPresets?: readonly KanbanLabelPreset[];
  readOnly?: boolean;
  onEdit: (card: KanbanCard, columnId: string) => void;
  onMove: (card: KanbanCard, columnId: string) => void;
  onCopy: (card: KanbanCard, columnId: string) => void;
  onDelete: (cardId: string, columnId: string) => void;
  onPrefetch?: (cardId: string) => void;
  onDragStart: (e: React.DragEvent, cardId: string, columnId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function KanbanCardItem({
  card,
  columnId,
  labelPresets,
  readOnly = false,
  onEdit,
  onMove,
  onCopy,
  onDelete,
  onPrefetch,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanCardItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleCardClick() {
    if (suppressClickRef.current) return;
    onEdit(card, columnId);
  }

  return (
    <div
      data-kanban-card
      data-kanban-card-id={card.id}
      draggable={!readOnly}
      onDragStart={
        readOnly
          ? undefined
          : (e) => {
              e.stopPropagation();
              suppressClickRef.current = true;
              onDragStart(e, card.id, columnId);
            }
      }
      onDragEnd={
        readOnly
          ? undefined
          : () => {
              onDragEnd();
              window.setTimeout(() => {
                suppressClickRef.current = false;
              }, 150);
            }
      }
      onMouseEnter={() => onPrefetch?.(card.id)}
      onFocus={() => onPrefetch?.(card.id)}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role="button"
      tabIndex={0}
      className={clsx(
        'group relative rounded-2xl border border-transparent bg-white p-4 dark:bg-gray-800',
        menuOpen && 'z-30',
        'cursor-pointer select-none shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
        'transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'motion-reduce:transition-none',
        'active:cursor-grabbing',
        isDragging
          ? 'z-10 opacity-50'
          : [
              'hover:-translate-y-1.5 hover:scale-[1.015]',
              'hover:border-gray-200/80 hover:shadow-[0_14px_32px_-10px_rgba(0,0,0,0.14),0_8px_16px_-8px_rgba(0,0,0,0.1)]',
              'dark:hover:border-gray-600/80 dark:hover:shadow-[0_14px_32px_-10px_rgba(0,0,0,0.5),0_8px_16px_-8px_rgba(0,0,0,0.35)]',
              'motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100',
            ],
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none absolute inset-0 rounded-2xl overflow-hidden opacity-0 transition-opacity duration-300',
          'bg-gradient-to-br from-white/50 via-white/10 to-transparent',
          'dark:from-white/[0.07] dark:via-transparent',
          !isDragging && 'group-hover:opacity-100',
        )}
      />
      {!readOnly && (
        <div
          className="absolute top-3 right-3 z-[2] opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 translate-y-0.5"
          ref={menuRef}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Edit3 className="w-4 h-4" /> Editar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMove(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <ArrowRightLeft className="w-4 h-4" /> Mover
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onCopy(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Copy className="w-4 h-4" /> Copiar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(card.id, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative z-[1]">
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {normalizeKanbanLabels(card.labels, labelPresets).map((l) => (
            <span
              key={`${l.color}-${l.text}`}
              className="h-2 w-10 rounded-sm shrink-0"
              style={{ backgroundColor: l.color }}
              title={l.text}
            />
          ))}
        </div>
      )}

      <h4 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-snug pr-6 mb-1.5">
        {card.title}
      </h4>

      {card.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mb-3">
          {card.description}
        </p>
      )}

      <CardMetaRow card={card} />

      <div className="min-h-[2.25rem] border-t border-gray-100 dark:border-gray-700/80 pt-3 flex items-center justify-between gap-2">
        {card.checklistEnabled && card.totalTasks > 0 ? (
          <>
            <ProgressRing value={card.progress} />
            <span className="flex flex-1 items-center justify-center gap-1.5 text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
              <ListChecks className="h-3.5 w-3.5 shrink-0" />
              {card.completedTasks}/{card.totalTasks} Tasks
            </span>
            <CardMemberAvatars card={card} />
          </>
        ) : (
          <>
            <CardActivityCounts card={card} />
            <CardMemberAvatars card={card} />
          </>
        )}
      </div>
      </div>
    </div>
  );
}

function KanbanDropGutter({
  active,
  readOnly,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  readOnly?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  if (readOnly) return <div className="h-0 shrink-0" aria-hidden />;

  return (
    <div
      className="relative h-3 shrink-0"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e);
      }}
    >
      <div
        className={clsx(
          'pointer-events-none absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-red-500/90 transition-opacity duration-200',
          active && 'kanban-card-drop-gutter-line opacity-100',
          !active && 'scale-x-0 opacity-0',
        )}
      />
    </div>
  );
}

function KanbanColumnDropGutter({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="relative w-2 shrink-0 self-stretch min-h-[200px] -mx-2.5 z-[2]"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e);
      }}
    >
      <div
        className={clsx(
          'pointer-events-none absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-red-500/90 transition-opacity duration-200',
          active && 'kanban-column-drop-gutter-line opacity-100',
          !active && 'scale-y-0 opacity-0',
        )}
      />
    </div>
  );
}

// ─── Column Component ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: KanbanColumn;
  labelPresets?: readonly KanbanLabelPreset[];
  dragState: DragState;
  isColumnDragging?: boolean;
  isColumnDragActive?: boolean;
  readOnly?: boolean;
  onAddCard: (columnId: string) => void;
  onEditCard: (card: KanbanCard, columnId: string) => void;
  onMoveCard: (card: KanbanCard, columnId: string) => void;
  onCopyCard: (card: KanbanCard, columnId: string) => void;
  onDeleteCard: (cardId: string, columnId: string) => void;
  onPrefetchCard?: (cardId: string) => void;
  onColumnDragStart?: (e: React.DragEvent, columnId: string) => void;
  onColumnDragEnd?: () => void;
  onDragStart: (e: React.DragEvent, cardId: string, columnId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, columnId: string, index?: number) => void;
  onDrop: (e: React.DragEvent, columnId: string, index?: number) => void;
  onEditColumn: (column: KanbanColumn) => void;
  onDeleteColumn: (columnId: string) => void;
}

function KanbanColumnComponent({
  column,
  labelPresets,
  dragState,
  isColumnDragging = false,
  isColumnDragActive = false,
  readOnly = false,
  onAddCard,
  onEditCard,
  onMoveCard,
  onCopyCard,
  onDeleteCard,
  onPrefetchCard,
  onColumnDragStart,
  onColumnDragEnd,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEditColumn,
  onDeleteColumn,
}: KanbanColumnProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(KANBAN_COLUMN_VISIBLE_BATCH);
  const menuRef = useRef<HTMLDivElement>(null);
  const isTarget = dragState.overColumnId === column.id;
  const overIndex = isTarget ? dragState.overIndex : null;
  const cardDnDDisabled = readOnly || isColumnDragActive;
  const visibleCards = column.cards.slice(0, visibleCount);
  const hasMoreCards = column.cards.length > visibleCount;
  const dropTailIndex = hasMoreCards ? visibleCount : column.cards.length;
  const isEmptyColumnDropTarget =
    column.cards.length === 0 &&
    isTarget &&
    !!dragState.draggingCardId &&
    !isColumnDragActive;

  useEffect(() => {
    setVisibleCount(KANBAN_COLUMN_VISIBLE_BATCH);
  }, [column.id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div
      data-kanban-column
      draggable={!!onColumnDragStart}
      onDragStart={
        onColumnDragStart
          ? (e) => {
              if (!shouldStartColumnDrag(e.target)) {
                e.preventDefault();
                return;
              }
              onColumnDragStart(e, column.id);
            }
          : undefined
      }
      onDragEnd={onColumnDragEnd}
      className={clsx(
        'relative flex flex-col rounded-2xl w-[340px] flex-shrink-0',
        'bg-[#F9FAFB] dark:bg-gray-800/60',
        'transition-[opacity,box-shadow] duration-200 ease-out motion-reduce:transition-none',
        onColumnDragStart && 'cursor-grab active:cursor-grabbing [&_[data-kanban-card]]:cursor-pointer',
        isColumnDragging && 'kanban-column-dragging',
      )}
      onDragOver={
        readOnly || isColumnDragActive
          ? undefined
          : (e) => onDragOver(e, column.id, column.cards.length)
      }
      onDrop={
        readOnly || isColumnDragActive
          ? undefined
          : (e) => onDrop(e, column.id, column.cards.length)
      }
    >
      <div className="flex items-center justify-between px-4 py-4 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {column.title}
          </h3>
          <span className="text-[15px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">
            {column.cards.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {!readOnly && (
            <button
              onClick={() => onAddCard(column.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-700 transition-colors"
              title="Adicionar card"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          )}
          {!readOnly && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-700 transition-colors"
            >
              <MoreHorizontal className="w-[18px] h-[18px]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-50 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1">
                <button
                  onClick={() => { setMenuOpen(false); onEditColumn(column); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Edit3 className="w-4 h-4" /> Editar coluna
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onAddCard(column.id); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Plus className="w-4 h-4" /> Adicionar card
                </button>
                <hr className="my-1 border-gray-200 dark:border-gray-700" />
                <button
                  onClick={() => { setMenuOpen(false); onDeleteColumn(column.id); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" /> Excluir coluna
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-4 flex flex-col min-h-[120px]">
        {visibleCards.map((card, index) => (
          <React.Fragment key={card.id}>
            <KanbanDropGutter
              readOnly={cardDnDDisabled}
              active={
                !!dragState.draggingCardId &&
                overIndex === index &&
                dragState.overColumnId === column.id
              }
              onDragOver={(e) => onDragOver(e, column.id, index)}
              onDrop={(e) => onDrop(e, column.id, index)}
            />
            <div
              className="relative"
              onDragOver={
                cardDnDDisabled
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const middleY = rect.top + rect.height / 2;
                      const dropIndex = e.clientY < middleY ? index : index + 1;
                      onDragOver(e, column.id, dropIndex);
                    }
              }
              onDrop={
                cardDnDDisabled
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const middleY = rect.top + rect.height / 2;
                      const dropIndex = e.clientY < middleY ? index : index + 1;
                      onDrop(e, column.id, dropIndex);
                    }
              }
            >
              <KanbanCardItem
                card={card}
                columnId={column.id}
                labelPresets={labelPresets}
                readOnly={readOnly}
                onEdit={onEditCard}
                onMove={onMoveCard}
                onCopy={onCopyCard}
                onDelete={onDeleteCard}
                onPrefetch={onPrefetchCard}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={dragState.draggingCardId === card.id}
              />
            </div>
          </React.Fragment>
        ))}
        {visibleCards.length > 0 && (
          <KanbanDropGutter
            readOnly={cardDnDDisabled}
            active={
              !!dragState.draggingCardId &&
              overIndex === dropTailIndex &&
              dragState.overColumnId === column.id
            }
            onDragOver={(e) => onDragOver(e, column.id, dropTailIndex)}
            onDrop={(e) => onDrop(e, column.id, dropTailIndex)}
          />
        )}
        {hasMoreCards && (
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + KANBAN_COLUMN_VISIBLE_BATCH, column.cards.length),
              )
            }
            className="mt-2 w-full rounded-xl border border-gray-200/80 bg-white/70 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            Ver mais
          </button>
        )}
        {column.cards.length === 0 && (
          <div
            className={clsx(
              'flex flex-col items-center justify-center py-10 rounded-2xl border-2 border-dashed transition-colors',
              isEmptyColumnDropTarget
                ? 'border-red-500/90 dark:border-red-400/80'
                : 'border-gray-200/80 dark:border-gray-600',
            )}
          >
            <p
              className={clsx(
                'text-xs transition-colors',
                isEmptyColumnDropTarget
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-gray-400',
              )}
            >
              Solte o card aqui
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Column Modal ─────────────────────────────────────────────────────────────

interface ColumnModalProps {
  mode: 'create' | 'edit';
  initial?: KanbanColumn;
  onClose: () => void;
  onSave: (title: string, color: string, limit: number | undefined, id?: string) => void | Promise<void>;
  saving?: boolean;
}

function ColumnModal({ mode, initial, onClose, onSave, saving }: ColumnModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [color, setColor] = useState(initial?.color ?? '#6B7280');
  const [limit, setLimit] = useState<string>(initial?.limit ? String(initial.limit) : '');

  const colorOptions = ['#6B7280', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={mode === 'create' ? 'Nova coluna' : 'Editar coluna'}
      closeOnOverlayClick={!saving}
    >
      <div className="space-y-4">
        <div>
          <label className={kanbanLabel}>Nome *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome da coluna..."
            className={kanbanInput}
          />
        </div>
        <div>
          <label className={kanbanLabel}>Cor</label>
          <div className="flex gap-2 flex-wrap [--kanban-swatch-ring-offset:#ffffff] dark:[--kanban-swatch-ring-offset:rgb(31,41,55)]">
            {colorOptions.map((c) => {
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={`Cor ${c}`}
                  className={clsx(
                    'relative w-8 h-8 rounded-full transition-all',
                    selected ? 'scale-110 z-[1]' : 'hover:scale-105 opacity-80 hover:opacity-100',
                  )}
                  style={{
                    backgroundColor: c,
                    boxShadow: selected
                      ? `0 0 0 2px var(--kanban-swatch-ring-offset, #fff), 0 0 0 5px ${c}`
                      : undefined,
                  }}
                >
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <svg
                        className="w-3.5 h-3.5 text-white drop-shadow-sm"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={kanbanLabel}>Limite de cards (opcional)</label>
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="Ex: 10"
            className={kanbanInputNumber}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            className="!bg-red-600 hover:!bg-red-700 !text-white border-transparent focus-visible:ring-red-500"
            onClick={async () => {
              if (!title.trim()) {
                toast.error('Nome é obrigatório');
                return;
              }
              await onSave(title.trim(), color, limit ? parseInt(limit, 10) : undefined, initial?.id);
            }}
          >
            {mode === 'create' ? 'Criar coluna' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Mover / Copiar cartão ────────────────────────────────────────────────────

interface CardColumnActionModalProps {
  mode: 'move' | 'copy';
  cardTitle: string;
  currentColumnId: string;
  columns: KanbanColumn[];
  onClose: () => void;
  onConfirm: (columnId: string, title?: string) => void | Promise<void>;
  saving?: boolean;
}

function CardColumnActionModal({
  mode,
  cardTitle,
  currentColumnId,
  columns,
  onClose,
  onConfirm,
  saving,
}: CardColumnActionModalProps) {
  const [columnId, setColumnId] = useState(currentColumnId);
  const [title, setTitle] = useState(cardTitle);

  const columnOptions = useMemo(
    () =>
      columns.map((column) => ({
        value: column.id,
        label: column.title,
        searchText: column.title,
      })),
    [columns],
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={mode === 'move' ? 'Mover cartão' : 'Copiar cartão'}
      closeOnOverlayClick={!saving}
    >
      <div className="space-y-4">
        {mode === 'copy' ? (
          <div>
            <label className={kanbanLabel}>Nome</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do cartão..."
              className={kanbanInput}
            />
          </div>
        ) : null}
        <div>
          <label className={kanbanLabel}>Lista</label>
          <StringSingleSelectDropdown
            value={columnId}
            onChange={setColumnId}
            options={columnOptions}
            allowEmpty={false}
            placeholder="Selecione a coluna..."
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-2 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            className="!bg-red-600 hover:!bg-red-700 !text-white border-transparent focus-visible:ring-red-500"
            onClick={async () => {
              if (!columnId) {
                toast.error('Selecione uma coluna');
                return;
              }
              if (mode === 'copy' && !title.trim()) {
                toast.error('Nome é obrigatório');
                return;
              }
              await onConfirm(columnId, mode === 'copy' ? title.trim() : undefined);
            }}
          >
            {mode === 'move' ? 'Mover' : 'Copiar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Drag State ───────────────────────────────────────────────────────────────

interface DragState {
  draggingCardId: string | null;
  fromColumnId: string | null;
  overColumnId: string | null;
  overIndex: number | null;
}

interface ColumnDragState {
  draggingColumnId: string | null;
  overIndex: number | null;
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ columns }: { columns: KanbanColumn[] }) {
  const total = columns.reduce((s, c) => s + c.cards.length, 0);
  const done = columns.find((c) => c.title === 'Completed')?.cards.length ?? 0;
  const overdue = columns.flatMap((c) => c.cards).filter((card) => isOverdue(card.endDate)).length;
  const inProgress = columns.find((c) => c.title === 'Active')?.cards.length ?? 0;

  const stats = [
    { label: 'Total de Cards', value: total, icon: <LayoutGrid className="w-4 h-4" />, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700' },
    { label: 'Em Andamento', value: inProgress, icon: <Loader className="w-4 h-4" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Concluídos', value: done, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Atrasados', value: overdue, icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl', s.bg)}>
          <span className={s.color}>{s.icon}</span>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Board picker row actions ─────────────────────────────────────────────────

function KanbanBoardRowActions({
  board,
  active,
  onShare,
  onEditName,
  onDeleteBoard,
  onClosePicker,
}: {
  board: KanbanBoardSummary;
  active: boolean;
  onShare: (board: KanbanBoardSummary) => void;
  onEditName: (board: KanbanBoardSummary) => void;
  onDeleteBoard: (board: KanbanBoardSummary) => void;
  onClosePicker: () => void;
}) {
  const canManage = Boolean(board.isCustom && board.isOwner && board.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-kanban-board-row-menu]')) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  const triggerClass = clsx(
    'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
    active
      ? 'text-red-500/80 hover:bg-red-100/70 hover:text-red-600 dark:text-red-300/80 dark:hover:bg-red-900/40 dark:hover:text-red-200'
      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200',
  );

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManage) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 176;
    const menuHeight = 140;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8;

    setMenuStyle({
      position: 'fixed',
      left: Math.max(8, rect.right - menuWidth),
      top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      width: menuWidth,
      zIndex: 9999,
    });
    setMenuOpen((v) => !v);
  };

  if (!canManage) {
    return <span className="inline-block h-8 w-8 shrink-0" aria-hidden />;
  }

  const runMenuAction = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    action();
  };

  const menu =
    menuOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-kanban-board-row-menu
            role="menu"
            style={menuStyle}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onMouseDown={runMenuAction(() => {
                onShare(board);
                onClosePicker();
              })}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Users className="h-4 w-4 shrink-0" />
              Compartilhar
            </button>
            <button
              type="button"
              role="menuitem"
              onMouseDown={runMenuAction(() => {
                onEditName(board);
                onClosePicker();
              })}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Edit3 className="h-4 w-4 shrink-0" />
              Editar
            </button>
            <hr className="my-1 border-gray-200 dark:border-gray-700" />
            <button
              type="button"
              role="menuitem"
              onMouseDown={runMenuAction(() => {
                onDeleteBoard(board);
                onClosePicker();
              })}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              Excluir
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Opções do quadro"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={openMenu}
        className={triggerClass}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanBoardPicker({
  boards,
  currentDepartmentKey,
  defaultDepartmentKey,
  canCreateBoard,
  onSelect,
  onSetDefault,
  onCreateBoard,
  onShare,
  onEditName,
  onDeleteBoard,
}: {
  boards: KanbanBoardSummary[];
  currentDepartmentKey?: string;
  defaultDepartmentKey?: string | null;
  canCreateBoard?: boolean;
  onSelect: (departmentKey: string) => void;
  onSetDefault: (departmentKey: string) => void;
  onCreateBoard: () => void;
  onShare: (board: KanbanBoardSummary) => void;
  onEditName: (board: KanbanBoardSummary) => void;
  onDeleteBoard: (board: KanbanBoardSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-kanban-board-row-menu]')) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Quadros"
        title="Quadros"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
            {boards.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                Nenhum quadro disponível.
              </p>
            ) : (
              <div className="space-y-1">
              {boards.map((b) => {
                const active = b.departmentKey === currentDepartmentKey;
                const isDefault = defaultDepartmentKey === b.departmentKey;
                return (
                  <div
                    key={b.id || b.departmentKey}
                    className={clsx(
                      'flex min-h-10 items-center rounded-lg px-2 transition-colors',
                      active
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60',
                    )}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setOpen(false);
                        if (!active) onSelect(b.departmentKey);
                      }}
                      className={clsx(
                        'min-w-0 flex-1 truncate py-2 pr-2 text-left text-sm',
                        active && 'font-medium',
                      )}
                    >
                      {b.department}
                    </button>
                    <div className="flex shrink-0 items-center">
                      <KanbanBoardRowActions
                        board={b}
                        active={active}
                        onShare={onShare}
                        onEditName={onEditName}
                        onDeleteBoard={onDeleteBoard}
                        onClosePicker={() => setOpen(false)}
                      />
                      <button
                        type="button"
                        title={isDefault ? 'Quadro padrão' : 'Definir como padrão'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isDefault) onSetDefault(b.departmentKey);
                        }}
                        className={clsx(
                          'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                          isDefault
                            ? 'text-amber-500 dark:text-amber-400'
                            : active
                              ? 'text-red-400/70 hover:bg-red-100/70 hover:text-amber-500 dark:text-red-300/70 dark:hover:bg-red-900/40 dark:hover:text-amber-400'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-amber-500 dark:hover:bg-gray-700 dark:hover:text-amber-400',
                        )}
                      >
                        <Star className={clsx('h-4 w-4', isDefault && 'fill-current')} />
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>
          {canCreateBoard !== false ? (
          <div className="border-t border-gray-100 p-2 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateBoard();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Novo Quadro
            </button>
          </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function KanbanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const departmentKeyParam = searchParams?.get('departmentKey') ?? null;
  const legacyListParam =
    searchParams?.get('list') === '1' || searchParams?.get('list') === 'true';

  const {
    isAdministrator,
    canViewKanbanValues,
    isLoading: loadingPerms,
    user: meUser,
  } = usePermissions();
  const isResolvingEntry = !departmentKeyParam && !!meUser && !loadingPerms;
  const loadingUser = loadingPerms;

  const userDepartment = meUser?.employee?.department ?? '';
  const boardScopeKey = departmentKeyParam ?? userDepartment;
  const kanbanBoardQueryKey = ['kanban-board', boardScopeKey] as const;

  const { data: boardsList, isLoading: loadingBoardsList } = useQuery({
    queryKey: ['kanban-boards'],
    queryFn: fetchKanbanBoards,
    enabled: !!meUser,
    staleTime: 30 * 1000,
  });

  const [defaultBoardRev, setDefaultBoardRev] = useState(0);

  const defaultDepartmentKey = useMemo(() => {
    if (!meUser?.id || !boardsList?.length) return null;
    void defaultBoardRev;
    return resolveKanbanDefaultBoard(meUser.id, boardsList);
  }, [meUser?.id, boardsList, defaultBoardRev]);

  const setAsDefaultBoard = useCallback(
    (departmentKey: string) => {
      if (!meUser?.id || !boardsList?.length) return;
      const ownDeptKey = boardsList.find((b) => b.isOwnDepartment)?.departmentKey;
      if (departmentKey === ownDeptKey) {
        clearKanbanDefaultBoard(meUser.id);
      } else {
        saveKanbanDefaultBoard(meUser.id, departmentKey);
      }
      setDefaultBoardRev((n) => n + 1);
      toast.success('Este quadro abrirá por padrão ao entrar em Tasks');
    },
    [meUser?.id, boardsList],
  );

  useEffect(() => {
    if (legacyListParam) {
      router.replace('/ponto/kanban');
    }
  }, [legacyListParam, router]);

  useEffect(() => {
    if (!meUser || loadingBoardsList || boardsList === undefined) return;
    if (departmentKeyParam || legacyListParam) return;

    const targetKey = resolveKanbanDefaultBoard(meUser.id, boardsList);
    if (targetKey) {
      router.replace(`/ponto/kanban?departmentKey=${encodeURIComponent(targetKey)}`);
    }
  }, [
    meUser,
    loadingBoardsList,
    boardsList,
    departmentKeyParam,
    legacyListParam,
    router,
  ]);

  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [renameBoardTarget, setRenameBoardTarget] = useState<{
    boardId: string;
    name: string;
  } | null>(null);
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [boardDeleteTarget, setBoardDeleteTarget] = useState<KanbanBoardSummary | null>(null);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [shareTarget, setShareTarget] = useState<{
    boardId: string;
    boardName: string;
  } | null>(null);

  const { data: board, isLoading: loadingBoard, isError: boardError } = useQuery({
    queryKey: kanbanBoardQueryKey,
    queryFn: () => fetchKanbanBoard(departmentKeyParam ?? undefined),
    enabled: !!meUser && !!departmentKeyParam,
    staleTime: 30 * 1000,
  });

  const boardReadOnly = board?.canWrite === false;

  const openBoard = useCallback(
    (departmentKey: string) => {
      router.push(`/ponto/kanban?departmentKey=${encodeURIComponent(departmentKey)}`);
    },
    [router],
  );

  const handleCreateBoard = useCallback(
    async (name: string) => {
      setCreatingBoard(true);
      try {
        const created = await createKanbanBoard(name);
        await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
        setCreateBoardOpen(false);
        toast.success('Quadro criado');
        openBoard(created.departmentKey);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Erro ao criar quadro';
        toast.error(msg);
      } finally {
        setCreatingBoard(false);
      }
    },
    [openBoard, queryClient],
  );

  const handleRenameBoard = useCallback(
    async (name: string) => {
      if (!renameBoardTarget) return;
      setRenamingBoard(true);
      try {
        await updateKanbanBoard(renameBoardTarget.boardId, name);
        await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
        await queryClient.invalidateQueries({ queryKey: kanbanBoardQueryKey });
        setRenameBoardTarget(null);
        toast.success('Nome do quadro atualizado');
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Erro ao renomear quadro';
        toast.error(msg);
      } finally {
        setRenamingBoard(false);
      }
    },
    [queryClient, kanbanBoardQueryKey, renameBoardTarget],
  );

  const handleDeleteBoard = useCallback(async () => {
    if (!boardDeleteTarget?.id || !meUser) return;
    setDeletingBoard(true);
    try {
      await deleteKanbanBoard(boardDeleteTarget.id);
      if (getKanbanDefaultBoard(meUser.id) === boardDeleteTarget.departmentKey) {
        clearKanbanDefaultBoard(meUser.id);
      }
      const remaining = (boardsList ?? []).filter(
        (b) => b.departmentKey !== boardDeleteTarget.departmentKey,
      );
      await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
      setBoardDeleteTarget(null);
      toast.success('Quadro excluído');
      if (departmentKeyParam === boardDeleteTarget.departmentKey) {
        const nextKey = resolveKanbanDefaultBoard(meUser.id, remaining);
        if (nextKey) openBoard(nextKey);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Erro ao excluir quadro';
      toast.error(msg);
    } finally {
      setDeletingBoard(false);
    }
  }, [boardDeleteTarget, meUser, boardsList, queryClient, departmentKeyParam, openBoard]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const columns = board?.columns ?? [];
  const boardLabelPresets = getKanbanLabelPalette(board?.labelPresets);
  const labelFilterAllValues = boardLabelPresets.map((p) => p.color);

  const [search, setSearch] = useState('');
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterLabelColors, setFilterLabelColors] = useState<string[]>([]);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const hasActiveKanbanFilters =
    isMultiselectFilterActive(filterPriorities, KANBAN_PRIORITY_ALL_VALUES) ||
    isMultiselectFilterActive(filterLabelColors, labelFilterAllValues);
  const [savingColumn, setSavingColumn] = useState(false);

  const [cardModal, setCardModal] = useState<
    | { mode: 'create'; columnId: string }
    | {
        mode: 'detail';
        cardId: string;
        columnId: string;
        initialCard: KanbanCard;
        initialColumn?: { title: string; color: string };
      }
    | null
  >(null);
  const [colModal, setColModal] = useState<{ mode: 'create' | 'edit'; column?: KanbanColumn } | null>(null);
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);
  const [savingLabelPresets, setSavingLabelPresets] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'card'; cardId: string; columnId: string } | { type: 'column'; columnId: string } | null>(null);
  const [cardColumnAction, setCardColumnAction] = useState<
    | { mode: 'move'; cardId: string; columnId: string; title: string }
    | { mode: 'copy'; cardId: string; columnId: string; title: string }
    | null
  >(null);
  const [cardColumnActionSaving, setCardColumnActionSaving] = useState(false);

  const [dragState, setDragState] = useState<DragState>({
    draggingCardId: null,
    fromColumnId: null,
    overColumnId: null,
    overIndex: null,
  });
  const [columnDrag, setColumnDrag] = useState<ColumnDragState>({
    draggingColumnId: null,
    overIndex: null,
  });
  const dragRef = useRef(dragState);
  const columnDragRef = useRef(columnDrag);
  const columnDropHandledRef = useRef(false);
  const columnDragIdRef = useRef<string | null>(null);
  const columnDragOverIndexRef = useRef<number | null>(null);
  const columnDragGhostRef = useRef<HTMLElement | null>(null);
  const boardCardsRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const isKanbanDragging = Boolean(dragState.draggingCardId || columnDrag.draggingColumnId);
  useKanbanDragScrollAssist(isKanbanDragging, boardScrollRef);
  useEffect(() => {
    dragRef.current = dragState;
  }, [dragState]);
  useEffect(() => {
    columnDragRef.current = columnDrag;
  }, [columnDrag]);

  const refreshBoard = useCallback(
    () => queryClient.refetchQueries({ queryKey: kanbanBoardQueryKey }),
    [queryClient, kanbanBoardQueryKey],
  );

  const patchBoardCard = useCallback(
    (targetCardId: string, patch: KanbanBoardCardChecklistPatch) => {
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        patchCardInBoardCache(old, targetCardId, patch),
      );
    },
    [queryClient, kanbanBoardQueryKey],
  );

  const prefetchKanbanCard = useCallback(
    (cardId: string) => {
      void queryClient.prefetchQuery({
        queryKey: kanbanCardQueryKey(cardId),
        queryFn: () => fetchKanbanCard(cardId),
        staleTime: 60_000,
      });
    },
    [queryClient],
  );

  const handleDragStart = useCallback((e: React.DragEvent, cardId: string, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    columnDragIdRef.current = null;
    columnDragOverIndexRef.current = null;
    setColumnDrag({ draggingColumnId: null, overIndex: null });
    setDragState({ draggingCardId: cardId, fromColumnId: columnId, overColumnId: null, overIndex: null });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggingCardId: null, fromColumnId: null, overColumnId: null, overIndex: null });
  }, []);

  const handleColumnDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', columnId);
      e.stopPropagation();
      setKanbanColumnDragGhost(e, columnDragGhostRef);
      columnDropHandledRef.current = false;
      columnDragIdRef.current = columnId;
      columnDragOverIndexRef.current = null;
      setDragState({ draggingCardId: null, fromColumnId: null, overColumnId: null, overIndex: null });
      setColumnDrag({ draggingColumnId: columnId, overIndex: null });
    },
    [],
  );

  const handleColumnDragEnd = useCallback(() => {
    columnDragGhostRef.current?.remove();
    columnDragGhostRef.current = null;
    window.setTimeout(() => {
      if (!columnDropHandledRef.current) {
        columnDragIdRef.current = null;
        columnDragOverIndexRef.current = null;
        setColumnDrag({ draggingColumnId: null, overIndex: null });
      }
      columnDropHandledRef.current = false;
    }, 0);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!columnDragIdRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    columnDragOverIndexRef.current = index;
    setColumnDrag((prev) =>
      prev.overIndex === index ? prev : { ...prev, overIndex: index },
    );
  }, []);

  const handleColumnDrop = useCallback(
    async (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      columnDropHandledRef.current = true;
      const draggingColumnId = columnDragIdRef.current;
      const overIndex = columnDragOverIndexRef.current ?? columnDragRef.current.overIndex;
      columnDragIdRef.current = null;
      columnDragOverIndexRef.current = null;
      setColumnDrag({ draggingColumnId: null, overIndex: null });
      if (!draggingColumnId) return;

      const rawIndex = targetIndex ?? overIndex ?? columns.length;
      const desiredPosition = resolveColumnInsertIndex(columns, draggingColumnId, rawIndex);
      const currentIndex = columns.findIndex((col) => col.id === draggingColumnId);
      if (currentIndex === desiredPosition) return;

      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const beforeColumnRects = boardCardsRef.current
        ? captureKanbanReorderRects(boardCardsRef.current, 'data-kanban-column-id')
        : new Map<string, DOMRect>();

      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        moveColumnInBoardCache(old, draggingColumnId, rawIndex),
      );
      scheduleKanbanReorderAnimation(
        boardCardsRef.current,
        beforeColumnRects,
        'data-kanban-column-id',
        'kanban-column-reordering',
      );

      try {
        await updateKanbanColumn(draggingColumnId, { position: desiredPosition });
        await new Promise((resolve) => {
          window.setTimeout(resolve, KANBAN_REORDER_MS + 60);
        });
        await refreshBoard();
        toast.success('Coluna movida!', { duration: 1500 });
      } catch {
        if (previousBoard !== undefined) {
          queryClient.setQueryData(kanbanBoardQueryKey, previousBoard);
        } else {
          await refreshBoard();
        }
        toast.error('Não foi possível mover a coluna');
      }
    },
    [columns, queryClient, kanbanBoardQueryKey, refreshBoard],
  );

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string, index?: number) => {
    if (columnDragRef.current.draggingColumnId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState((prev) =>
      prev.overColumnId === columnId && prev.overIndex === (index ?? null)
        ? prev
        : { ...prev, overColumnId: columnId, overIndex: index ?? null },
    );
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetColumnId: string, targetIndex?: number) => {
      e.preventDefault();
      if (columnDragRef.current.draggingColumnId) return;
      const { draggingCardId, fromColumnId, overIndex } = dragRef.current;
      setDragState({ draggingCardId: null, fromColumnId: null, overColumnId: null, overIndex: null });
      if (!draggingCardId || !fromColumnId) return;

      const targetColumn = columns.find((col) => col.id === targetColumnId);
      if (!targetColumn) return;

      const rawDropIndex = targetIndex ?? overIndex ?? targetColumn.cards.length;
      const desiredPosition = resolveKanbanInsertIndex(
        targetColumn.cards,
        draggingCardId,
        fromColumnId,
        targetColumnId,
        rawDropIndex,
      );

      const currentIndex = targetColumn.cards.findIndex((card) => card.id === draggingCardId);
      if (fromColumnId === targetColumnId && currentIndex === desiredPosition) {
        return;
      }

      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const beforeRects = boardCardsRef.current
        ? captureKanbanReorderRects(boardCardsRef.current, 'data-kanban-card-id')
        : new Map<string, DOMRect>();

      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        moveCardInBoardCache(
          old,
          draggingCardId,
          fromColumnId,
          targetColumnId,
          rawDropIndex,
        ),
      );
      scheduleKanbanReorderAnimation(
        boardCardsRef.current,
        beforeRects,
        'data-kanban-card-id',
        'kanban-card-reordering',
      );

      try {
        await updateKanbanCard(draggingCardId, {
          ...(fromColumnId !== targetColumnId ? { columnId: targetColumnId } : {}),
          position: desiredPosition,
        });
        await new Promise((resolve) => {
          window.setTimeout(resolve, KANBAN_REORDER_MS + 60);
        });
        await refreshBoard();
        toast.success('Card movido!', { duration: 1500 });
      } catch {
        if (previousBoard !== undefined) {
          queryClient.setQueryData(kanbanBoardQueryKey, previousBoard);
        } else {
          await refreshBoard();
        }
        toast.error('Não foi possível mover o card');
      }
    },
    [columns, queryClient, kanbanBoardQueryKey, refreshBoard],
  );

  function openCreateCard(columnId: string) {
    setCardModal({ mode: 'create', columnId });
  }

  function openEditCard(card: KanbanCard, columnId: string) {
    prefetchKanbanCard(card.id);
    const column = columns.find((col) => col.id === columnId);
    setCardModal({
      mode: 'detail',
      cardId: card.id,
      columnId,
      initialCard: card,
      initialColumn: column
        ? { title: column.title, color: column.color }
        : undefined,
    });
  }

  function handleDeleteCard(cardId: string, columnId: string) {
    setDeleteConfirm({ type: 'card', cardId, columnId });
  }

  function openMoveCard(card: KanbanCard, columnId: string) {
    setCardColumnAction({
      mode: 'move',
      cardId: card.id,
      columnId,
      title: card.title,
    });
  }

  function openCopyCard(card: KanbanCard, columnId: string) {
    setCardColumnAction({
      mode: 'copy',
      cardId: card.id,
      columnId,
      title: card.title,
    });
  }

  async function confirmCardColumnAction(targetColumnId: string, title?: string) {
    if (!cardColumnAction) return;
    setCardColumnActionSaving(true);
    try {
      if (cardColumnAction.mode === 'move') {
        await updateKanbanCard(cardColumnAction.cardId, {
          columnId: targetColumnId,
          position: 0,
        });
        await refreshBoard();
        toast.success('Card movido!');
      } else {
        await duplicateKanbanCard(cardColumnAction.cardId, {
          columnId: targetColumnId,
          title,
        });
        await refreshBoard();
        toast.success('Card copiado!');
      }
      setCardColumnAction(null);
    } catch {
      toast.error(
        cardColumnAction.mode === 'move' ? 'Erro ao mover card' : 'Erro ao copiar card',
      );
    } finally {
      setCardColumnActionSaving(false);
    }
  }

  async function confirmDeleteCard() {
    if (deleteConfirm?.type !== 'card') return;
    try {
      await deleteKanbanCard(deleteConfirm.cardId);
      await refreshBoard();
      toast.success('Card removido');
      setDeleteConfirm(null);
    } catch {
      toast.error('Erro ao remover card');
    }
  }

  async function handleSaveColumn(title: string, color: string, limit: number | undefined, id?: string) {
    setSavingColumn(true);
    try {
      if (colModal?.mode === 'create') {
        await createKanbanColumn({ title, color, cardLimit: limit, boardId: board?.id });
        toast.success('Coluna criada!');
      } else if (id) {
        await updateKanbanColumn(id, { title, color, cardLimit: limit ?? null });
        toast.success('Coluna atualizada!');
      }
      await refreshBoard();
      setColModal(null);
    } catch {
      toast.error('Erro ao salvar coluna');
    } finally {
      setSavingColumn(false);
    }
  }

  function handleDeleteColumn(columnId: string) {
    setDeleteConfirm({ type: 'column', columnId });
  }

  async function confirmDeleteColumn() {
    if (deleteConfirm?.type !== 'column') return;
    try {
      await deleteKanbanColumn(deleteConfirm.columnId);
      await refreshBoard();
      toast.success('Coluna removida');
      setDeleteConfirm(null);
    } catch {
      toast.error('Erro ao remover coluna');
    }
  }

  const priorityFilterOptions = KANBAN_PRIORITY_ALL_VALUES.map((p) => ({
    value: p,
    label: PRIORITY_CONFIG[p].label,
  }));
  const labelFilterOptions = boardLabelPresets.map((preset) => ({
    value: preset.color,
    label: preset.name,
    swatchColor: preset.color,
  }));

  const filteredColumns = columns.map((col) => ({
    ...col,
    cards: col.cards.filter(card => {
      const matchSearch = !search || card.title.toLowerCase().includes(search.toLowerCase()) || card.description.toLowerCase().includes(search.toLowerCase()) || card.assignee.toLowerCase().includes(search.toLowerCase());
      const matchPriority =
        multiselectFilterShowsAll(filterPriorities, KANBAN_PRIORITY_ALL_VALUES) ||
        filterPriorities.includes(card.priority);
      const matchLabel =
        multiselectFilterShowsAll(filterLabelColors, labelFilterAllValues) ||
        normalizeKanbanLabels(card.labels, boardLabelPresets).some((l) =>
          filterLabelColors.some(
            (c) => l.color.trim().toLowerCase() === c.trim().toLowerCase(),
          ),
        );
      return matchSearch && matchPriority && matchLabel;
    })
  }));

  if (loadingUser || loadingPerms) {
    return <Loading message="Carregando Tasks..." fullScreen size="lg" />;
  }

  const waitingForBoards = loadingBoardsList || boardsList === undefined;
  const waitingForEntryRoute = isResolvingEntry && waitingForBoards;
  const waitingForBoard = !!departmentKeyParam && loadingBoard;

  if (waitingForEntryRoute || waitingForBoard) {
    return <Loading message="Carregando Tasks..." fullScreen size="lg" />;
  }

  if (isResolvingEntry && !departmentKeyParam) {
    return <Loading message="Carregando Tasks..." fullScreen size="lg" />;
  }

  if (!meUser) {
    return <Loading message="Verificando sessão..." fullScreen size="lg" />;
  }

  const user = meUser;

  if (boardError) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="px-4 py-12 text-center text-gray-600 dark:text-gray-400">
          Não foi possível carregar o quadro. Tente atualizar a página.
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="flex flex-col -mx-2 sm:-mx-4">
        {/* ── Page Header ── */}
        <div className="mb-4 flex-shrink-0 space-y-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tasks</h1>
              {board?.department && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <span>{board.department}</span>
                    {boardReadOnly && (
                      <span title="Somente leitura" className="inline-flex">
                        <Eye
                          className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                          aria-hidden
                        />
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <KanbanBoardPicker
                boards={boardsList ?? []}
                currentDepartmentKey={board?.departmentKey}
                defaultDepartmentKey={defaultDepartmentKey}
                canCreateBoard={!isAdministrator}
                onSelect={openBoard}
                onSetDefault={setAsDefaultBoard}
                onCreateBoard={() => setCreateBoardOpen(true)}
                onShare={(b) =>
                  setShareTarget({ boardId: b.id, boardName: b.department })
                }
                onEditName={(b) =>
                  setRenameBoardTarget({ boardId: b.id, name: b.department })
                }
                onDeleteBoard={setBoardDeleteTarget}
              />
              {/* Search */}
              <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar cards..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 outline-none transition-colors hover:bg-gray-100 hover:text-gray-600 focus:ring-0 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {/* Filter */}
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(true)}
                className={clsx(
                  'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none focus:ring-0',
                  hasActiveKanbanFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
                )}
                aria-label="Abrir filtro"
                title={hasActiveKanbanFilters ? 'Filtro (ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveKanbanFilters && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                )}
              </button>
              {!boardReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => setLabelSettingsOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title="Configurar etiquetas deste setor"
                  >
                    <Tag className="w-4 h-4" />
                    Etiquetas
                  </button>
                  <button
                    onClick={() => setColModal({ mode: 'create' })}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Coluna
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Board ── */}
        <div
          ref={boardScrollRef}
          className="scrollbar-hide overflow-x-auto pb-4 rounded-2xl bg-[#F3F4F6] dark:bg-gray-900/40 px-4 py-5"
        >
          <div
            ref={boardCardsRef}
            className="flex gap-5 items-start"
            style={{ minWidth: 'max-content' }}
            onDragOverCapture={
              boardReadOnly
                ? undefined
                : (e) => {
                    if (!columnDragIdRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
            }
          >
            {filteredColumns.map((column, columnIndex) => (
              <React.Fragment key={column.id}>
                {!boardReadOnly &&
                  columnDrag.draggingColumnId &&
                  columnDrag.overIndex === columnIndex && (
                  <KanbanColumnDropGutter
                    active
                    onDragOver={(e) => handleColumnDragOver(e, columnIndex)}
                    onDrop={(e) => handleColumnDrop(e, columnIndex)}
                  />
                )}
                <div
                  data-kanban-column-id={column.id}
                  className="kanban-column-slot flex shrink-0"
                  onDragOverCapture={
                    boardReadOnly
                      ? undefined
                      : (e) => {
                          if (!columnDragIdRef.current) return;
                          const target = e.target;
                          if (!(target instanceof Node) || !e.currentTarget.contains(target)) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          handleColumnDragOver(
                            e,
                            resolveColumnDropIndex(columnIndex, e.clientX, rect),
                          );
                        }
                  }
                  onDropCapture={
                    boardReadOnly
                      ? undefined
                      : (e) => {
                          if (!columnDragIdRef.current) return;
                          const target = e.target;
                          if (!(target instanceof Node) || !e.currentTarget.contains(target)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          void handleColumnDrop(
                            e,
                            resolveColumnDropIndex(columnIndex, e.clientX, rect),
                          );
                        }
                  }
                >
                  <KanbanColumnComponent
                    column={column}
                    labelPresets={boardLabelPresets}
                    dragState={dragState}
                    isColumnDragging={columnDrag.draggingColumnId === column.id}
                    isColumnDragActive={!!columnDrag.draggingColumnId}
                    readOnly={boardReadOnly}
                    onAddCard={openCreateCard}
                    onEditCard={openEditCard}
                    onMoveCard={openMoveCard}
                    onCopyCard={openCopyCard}
                    onDeleteCard={handleDeleteCard}
                    onPrefetchCard={prefetchKanbanCard}
                    onColumnDragStart={boardReadOnly ? undefined : handleColumnDragStart}
                    onColumnDragEnd={handleColumnDragEnd}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onEditColumn={(col) => setColModal({ mode: 'edit', column: col })}
                    onDeleteColumn={handleDeleteColumn}
                  />
                </div>
              </React.Fragment>
            ))}
            {!boardReadOnly &&
              columnDrag.draggingColumnId &&
              columnDrag.overIndex === filteredColumns.length && (
              <KanbanColumnDropGutter
                active
                onDragOver={(e) => handleColumnDragOver(e, filteredColumns.length)}
                onDrop={(e) => handleColumnDrop(e, filteredColumns.length)}
              />
            )}

            {!boardReadOnly && (
              <button
                onClick={() => setColModal({ mode: 'create' })}
                className="flex-shrink-0 w-[340px] flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-gray-300/80 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:bg-red-50 dark:group-hover:bg-red-900/20 flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Nova Coluna</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        title="Filtros"
        size="md"
      >
        <div className="space-y-4">
          <MultiSelectSearchDropdown
            label="Prioridade"
            options={priorityFilterOptions}
            selected={filterPriorities}
            onChange={setFilterPriorities}
            placeholder="Todas as prioridades"
            searchPlaceholder="Pesquisar prioridade..."
            emptyOptionsMessage="Nenhuma prioridade disponível."
            emptySearchMessage="Nenhuma prioridade encontrada."
            icon={<Flag className="h-4 w-4" aria-hidden />}
            menuInline
            noFocusRing
          />
          <MultiSelectSearchDropdown
            label="Etiquetas"
            options={labelFilterOptions}
            selected={filterLabelColors}
            onChange={setFilterLabelColors}
            placeholder="Todas as etiquetas"
            searchPlaceholder="Pesquisar etiqueta..."
            emptyOptionsMessage="Nenhuma etiqueta configurada neste setor."
            emptySearchMessage="Nenhuma etiqueta encontrada."
            icon={<Tag className="h-4 w-4" aria-hidden />}
            menuInline
            noFocusRing
          />
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setFilterPriorities([]);
                setFilterLabelColors([]);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 outline-none transition-colors hover:bg-gray-50 focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersModalOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 outline-none transition-colors hover:bg-red-100 focus:ring-0 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {labelSettingsOpen && board && (
        <Modal
          isOpen
          onClose={() => !savingLabelPresets && setLabelSettingsOpen(false)}
          size="md"
          title="Etiquetas do setor"
          closeOnOverlayClick={!savingLabelPresets}
        >
          <KanbanBoardLabelSettings
            initialPresets={[...boardLabelPresets]}
            departmentLabel={board.department}
            saving={savingLabelPresets}
            onClose={() => setLabelSettingsOpen(false)}
            onSave={async (presets) => {
              setSavingLabelPresets(true);
              try {
                const updated = await updateKanbanBoardLabelPresets(
                  presets,
                  departmentKeyParam ?? undefined,
                );
                queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (prev) =>
                  prev ? { ...prev, labelPresets: updated } : prev,
                );
                toast.success('Etiquetas do setor atualizadas');
              } catch (err: unknown) {
                const msg =
                  err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data
                        ?.message
                    : null;
                toast.error(msg || 'Não foi possível salvar as etiquetas');
                throw err;
              } finally {
                setSavingLabelPresets(false);
              }
            }}
          />
        </Modal>
      )}

      {cardModal && (
        <KanbanCardModal
          mode={cardModal.mode}
          cardId={cardModal.mode === 'detail' ? cardModal.cardId : undefined}
          columnId={cardModal.columnId}
          initialCard={cardModal.mode === 'detail' ? cardModal.initialCard : undefined}
          initialColumn={cardModal.mode === 'detail' ? cardModal.initialColumn : undefined}
          labelPresets={[...boardLabelPresets]}
          currentUserId={meUser?.id}
          currentUser={
            meUser
              ? {
                  id: meUser.id,
                  name: meUser.name,
                  email: meUser.email ?? '',
                  profilePhotoUrl: meUser.profilePhotoUrl ?? null,
                }
              : null
          }
          canViewKanbanValues={canViewKanbanValues}
          onClose={() => setCardModal(null)}
          onBoardRefresh={refreshBoard}
          onBoardCardPatch={patchBoardCard}
        />
      )}

      {colModal && (
        <ColumnModal
          mode={colModal.mode}
          initial={colModal.column}
          onClose={() => setColModal(null)}
          onSave={handleSaveColumn}
          saving={savingColumn}
        />
      )}

      {cardColumnAction && (
        <CardColumnActionModal
          key={`${cardColumnAction.mode}-${cardColumnAction.cardId}`}
          mode={cardColumnAction.mode}
          cardTitle={cardColumnAction.title}
          currentColumnId={cardColumnAction.columnId}
          columns={columns}
          onClose={() => !cardColumnActionSaving && setCardColumnAction(null)}
          onConfirm={confirmCardColumnAction}
          saving={cardColumnActionSaving}
        />
      )}

      {deleteConfirm && (
        <Modal
          isOpen
          onClose={() => setDeleteConfirm(null)}
          size="sm"
          title="Confirmar exclusão"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {deleteConfirm.type === 'card'
              ? 'Excluir este card permanentemente? Esta ação não pode ser desfeita.'
              : 'Excluir a coluna e todos os cards dentro dela? Esta ação não pode ser desfeita.'}
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={deleteConfirm.type === 'card' ? confirmDeleteCard : confirmDeleteColumn}
            >
              Excluir
            </Button>
          </div>
        </Modal>
      )}

      <KanbanCreateBoardModal
        isOpen={createBoardOpen}
        onClose={() => setCreateBoardOpen(false)}
        onSubmit={handleCreateBoard}
        saving={creatingBoard}
      />

      <KanbanCreateBoardModal
        isOpen={!!renameBoardTarget}
        onClose={() => !renamingBoard && setRenameBoardTarget(null)}
        onSubmit={handleRenameBoard}
        saving={renamingBoard}
        title="Renomear quadro"
        submitLabel="Salvar"
        initialName={renameBoardTarget?.name ?? ''}
        hint=""
      />

      {boardDeleteTarget && (
        <Modal
          isOpen
          onClose={() => !deletingBoard && setBoardDeleteTarget(null)}
          size="sm"
          title="Excluir quadro"
        >
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Excluir o quadro <strong>{boardDeleteTarget.department}</strong> permanentemente?
            Todas as colunas e cards serão removidos. Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBoardDeleteTarget(null)}
              disabled={deletingBoard}
            >
              Cancelar
            </Button>
            <Button type="button" variant="error" onClick={handleDeleteBoard} disabled={deletingBoard}>
              {deletingBoard ? 'Excluindo…' : 'Excluir quadro'}
            </Button>
          </div>
        </Modal>
      )}

      {shareTarget && (
        <KanbanBoardShareModal
          isOpen
          onClose={() => setShareTarget(null)}
          boardId={shareTarget.boardId}
          boardName={shareTarget.boardName}
          currentUserId={meUser?.id}
          ownerUser={
            meUser
              ? {
                  id: meUser.id,
                  name: meUser.name,
                  email: meUser.email ?? '',
                  profilePhotoUrl: meUser.profilePhotoUrl ?? null,
                }
              : null
          }
        />
      )}
    </MainLayout>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function KanbanPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <KanbanPage />
    </Suspense>
  );
}
