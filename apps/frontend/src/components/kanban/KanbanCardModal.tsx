'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  ListChecks,
  Trash2,
  Plus,
  Tag,
  Clock,
  Paperclip,
  Pencil,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import {
  type Priority,
  type KanbanCardLabel,
  type KanbanCardMember,
  type KanbanCard,
  type KanbanCardDetail,
  type KanbanBoardCardChecklistPatch,
  boardCardToDetailPlaceholder,
  fetchKanbanCard,
  kanbanCardQueryKey,
  normalizeKanbanCardDetail,
  createKanbanCard,
  updateKanbanCard,
  addKanbanCardMember,
  removeKanbanCardMember,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  uploadKanbanAttachments,
  addKanbanLinkAttachment,
  createKanbanComment,
  deleteKanbanComment,
} from '@/lib/kanban';
import { KanbanCardCostModal } from './KanbanCardCostModal';
import {
  kanbanLabel,
  kanbanInput,
  kanbanTextarea,
} from './kanbanFormStyles';
import { KanbanPriorityPicker } from './KanbanPriorityPicker';
import { KanbanCardActionButton } from './KanbanCardActionButton';
import { KanbanCardDatesPanel } from './KanbanCardDatesPopover';
import { KanbanCardLabelsPanel, KanbanLabelChips } from './KanbanCardLabelsPopover';
import type { KanbanLabelPreset } from './kanbanLabels';
import { KanbanMemberPickerModal, type KanbanPickerUser } from './KanbanMemberPickerModal';
import { KanbanMemberChip } from './KanbanMemberChip';
import {
  KanbanAttachmentsModal,
  type KanbanDraftAttachment,
  type KanbanDraftLink,
} from './KanbanAttachmentsModal';
import { KanbanCardAttachmentsInline } from './KanbanCardAttachmentsInline';
import { KanbanChecklistTaskRow } from './KanbanChecklistTaskRow';
import { formatKanbanDateRange } from './kanbanDateTime';
import { kanbanAvatarColorForKey } from './kanbanAvatar';
import { KanbanUserAvatar } from './KanbanUserAvatar';

type OpenMenu = 'labels' | 'dates' | null;

interface DraftChecklistTask {
  id: string;
  title: string;
  isDone: boolean;
}

