'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { KanbanCardModal } from '@/components/kanban/KanbanCardModal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  kanbanLabel,
  kanbanInput,
  kanbanInputNumber,
} from '@/components/kanban/kanbanFormStyles';
import api from '@/lib/api';
import {
  type Priority,
  type KanbanCard,
  type KanbanColumn,
  type KanbanBoard,
  type KanbanBoardSummary,
  fetchKanbanBoard,
  fetchKanbanBoards,
  createKanbanColumn,
  updateKanbanColumn,
  deleteKanbanColumn,
  updateKanbanCard,
  deleteKanbanCard,
} from '@/lib/kanban';
import { KanbanUserAvatar } from '@/components/kanban/KanbanUserAvatar';
import { KANBAN_PRIORITY_CONFIG } from '@/components/kanban/kanbanPriority';
import { KanbanPriorityBars } from '@/components/kanban/KanbanPriorityBars';
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
  GripVertical,
  AlertCircle,
  ChevronDown,
  Clock,
  Flag,
  Circle,
  CheckCircle2,
  XCircle,
  Loader,
  LayoutGrid,
  SlidersHorizontal,
  ChevronUp,
  Building2,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const PRIORITY_CONFIG = KANBAN_PRIORITY_CONFIG;

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

function moveCardInBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  let movedCard: KanbanCard | undefined;
  const columnsWithoutCard = board.columns.map((col) => {
    if (col.id !== fromColumnId) return col;
    const cards = col.cards.filter((card) => {
      if (card.id === cardId) {
        movedCard = card;
        return false;
      }
      return true;
    });
    return { ...col, cards };
  });

  if (!movedCard) return board;

  return {
    ...board,
    columns: columnsWithoutCard.map((col) =>
      col.id === toColumnId ? { ...col, cards: [...col.cards, movedCard!] } : col,
    ),
  };
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
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{value}%</span>
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
  readOnly?: boolean;
  onEdit: (card: KanbanCard, columnId: string) => void;
  onDelete: (cardId: string, columnId: string) => void;
  onDragStart: (e: React.DragEvent, cardId: string, columnId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function KanbanCardItem({
  card,
  columnId,
  readOnly = false,
  onEdit,
  onDelete,
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
      draggable={!readOnly}
      onDragStart={
        readOnly
          ? undefined
          : (e) => {
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
        'group relative overflow-hidden rounded-2xl border border-transparent bg-white p-4 dark:bg-gray-800',
        'cursor-pointer select-none shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
        'transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'motion-reduce:transition-none',
        'active:cursor-grabbing',
        isDragging
          ? 'z-10 scale-[0.98] opacity-50 shadow-lg'
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
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
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
            <div className="absolute right-0 top-7 z-50 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Edit3 className="w-4 h-4" /> Editar
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
          {card.labels.map((l) => (
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

      <div className="border-t border-gray-100 dark:border-gray-700/80 pt-3 flex items-center justify-between gap-2">
        {card.checklistEnabled && card.totalTasks > 0 ? (
          <>
            <ProgressRing value={card.progress} />
            <span className="flex flex-1 items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <ListChecks className="h-3.5 w-3.5" />
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

// ─── Column Component ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: KanbanColumn;
  dragState: DragState;
  readOnly?: boolean;
  onAddCard: (columnId: string) => void;
  onEditCard: (card: KanbanCard, columnId: string) => void;
  onDeleteCard: (cardId: string, columnId: string) => void;
  onDragStart: (e: React.DragEvent, cardId: string, columnId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, columnId: string, index?: number) => void;
  onDrop: (e: React.DragEvent, columnId: string, index?: number) => void;
  onEditColumn: (column: KanbanColumn) => void;
  onDeleteColumn: (columnId: string) => void;
}

function KanbanColumnComponent({
  column,
  dragState,
  readOnly = false,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEditColumn,
  onDeleteColumn,
}: KanbanColumnProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isTarget = dragState.overColumnId === column.id;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div
      className={clsx(
        'flex flex-col rounded-2xl w-[340px] flex-shrink-0 transition-all duration-200',
        'bg-[#F9FAFB] dark:bg-gray-800/60',
        isTarget && dragState.draggingCardId
          ? 'ring-2 ring-red-400/70 ring-offset-2 dark:ring-red-500/50 dark:ring-offset-gray-900'
          : '',
      )}
      onDragOver={readOnly ? undefined : (e) => onDragOver(e, column.id)}
      onDrop={readOnly ? undefined : (e) => onDrop(e, column.id)}
    >
      <div className="flex items-center justify-between px-4 py-4">
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

      <div className="px-3 pb-4 flex flex-col gap-3 min-h-[120px]">
        {column.cards.map((card) => (
          <KanbanCardItem
            key={card.id}
            card={card}
            columnId={column.id}
            readOnly={readOnly}
            onEdit={onEditCard}
            onDelete={onDeleteCard}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={dragState.draggingCardId === card.id}
          />
        ))}
        {column.cards.length === 0 && (
          <div
            className={clsx(
              'flex flex-col items-center justify-center py-10 rounded-2xl border-2 border-dashed transition-colors',
              isTarget && dragState.draggingCardId
                ? 'border-red-400 bg-red-50/60 dark:border-red-500/70 dark:bg-red-950/25'
                : 'border-gray-200/80 dark:border-gray-600',
            )}
          >
            <p className="text-xs text-gray-400">Solte o card aqui</p>
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

// ─── Drag State ───────────────────────────────────────────────────────────────

interface DragState {
  draggingCardId: string | null;
  fromColumnId: string | null;
  overColumnId: string | null;
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

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanBoardSwitcher({
  boards,
  currentDepartmentKey,
  onSelect,
}: {
  boards: KanbanBoardSummary[];
  currentDepartmentKey?: string;
  onSelect: (departmentKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  if (boards.length === 0) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Trocar setor"
        title="Trocar setor"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-64 min-w-[12rem] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {boards.map((b) => {
            const active = b.departmentKey === currentDepartmentKey;
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) onSelect(b.departmentKey);
                }}
                className={clsx(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'bg-red-50 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60',
                )}
              >
                <span className="truncate">{b.department}</span>
                {b.isOwnDepartment && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    seu
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KanbanBoardList({
  boards,
  onOpen,
}: {
  boards: KanbanBoardSummary[];
  onOpen: (departmentKey: string) => void;
}) {
  if (boards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white/60 dark:bg-gray-800/40 px-6 py-16 text-center">
        <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Nenhum quadro de Tasks foi criado ainda. O quadro de cada setor aparece quando alguém do setor acessa Tasks pela primeira vez.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onOpen(b.departmentKey)}
          className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-red-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-red-800/50"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <Building2 className="h-5 w-5" />
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-red-500 dark:text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{b.department}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {b.columnCount} coluna{b.columnCount !== 1 ? 's' : ''}
            {b.isOwnDepartment ? ' · seu setor' : ''}
          </p>
        </button>
      ))}
    </div>
  );
}

function KanbanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const departmentKeyParam = searchParams?.get('departmentKey') ?? null;

  const {
    canViewAllKanbanBoards,
    isLoading: loadingPerms,
    user: meUser,
  } = usePermissions();
  const showBoardList = canViewAllKanbanBoards && !departmentKeyParam;
  const loadingUser = loadingPerms;

  const userDepartment = meUser?.employee?.department ?? '';
  const boardScopeKey = departmentKeyParam ?? userDepartment;
  const kanbanBoardQueryKey = ['kanban-board', boardScopeKey] as const;

  const { data: boardsList, isLoading: loadingBoardsList } = useQuery({
    queryKey: ['kanban-boards'],
    queryFn: fetchKanbanBoards,
    enabled: !!meUser && canViewAllKanbanBoards,
    staleTime: 30 * 1000,
  });

  const { data: board, isLoading: loadingBoard, isError: boardError } = useQuery({
    queryKey: kanbanBoardQueryKey,
    queryFn: () => fetchKanbanBoard(departmentKeyParam ?? undefined),
    enabled: !!meUser && !showBoardList,
    staleTime: 30 * 1000,
  });

  const boardReadOnly = board?.canWrite === false;

  const openBoard = useCallback(
    (departmentKey: string) => {
      router.push(`/ponto/kanban?departmentKey=${encodeURIComponent(departmentKey)}`);
    },
    [router],
  );

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = meUser || { name: 'Usuário', role: 'EMPLOYEE' };
  const columns = board?.columns ?? [];

  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const hasActiveKanbanFilters = !!filterPriority;
  const [savingColumn, setSavingColumn] = useState(false);

  const [cardModal, setCardModal] = useState<
    | { mode: 'create'; columnId: string }
    | { mode: 'detail'; cardId: string; columnId: string }
    | null
  >(null);
  const [colModal, setColModal] = useState<{ mode: 'create' | 'edit'; column?: KanbanColumn } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'card'; cardId: string; columnId: string } | { type: 'column'; columnId: string } | null>(null);

  const [dragState, setDragState] = useState<DragState>({ draggingCardId: null, fromColumnId: null, overColumnId: null });
  const dragRef = useRef(dragState);
  useEffect(() => {
    dragRef.current = dragState;
  }, [dragState]);

  const refreshBoard = useCallback(
    () => queryClient.refetchQueries({ queryKey: kanbanBoardQueryKey }),
    [queryClient, kanbanBoardQueryKey],
  );

  const handleDragStart = useCallback((e: React.DragEvent, cardId: string, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ draggingCardId: cardId, fromColumnId: columnId, overColumnId: null });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggingCardId: null, fromColumnId: null, overColumnId: null });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState((prev) => (prev.overColumnId === columnId ? prev : { ...prev, overColumnId: columnId }));
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetColumnId: string) => {
      e.preventDefault();
      const { draggingCardId, fromColumnId } = dragRef.current;
      setDragState({ draggingCardId: null, fromColumnId: null, overColumnId: null });
      if (!draggingCardId || !fromColumnId || fromColumnId === targetColumnId) return;

      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        moveCardInBoardCache(old, draggingCardId, fromColumnId, targetColumnId),
      );

      try {
        await updateKanbanCard(draggingCardId, { columnId: targetColumnId });
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
    [queryClient, kanbanBoardQueryKey, refreshBoard],
  );

  function openCreateCard(columnId: string) {
    setCardModal({ mode: 'create', columnId });
  }

  function openEditCard(card: KanbanCard, columnId: string) {
    setCardModal({ mode: 'detail', cardId: card.id, columnId });
  }

  function handleDeleteCard(cardId: string, columnId: string) {
    setDeleteConfirm({ type: 'card', cardId, columnId });
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

  const filteredColumns = columns.map((col) => ({
    ...col,
    cards: col.cards.filter(card => {
      const matchSearch = !search || card.title.toLowerCase().includes(search.toLowerCase()) || card.description.toLowerCase().includes(search.toLowerCase()) || card.assignee.toLowerCase().includes(search.toLowerCase());
      const matchPriority = !filterPriority || card.priority === filterPriority;
      return matchSearch && matchPriority;
    })
  }));

  if (loadingUser || loadingPerms || (showBoardList ? loadingBoardsList : loadingBoard)) {
    return <Loading message="Carregando Tasks..." fullScreen size="lg" />;
  }

  if (!showBoardList && boardError) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="px-4 py-12 text-center text-gray-600 dark:text-gray-400">
          Não foi possível carregar o quadro. Tente atualizar a página.
        </div>
      </MainLayout>
    );
  }

  if (showBoardList) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="px-4 space-y-6">
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tasks</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Selecione o setor para visualizar o quadro de Tasks.
            </p>
          </div>
          <KanbanBoardList boards={boardsList ?? []} onOpen={openBoard} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="flex flex-col -mx-2 sm:-mx-4">
        {/* ── Page Header ── */}
        <div className="mb-4 flex-shrink-0 space-y-4 px-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
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
                  {canViewAllKanbanBoards && (
                    <KanbanBoardSwitcher
                      boards={boardsList ?? []}
                      currentDepartmentKey={board.departmentKey}
                      onSelect={openBoard}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar cards..."
                  className="pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 w-52 transition-all"
                />
              </div>
              {/* Filter */}
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(true)}
                className={clsx(
                  'relative flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors',
                  hasActiveKanbanFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700',
                )}
                aria-label="Abrir filtros"
                title={hasActiveKanbanFilters ? 'Filtros ativos' : 'Filtros'}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtros
                {hasActiveKanbanFilters && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                )}
              </button>
              {!boardReadOnly && (
                <button
                  onClick={() => setColModal({ mode: 'create' })}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nova Coluna
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Board ── */}
        <div className="scrollbar-hide overflow-x-auto pb-4 rounded-2xl bg-[#F3F4F6] dark:bg-gray-900/40 px-4 py-5">
          <div className="flex gap-5 items-start" style={{ minWidth: 'max-content' }}>
            {filteredColumns.map((column) => (
              <KanbanColumnComponent
                key={column.id}
                column={column}
                dragState={dragState}
                readOnly={boardReadOnly}
                onAddCard={openCreateCard}
                onEditCard={openEditCard}
                onDeleteCard={handleDeleteCard}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onEditColumn={(col) => setColModal({ mode: 'edit', column: col })}
                onDeleteColumn={handleDeleteColumn}
              />
            ))}

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
          <div>
            <label className={kanbanLabel}>Prioridade</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['', 'low', 'medium', 'high', 'critical'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilterPriority(p as Priority | '')}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border',
                    filterPriority === p
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700',
                  )}
                >
                  {p !== '' && <KanbanPriorityBars priority={p as Priority} />}
                  {p === '' ? 'Todas' : PRIORITY_CONFIG[p as Priority].label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setFilterPriority('')}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersModalOpen(false)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {cardModal && (
        <KanbanCardModal
          mode={cardModal.mode}
          cardId={cardModal.mode === 'detail' ? cardModal.cardId : undefined}
          columnId={cardModal.columnId}
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
          canViewAllKanbanBoards={canViewAllKanbanBoards}
          onClose={() => setCardModal(null)}
          onBoardRefresh={refreshBoard}
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