function pickerUserToMember(user: KanbanPickerUser): KanbanCardMember {
  return {
    userId: user.id,
    name: user.name,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    avatarColor: kanbanAvatarColorForKey(user.id),
  };
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formato por extenso para o badge de última atualização (ex.: há 11 minutos). */
function formatRelativeTimeLong(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} minuto${mins > 1 ? 's' : ''}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface KanbanCardModalCurrentUser {
  id: string;
  name: string;
  email?: string;
  profilePhotoUrl?: string | null;
}

export interface KanbanCardModalProps {
  mode: 'create' | 'detail';
  cardId?: string;
  columnId: string;
  /** Resumo do card no board — exibe a modal na hora enquanto os detalhes carregam. */
  initialCard?: KanbanCard;
  initialColumn?: { title: string; color: string };
  currentUserId?: string;
  currentUser?: KanbanCardModalCurrentUser | null;
  canViewKanbanValues?: boolean;
  labelPresets?: KanbanLabelPreset[];
  onClose: () => void;
  onBoardRefresh: () => void;
  /** Atualiza só o card no board (contadores de checklist) sem refetch da página. */
  onBoardCardPatch?: (cardId: string, patch: KanbanBoardCardChecklistPatch) => void;
}

export function KanbanCardModal({
  mode: initialMode,
  cardId: initialCardId,
  columnId: initialColumnId,
  initialCard,
  initialColumn,
  currentUserId,
  currentUser,
  canViewKanbanValues = false,
  labelPresets,
  onClose,
  onBoardRefresh,
  onBoardCardPatch,
}: KanbanCardModalProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'create' | 'detail'>(initialMode);
  const [cardId, setCardId] = useState<string | undefined>(initialCardId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [members, setMembers] = useState<KanbanCardMember[]>([]);
  const [columnId, setColumnId] = useState(initialColumnId);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [hoveringMemberId, setHoveringMemberId] = useState<string | null>(null);
  const [labels, setLabels] = useState<KanbanCardLabel[]>([]);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [checklistEnabled, setChecklistEnabled] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);

  const [newTask, setNewTask] = useState('');
  const [commentText, setCommentText] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [draftTasks, setDraftTasks] = useState<DraftChecklistTask[]>([]);
  const [editingDraftTaskId, setEditingDraftTaskId] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<KanbanDraftAttachment[]>([]);
  const [draftLinks, setDraftLinks] = useState<KanbanDraftLink[]>([]);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const mainColumnRef = useRef<HTMLDivElement>(null);
  const descriptionSectionRef = useRef<HTMLDivElement>(null);
  const descriptionBeforeEditRef = useRef('');
  const attachmentsSectionRef = useRef<HTMLDivElement>(null);
  /** Evita que um fetch antigo do card sobrescreva membros após atribuir/remover. */
  const memberMutationInFlight = useRef(0);
  const [commentsPanelHeight, setCommentsPanelHeight] = useState<number | undefined>(undefined);
  const isCreate = mode === 'create';
  const isDetail = mode === 'detail' && !!cardId;

  const cardPlaceholder =
    initialCard && cardId === initialCard.id
      ? boardCardToDetailPlaceholder(initialCard, initialColumnId, initialColumn)
      : undefined;

  const { data: card, isLoading, isFetching, refetch } = useQuery({
    queryKey: kanbanCardQueryKey(cardId!),
    queryFn: () => fetchKanbanCard(cardId!),
    enabled: isDetail,
    placeholderData: cardPlaceholder,
    staleTime: 60_000,
  });

  useLayoutEffect(() => {
    if (!initialCard || initialCard.id !== cardId) return;
    setTitle(initialCard.title);
    setDescription(initialCard.description);
    setPriority(initialCard.priority);
    setStartDate(initialCard.startDate ?? '');
    setEndDate(initialCard.endDate ?? '');
    setMembers(Array.isArray(initialCard.members) ? initialCard.members : []);
    setLabels(Array.isArray(initialCard.labels) ? initialCard.labels : []);
    setChecklistEnabled(initialCard.checklistEnabled ?? false);
  }, [initialCard, cardId]);

  useEffect(() => {
    setOpenMenu(null);
    setChecklistEnabled(false);
    setShowAttachmentsModal(false);
    setShowCostModal(false);
    setIsEditingDescription(false);
    if (initialMode === 'create' && !initialCardId) {
      setDraftTasks([]);
      setDraftFiles([]);
    }
  }, [cardId, initialMode, initialCardId]);

  useEffect(() => {
    if (!card || card.id !== cardId) return;
    setTitle((prev) => (prev === card.title ? prev : card.title));
    if (!isEditingDescription) {
      setDescription((prev) => (prev === card.description ? prev : card.description));
    }
    setPriority((prev) => (prev === card.priority ? prev : card.priority));
    setStartDate((prev) => {
      const next = card.startDate ?? '';
      return prev === next ? prev : next;
    });
    setEndDate((prev) => {
      const next = card.endDate ?? '';
      return prev === next ? prev : next;
    });
    if (memberMutationInFlight.current === 0) {
      setMembers((prev) => {
        const next = Array.isArray(card.members) ? card.members : [];
        if (
          prev.length === next.length &&
          prev.every((m, i) => m.userId === next[i]?.userId)
        ) {
          return prev;
        }
        const nextIds = new Set(next.map((m) => m.userId));
        const prevOnly = prev.filter((m) => !nextIds.has(m.userId));
        if (prevOnly.length > 0 && next.length < prev.length) {
          return prev;
        }
        return next;
      });
    }
    setChecklistEnabled((prev) => {
      const next = card.checklistEnabled ?? false;
      return prev === next ? prev : next;
    });
    setColumnId((prev) => (prev === card.columnId ? prev : card.columnId));
    setLabels((prev) => {
      const next = Array.isArray(card.labels) ? card.labels : [];
      if (
        prev.length === next.length &&
        prev.every((l, i) => l.color === next[i]?.color && l.text === next[i]?.text)
      ) {
        return prev;
      }
      return next;
    });
  }, [card, cardId]);

  const refreshAll = useCallback(async () => {
    if (cardId) {
      await refetch();
      queryClient.invalidateQueries({ queryKey: kanbanCardQueryKey(cardId) });
    }
    onBoardRefresh();
  }, [cardId, onBoardRefresh, queryClient, refetch]);

  const applyCardDetail = useCallback(
    (detail: KanbanCardDetail) => {
      if (!cardId) return;
      queryClient.setQueryData(kanbanCardQueryKey(cardId), normalizeKanbanCardDetail(detail));
    },
    [cardId, queryClient],
  );

  const patchBoardCard = useCallback(
    (detail: KanbanCardDetail) => {
      if (!onBoardCardPatch) return;
      onBoardCardPatch(detail.id, {
        completedTasks: detail.completedTasks,
        totalTasks: detail.totalTasks,
        progress: detail.progress,
        checklistEnabled: detail.checklistEnabled,
      });
    },
    [onBoardCardPatch],
  );

  const syncChecklistFromApi = useCallback(
    (detail: KanbanCardDetail) => {
      applyCardDetail(detail);
      patchBoardCard(detail);
    },
    [applyCardDetail, patchBoardCard],
  );

  function buildOptimisticChecklistToggle(
    current: KanbanCardDetail,
    itemId: string,
    nextDone: boolean,
  ): KanbanCardDetail {
    const checklistItems = current.checklistItems.map((item) =>
      item.id === itemId ? { ...item, isDone: nextDone } : item,
    );
    const completedTasks = Math.max(
      0,
      Math.min(current.totalTasks, current.completedTasks + (nextDone ? 1 : -1)),
    );
    const totalTasks = current.totalTasks;
    return {
      ...current,
      checklistItems,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }

  async function saveMeta(
    partial?: Partial<{
      title: string;
      description: string;
      priority: Priority;
      startDate: string | null;
      endDate: string | null;
      labels: KanbanCardLabel[];
      columnId: string;
      checklistEnabled: boolean;
    }>,
  ): Promise<boolean> {
    if (!cardId) return false;
    setSaving(true);
    try {
      await updateKanbanCard(cardId, {
        title: partial?.title ?? title,
        description: partial?.description ?? description,
        priority: partial?.priority ?? priority,
        startDate: partial?.startDate !== undefined ? partial.startDate : startDate || null,
        endDate: partial?.endDate !== undefined ? partial.endDate : endDate || null,
        labels: partial?.labels ?? labels,
        columnId: partial?.columnId ?? columnId,
      });
      await refreshAll();
      return true;
    } catch {
      toast.error('Erro ao salvar alterações');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function startDescriptionEdit() {
    descriptionBeforeEditRef.current = description;
    setIsEditingDescription(true);
  }

  function cancelDescriptionEdit() {
    setDescription(descriptionBeforeEditRef.current);
    setIsEditingDescription(false);
  }

  async function saveDescription() {
    const ok = await saveMeta({ description });
    if (ok) setIsEditingDescription(false);
  }

  const pickerCurrentUser: KanbanPickerUser | null = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email ?? '',
        profilePhotoUrl: currentUser.profilePhotoUrl ?? null,
      }
    : null;

  async function assignMember(user: KanbanPickerUser) {
    if (members.some((m) => m.userId === user.id)) return;
    const next = pickerUserToMember(user);
    setMembers((prev) => [...prev, next]);
    if (!isDetail || !cardId) return;

    memberMutationInFlight.current += 1;
    setSaving(true);
    try {
      const updated = await addKanbanCardMember(cardId, user.id);
      const normalized = normalizeKanbanCardDetail(updated);
      applyCardDetail(normalized);
      setMembers(Array.isArray(normalized.members) ? normalized.members : []);
      onBoardRefresh();
    } catch {
      setMembers((prev) => prev.filter((m) => m.userId !== user.id));
      toast.error('Erro ao adicionar membro');
    } finally {
      memberMutationInFlight.current -= 1;
      setSaving(false);
    }
  }

  async function removeMember(userId: string) {
    const prev = members;
    setMembers((m) => m.filter((x) => x.userId !== userId));
    setHoveringMemberId(null);
    if (!isDetail || !cardId) return;

    memberMutationInFlight.current += 1;
    setSaving(true);
    try {
      const updated = await removeKanbanCardMember(cardId, userId);
      const normalized = normalizeKanbanCardDetail(updated);
      applyCardDetail(normalized);
      setMembers(Array.isArray(normalized.members) ? normalized.members : []);
      onBoardRefresh();
    } catch {
      setMembers(prev);
      toast.error('Erro ao remover membro');
    } finally {
      memberMutationInFlight.current -= 1;
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const created = await createKanbanCard({
        columnId,
        title: title.trim(),
      });

      const newCardId = created.id;
      if (draftFiles.length > 0) {
        await uploadKanbanAttachments(
          newCardId,
          draftFiles.map((d) => d.file),
        );
        setDraftFiles([]);
      }
      if (draftLinks.length > 0) {
        for (const link of draftLinks) {
          await addKanbanLinkAttachment(newCardId, {
            url: link.url,
            displayName:
              link.displayName.trim() && link.displayName !== link.url
                ? link.displayName
                : undefined,
          });
        }
        setDraftLinks([]);
      }

      toast.success('Card criado');
      setCardId(newCardId);
      setMode('detail');
      queryClient.invalidateQueries({ queryKey: kanbanCardQueryKey(newCardId) });
      await onBoardRefresh();
    } catch {
      toast.error('Erro ao criar card');
    } finally {
      setSaving(false);
    }
  }

  function handleAddTask() {
    if (!newTask.trim()) return;
    if (isCreate) {
      setDraftTasks((prev) => [
        ...prev,
        { id: `draft-${crypto.randomUUID()}`, title: newTask.trim(), isDone: false },
      ]);
      setNewTask('');
      return;
    }
    if (!cardId) return;
    setAddingTask(true);
    createChecklistItem(cardId, newTask.trim())
      .then(({ card: updated }) => {
        setNewTask('');
        syncChecklistFromApi(updated);
      })
      .catch(() => toast.error('Erro ao adicionar tarefa'))
      .finally(() => setAddingTask(false));
  }

  function toggleDraftTask(taskId: string) {
    setDraftTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isDone: !t.isDone } : t)),
    );
  }

  function deleteDraftTask(taskId: string) {
    setDraftTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (editingDraftTaskId === taskId) setEditingDraftTaskId(null);
  }

  function renameDraftTask(taskId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setDraftTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: trimmed } : t)),
    );
    setEditingDraftTaskId(null);
  }

  async function toggleTask(itemId: string, isDone: boolean) {
    if (!card || !cardId) return;
    const nextDone = !isDone;
    const previous = card;
    const optimistic = buildOptimisticChecklistToggle(card, itemId, nextDone);
    applyCardDetail(optimistic);
    patchBoardCard(optimistic);
    try {
      const { card: updated } = await updateChecklistItem(itemId, { isDone: nextDone });
      syncChecklistFromApi(updated);
    } catch {
      applyCardDetail(previous);
      patchBoardCard(previous);
      toast.error('Erro ao atualizar tarefa');
    }
  }

  async function handleDeleteTask(itemId: string) {
    if (deletingTaskId || !card || !cardId) return;
    const removed = card.checklistItems.find((i) => i.id === itemId);
    if (!removed) return;

    const previous = card;
    setDeletingTaskId(itemId);
    const checklistItems = card.checklistItems.filter((i) => i.id !== itemId);
    const totalTasks = Math.max(0, card.totalTasks - 1);
    const completedTasks = Math.max(
      0,
      removed.isDone ? card.completedTasks - 1 : card.completedTasks,
    );
    const optimistic = {
      ...card,
      checklistItems,
      totalTasks,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      checklistEnabled: totalTasks > 0 ? card.checklistEnabled : false,
    };
    applyCardDetail(optimistic);
    patchBoardCard(optimistic);

    try {
      await deleteChecklistItem(itemId);
      syncChecklistFromApi(await fetchKanbanCard(cardId));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        return;
      }
      applyCardDetail(previous);
      patchBoardCard(previous);
      toast.error('Erro ao remover tarefa');
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handlePostComment() {
    if (!cardId || !commentText.trim()) return;
    setPostingComment(true);
    try {
      await createKanbanComment(cardId, commentText.trim());
      setCommentText('');
      await refreshAll();
    } catch {
      toast.error('Erro ao publicar comentário');
    } finally {
      setPostingComment(false);
    }
  }

  const checklist = card?.checklistItems ?? [];
  const visibleTasks = hideDone ? checklist.filter((t) => !t.isDone) : checklist;
  const visibleDraftTasks = hideDone ? draftTasks.filter((t) => !t.isDone) : draftTasks;
  const hasLabels = labels.length > 0;
  const hasDates = !!(startDate || endDate);
  const showCostButton = isDetail && !!cardId && canViewKanbanValues;
  const attachmentsList = card?.attachmentsList ?? [];
  const hasAttachments =
    attachmentsList.length > 0 || draftFiles.length > 0 || draftLinks.length > 0;
  const showChecklistPanel = checklistEnabled && isDetail;
  const draftTotal = draftTasks.length;
  const draftCompleted = draftTasks.filter((t) => t.isDone).length;
  const progress = isCreate
    ? draftTotal > 0
      ? Math.round((draftCompleted / draftTotal) * 100)
      : 0
    : card && card.totalTasks > 0
      ? Math.round((card.completedTasks / card.totalTasks) * 100)
      : 0;
  const taskCountLabel = isCreate
    ? `${draftCompleted}/${draftTotal}`
    : card
      ? `${card.completedTasks}/${card.totalTasks}`
      : '0/0';
  const taskTotal = isCreate ? draftTotal : (card?.totalTasks ?? 0);

  useLayoutEffect(() => {
    if (!isDetail || showChecklistPanel) {
      setCommentsPanelHeight(undefined);
      return;
    }

    const mainEl = mainColumnRef.current;
    const descriptionEl = descriptionSectionRef.current;
    const attachmentsEl = attachmentsSectionRef.current;
    const targetEl = hasAttachments ? attachmentsEl : descriptionEl;
    if (!mainEl || !targetEl) return;

    const syncHeight = () => {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!isDesktop) {
        setCommentsPanelHeight(undefined);
        return;
      }

      const mainRect = mainEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const measured = Math.round(targetRect.bottom - mainRect.top);
      setCommentsPanelHeight(Math.max(280, measured));
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(mainEl);
    observer.observe(targetEl);
    window.addEventListener('resize', syncHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, [
    isDetail,
    showChecklistPanel,
    isLoading,
    card?.id,
    card?.commentsList.length,
    labels.length,
    members.length,
    description,
    hasAttachments,
    startDate,
    endDate,
  ]);

  const modalTitle =
    mode === 'create' ? (
      'Novo card'
    ) : (
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => isDetail && saveMeta({ title })}
        placeholder="Título do card"
        className="w-full min-w-0 text-lg font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-0 px-0 py-0.5 placeholder-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0 border-b-2 border-transparent focus:border-gray-400 dark:focus:border-gray-500 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      />
    );

  const subModals = (
    <>
      {openMenu === 'labels' && (
        <Modal
          isOpen
          elevated
          onClose={() => setOpenMenu(null)}
          size="sm"
          title="Etiquetas"
          closeOnOverlayClick={!saving}
        >
          <KanbanCardLabelsPanel
            labels={labels}
            labelPresets={labelPresets}
            onClose={() => setOpenMenu(null)}
            saving={saving}
            onSave={async (next) => {
              setLabels(next);
              if (isDetail) await saveMeta({ labels: next });
            }}
          />
        </Modal>
      )}

      {openMenu === 'dates' && (
        <Modal
          isOpen
          elevated
          onClose={() => setOpenMenu(null)}
          size="md"
          title="Datas"
          closeOnOverlayClick={!saving}
        >
          <KanbanCardDatesPanel
            startDate={startDate}
            endDate={endDate}
            saving={saving}
            onClose={() => setOpenMenu(null)}
            onSave={async (start, end) => {
              setStartDate(start ?? '');
              setEndDate(end ?? '');
              if (isDetail) await saveMeta({ startDate: start, endDate: end });
            }}
          />
        </Modal>
      )}

      <KanbanMemberPickerModal
        isOpen={showMemberPicker}
        elevated
        onClose={() => setShowMemberPicker(false)}
        excludeUserIds={members.map((m) => m.userId)}
        currentUserId={currentUserId}
        currentUser={pickerCurrentUser}
        onSelect={assignMember}
      />

      {showAttachmentsModal && (
        <KanbanAttachmentsModal
          isOpen={showAttachmentsModal}
          elevated
          onClose={() => setShowAttachmentsModal(false)}
          cardId={cardId}
          attachments={card?.attachmentsList ?? []}
          draftFiles={draftFiles}
          onDraftFilesChange={setDraftFiles}
          draftLinks={draftLinks}
          onDraftLinksChange={setDraftLinks}
          currentUserId={currentUserId}
          onUpdated={refreshAll}
        />
      )}

      {showCostButton ? (
        <KanbanCardCostModal
          isOpen={showCostModal}
          elevated
          onClose={() => setShowCostModal(false)}
          cardId={cardId!}
        />
      ) : null}
    </>
  );

  return (
    <>
    <Modal
      isOpen
      onClose={onClose}
      size={isCreate ? 'sm' : '5xl'}
      scrollContent={!isDetail}
      title={modalTitle}
      headerActions={
        isDetail ? (
          <div className="flex items-center gap-2 shrink-0">
            <KanbanPriorityPicker
              value={priority}
              disabled={saving}
              onChange={async (p) => {
                setPriority(p);
                await saveMeta({ priority: p });
              }}
            />
            {(saving || isFetching) && (
              <Loader2 className="w-4 h-4 animate-spin text-red-600 shrink-0" />
            )}
          </div>
        ) : saving ? (
          <Loader2 className="w-4 h-4 animate-spin text-red-600 shrink-0" />
        ) : undefined
      }
      closeOnOverlayClick={!saving}
    >
      {isCreate ? (
        <div className="space-y-4">
          <div>
            <label className={kanbanLabel}>Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && title.trim() && handleCreate()}
              placeholder="Nome do card"
              className={clsx(kanbanInput, 'text-base font-semibold')}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCreate}
              loading={saving}
              disabled={!title.trim()}
              className="!bg-red-600 hover:!bg-red-700 !text-white border-transparent focus-visible:ring-red-500"
            >
              Criar card
            </Button>
          </div>
        </div>
      ) : isDetail && isLoading && !card ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      ) : (
        <div
          className={clsx(
            'flex flex-1 min-h-0 flex-col overflow-hidden',
            isDetail &&
              (showChecklistPanel
                ? 'lg:flex-row lg:min-h-0 lg:items-stretch'
                : 'lg:flex-row lg:min-h-0 lg:items-start'),
            isCreate && 'gap-0',
            '[&_input:focus]:outline-none [&_input:focus]:ring-0 [&_input:focus-visible]:ring-0',
            '[&_textarea:focus]:outline-none [&_textarea:focus]:ring-0 [&_textarea:focus-visible]:ring-0',
            '[&_button:focus]:outline-none [&_button:focus]:ring-0 [&_button:focus-visible]:ring-0',
          )}
        >
          {/* Coluna principal — scroll na borda direita; padding só no conteúdo (folga antes dos comentários) */}
          <div
            ref={mainColumnRef}
            className="flex flex-1 min-w-0 min-h-0 flex-col overflow-y-auto overflow-x-hidden"
          >
            <div
              className={clsx(
                'flex flex-col gap-5 min-h-0',
                isDetail && 'pr-6',
              )}
            >
              <div className="flex flex-nowrap items-center gap-2 min-w-0">
                <KanbanCardActionButton
                  icon={<Tag className="w-4 h-4" />}
                  active={hasLabels}
                  onClick={() => setOpenMenu((m) => (m === 'labels' ? null : 'labels'))}
                  className="shrink-0"
                >
                  Etiquetas
                </KanbanCardActionButton>
                <KanbanCardActionButton
                  icon={<Clock className="w-4 h-4" />}
                  active={hasDates}
                  onClick={() => setOpenMenu((m) => (m === 'dates' ? null : 'dates'))}
                  className="shrink-0"
                >
                  Datas
                </KanbanCardActionButton>
                <KanbanCardActionButton
                  icon={<ListChecks className="w-4 h-4" />}
                  active={checklistEnabled}
                  className="shrink-0"
                  onClick={async () => {
                    const next = !checklistEnabled;
                    setChecklistEnabled(next);
                    setSaving(true);
                    try {
                      await updateKanbanCard(cardId!, { checklistEnabled: next });
                      await refreshAll();
                    } catch {
                      setChecklistEnabled(!next);
                      toast.error('Erro ao atualizar checklist');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Checklist
                </KanbanCardActionButton>
                <KanbanCardActionButton
                  icon={<Paperclip className="w-4 h-4" />}
                  active={hasAttachments}
                  onClick={() => setShowAttachmentsModal(true)}
                  className="shrink-0"
                >
                  Anexos
                </KanbanCardActionButton>
                {showCostButton ? (
                  <KanbanCardActionButton
                    active={showCostModal}
                    onClick={() => setShowCostModal(true)}
                    className="shrink-0 min-w-[2.75rem] justify-center"
                    title="Custos"
                  >
                    $
                  </KanbanCardActionButton>
                ) : null}
              </div>

              {labels.length > 0 && (
                <KanbanLabelChips labels={labels} labelPresets={labelPresets} />
              )}

            <div className="space-y-4">
              {/* Membros */}
              <div className="flex flex-col">
                <label className={kanbanLabel}>Membros</label>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {members.map((member) => (
                    <KanbanMemberChip
                      key={member.userId}
                      userId={member.userId}
                      name={member.name}
                      profilePhotoUrl={member.profilePhotoUrl}
                      avatarColor={member.avatarColor}
                      isHovering={hoveringMemberId === member.userId}
                      onHover={(hovering) =>
                        setHoveringMemberId(hovering ? member.userId : null)
                      }
                      onRemove={() => removeMember(member.userId)}
                    />
                  ))}
                  {pickerCurrentUser &&
                    !members.some((m) => m.userId === pickerCurrentUser.id) && (
                      <button
                        type="button"
                        onClick={() => assignMember(pickerCurrentUser)}
                        disabled={saving}
                        className="h-10 rounded-full border-2 border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40 shrink-0"
                        title="Atribuir card a mim"
                      >
                        Atribuir a mim
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setShowMemberPicker(true)}
                    className="w-10 h-10 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0"
                    title="Adicionar membro"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {(hasDates || card?.updatedAt) && (
                <div className="flex flex-wrap items-end gap-4">
                  {hasDates && (
                    <div className="flex flex-col w-full max-w-full min-w-0 sm:w-fit sm:max-w-full shrink-0">
                      <label className={kanbanLabel}>Data entrega</label>
                      <button
                        type="button"
                        onClick={() => setOpenMenu('dates')}
                        className={clsx(
                          kanbanInput,
                          'mt-2 w-full sm:!w-auto h-10 box-border inline-flex items-center justify-start px-3 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500',
                          hasDates ? 'whitespace-nowrap' : 'text-gray-400 dark:text-gray-500',
                        )}
                      >
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                          {hasDates
                            ? formatKanbanDateRange(startDate, endDate)
                            : 'Definir datas'}
                        </span>
                      </button>
                    </div>
                  )}

                  {isDetail && card?.updatedAt && (
                    <div className="flex flex-col w-fit max-w-full shrink-0">
                      <label className={kanbanLabel}>Última Atualização</label>
                      <div
                        className={clsx(
                          kanbanInput,
                          'mt-2 !w-auto min-w-[9.5rem] h-10 box-border inline-flex items-center justify-center px-3 bg-gray-100 dark:bg-gray-700/70 border-gray-300 dark:border-gray-600 cursor-default pointer-events-none whitespace-nowrap',
                        )}
                      >
                        <span className="text-sm text-gray-600 dark:text-gray-300 tabular-nums">
                          {formatRelativeTimeLong(card.updatedAt)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div ref={descriptionSectionRef}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className={clsx(kanbanLabel, 'mb-0')}>Descrição</label>
                {isDetail && !isEditingDescription ? (
                  <button
                    type="button"
                    onClick={startDescriptionEdit}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Editar descrição"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
              {isDetail && !isEditingDescription ? (
                <div
                  className={clsx(
                    'text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words',
                    !description.trim() && 'text-gray-400 dark:text-gray-500 italic',
                  )}
                >
                  {description.trim()
                    ? description
                    : 'Sem descrição. Clique no lápis para adicionar.'}
                </div>
              ) : (
                <>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={Math.min(20, Math.max(6, description.split('\n').length + 2))}
                    placeholder="Detalhes, links, observações..."
                    className={clsx(kanbanTextarea, isDetail && 'resize-y min-h-[120px]')}
                    autoFocus={isDetail && isEditingDescription}
                  />
                  {isDetail && isEditingDescription ? (
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={cancelDescriptionEdit}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="error"
                        loading={saving}
                        onClick={saveDescription}
                      >
                        Salvar
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {isDetail && hasAttachments ? (
              <div ref={attachmentsSectionRef}>
                <KanbanCardAttachmentsInline
                  attachments={attachmentsList}
                  draftFiles={draftFiles}
                  draftLinks={draftLinks}
                  currentUserId={currentUserId}
                  onDraftFilesChange={setDraftFiles}
                  onDraftLinksChange={setDraftLinks}
                  onUpdated={refreshAll}
                  onAddClick={() => setShowAttachmentsModal(true)}
                />
              </div>
            ) : null}

            {showChecklistPanel && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-4 flex flex-col gap-3 min-w-0">
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-red-600" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tarefas</h4>
                  {taskTotal > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                      {taskCountLabel} · {progress}%
                    </span>
                  )}
                </div>
                {((isDetail && checklist.some((t) => t.isDone)) ||
                  (isCreate && draftTasks.some((t) => t.isDone))) && (
                  <button
                    type="button"
                    onClick={() => setHideDone((v) => !v)}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    {hideDone ? 'Mostrar concluídas' : 'Ocultar concluídas'}
                  </button>
                )}
              </div>

              {taskTotal > 0 && (
                <div className="relative h-px w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/80">
                  <div
                    className="absolute inset-y-0 left-0 bg-red-600 transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {(isCreate ? visibleDraftTasks.length > 0 : visibleTasks.length > 0) && (
                <ul className="space-y-1 -mx-0.5 px-0.5">
                  {isCreate
                    ? visibleDraftTasks.map((task) => {
                        const draftTitleClass = clsx(
                          'flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 leading-5 break-words',
                          task.isDone && 'line-through text-gray-400',
                        );
                        const isEditingDraft = editingDraftTaskId === task.id;
                        return (
                        <li
                          key={task.id}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                        >
                          <CheckboxIndicator
                            checked={task.isDone}
                            onChange={() => toggleDraftTask(task.id)}
                            asButton
                            className="shrink-0"
                          />
                          {isEditingDraft ? (
                            <input
                              type="text"
                              defaultValue={task.title}
                              autoFocus
                              onBlur={(e) => renameDraftTask(task.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  renameDraftTask(task.id, e.currentTarget.value);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingDraftTaskId(null);
                                }
                              }}
                              className={clsx(
                                draftTitleClass,
                                'h-5 bg-transparent border-0 p-0 shadow-none outline-none ring-0',
                                'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
                              )}
                              aria-label="Editar tarefa"
                            />
                          ) : (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={() => setEditingDraftTaskId(task.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setEditingDraftTaskId(task.id);
                                }
                              }}
                              className={clsx(draftTitleClass, 'cursor-text')}
                            >
                              {task.title}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteDraftTask(task.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Excluir tarefa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                        );
                      })
                    : visibleTasks.map((item) => (
                        <KanbanChecklistTaskRow
                          key={item.id}
                          item={item}
                          cardMembers={members}
                          currentUser={
                            currentUser
                              ? {
                                  userId: currentUser.id,
                                  name: currentUser.name,
                                  profilePhotoUrl: currentUser.profilePhotoUrl ?? null,
                                  avatarColor: '',
                                }
                              : null
                          }
                          isDeleting={deletingTaskId === item.id}
                          onToggle={() => toggleTask(item.id, item.isDone)}
                          onDelete={() => handleDeleteTask(item.id)}
                          onUpdated={syncChecklistFromApi}
                        />
                      ))}
                </ul>
              )}

              <div className="flex flex-col gap-3 shrink-0">
                {(isCreate ? visibleDraftTasks.length > 0 : visibleTasks.length > 0) && (
                  <div className="h-px bg-gray-200/80 dark:bg-gray-700/80" />
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                    placeholder="Adicionar tarefa..."
                    className={clsx(kanbanInput, 'flex-1 min-w-0 text-sm')}
                  />
                  <button
                    type="button"
                    onClick={handleAddTask}
                    disabled={addingTask || !newTask.trim()}
                    title="Adicionar tarefa"
                    className="w-9 h-9 shrink-0 rounded-lg bg-red-600 hover:bg-red-700 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {addingTask ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            )}

            </div>
          </div>

          {isDetail && (
          <div
            className="flex w-full min-h-0 flex-1 flex-col overflow-hidden border-t border-gray-200 pt-5 dark:border-gray-700 lg:w-[360px] lg:shrink-0 lg:flex-none lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
            style={
              commentsPanelHeight != null
                ? { height: commentsPanelHeight, maxHeight: commentsPanelHeight }
                : undefined
            }
          >
            <h4 className="mb-3 shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Comentários
            </h4>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="mb-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                  {card?.commentsList.length === 0 ? (
                    <p className="flex min-h-[8rem] items-center justify-center px-2 text-center text-sm text-gray-400">
                      Nenhum comentário ainda.
                    </p>
                  ) : (
                    <div className="space-y-4 pb-2">
                    {card?.commentsList.map((comment) => {
                      const canDeleteComment = currentUserId === comment.author.id;
                      const commentTimeLabel = formatRelativeTime(comment.createdAt);
                      return (
                      <div
                        key={comment.id}
                        className="group/comment flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <KanbanUserAvatar
                          name={comment.author.name}
                          profilePhotoUrl={comment.author.profilePhotoUrl}
                          colorKey={comment.author.id}
                          colorClass={comment.author.avatarColor}
                          size="sm"
                          className="!h-8 !w-8 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-100">
                              {comment.author.name}
                            </span>
                            <div className="relative flex h-6 min-w-[3.25rem] shrink-0 items-center justify-end">
                              <span
                                className={clsx(
                                  'text-[10px] leading-none whitespace-nowrap text-gray-400 transition-opacity duration-150',
                                  canDeleteComment &&
                                    'group-hover/comment:invisible group-hover/comment:opacity-0',
                                )}
                              >
                                {commentTimeLabel}
                              </span>
                              {canDeleteComment && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await deleteKanbanComment(comment.id);
                                      await refreshAll();
                                    } catch {
                                      toast.error('Erro ao excluir comentário');
                                    }
                                  }}
                                  className="absolute inset-0 flex items-center justify-end rounded-md text-gray-400 opacity-0 invisible transition-all duration-150 hover:text-red-600 group-hover/comment:visible group-hover/comment:opacity-100"
                                  title="Excluir comentário"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-sm leading-snug text-gray-600 break-words whitespace-pre-wrap dark:text-gray-300">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    );
                    })}
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-gray-200 pt-3 dark:border-gray-700">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Escrever um comentário..."
                    rows={2}
                    className={clsx(kanbanTextarea, 'mb-2 !min-h-0 py-2 text-sm')}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={handlePostComment}
                    loading={postingComment}
                    disabled={!commentText.trim()}
                  >
                    Comentar
                  </Button>
                </div>
            </div>
          </div>
          )}
        </div>
      )}
    </Modal>
    {subModals}
    </>
  );
}
