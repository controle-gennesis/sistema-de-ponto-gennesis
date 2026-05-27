'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  ListChecks,
  Trash2,
  Plus,
  Tag,
  Clock,
  Paperclip,
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
  type KanbanCardDetail,
  type KanbanBoardCardChecklistPatch,
  fetchKanbanCard,
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
import { getKanbanInitials, kanbanAvatarColorForKey } from './kanbanAvatar';

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
  currentUserId?: string;
  currentUser?: KanbanCardModalCurrentUser | null;
  canViewAllKanbanBoards?: boolean;
  onClose: () => void;
  onBoardRefresh: () => void;
  /** Atualiza só o card no board (contadores de checklist) sem refetch da página. */
  onBoardCardPatch?: (cardId: string, patch: KanbanBoardCardChecklistPatch) => void;
}

export function KanbanCardModal({
  mode: initialMode,
  cardId: initialCardId,
  columnId: initialColumnId,
  currentUserId,
  currentUser,
  canViewAllKanbanBoards = false,
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

  const isCreate = mode === 'create';
  const isDetail = mode === 'detail' && !!cardId;

  const { data: card, isLoading, refetch } = useQuery({
    queryKey: ['kanban-card', cardId],
    queryFn: () => fetchKanbanCard(cardId!),
    enabled: isDetail,
  });

  useEffect(() => {
    setOpenMenu(null);
    setChecklistEnabled(false);
    setShowAttachmentsModal(false);
    setShowCostModal(false);
    if (initialMode === 'create' && !initialCardId) {
      setDraftTasks([]);
      setDraftFiles([]);
    }
  }, [cardId, initialMode, initialCardId]);

  useEffect(() => {
    if (!card || card.id !== cardId) return;
    setTitle((prev) => (prev === card.title ? prev : card.title));
    setDescription((prev) => (prev === card.description ? prev : card.description));
    setPriority((prev) => (prev === card.priority ? prev : card.priority));
    setStartDate((prev) => {
      const next = card.startDate ?? '';
      return prev === next ? prev : next;
    });
    setEndDate((prev) => {
      const next = card.endDate ?? '';
      return prev === next ? prev : next;
    });
    setMembers((prev) => {
      const next = Array.isArray(card.members) ? card.members : [];
      if (
        prev.length === next.length &&
        prev.every((m, i) => m.userId === next[i]?.userId)
      ) {
        return prev;
      }
      return next;
    });
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
      queryClient.invalidateQueries({ queryKey: ['kanban-card', cardId] });
    }
    onBoardRefresh();
  }, [cardId, onBoardRefresh, queryClient, refetch]);

  const applyCardDetail = useCallback(
    (detail: KanbanCardDetail) => {
      if (!cardId) return;
      queryClient.setQueryData(['kanban-card', cardId], normalizeKanbanCardDetail(detail));
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
  ) {
    if (!cardId) return;
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
    } catch {
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
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
    if (isDetail && cardId) {
      setSaving(true);
      try {
        const updated = await addKanbanCardMember(cardId, user.id);
        setMembers(Array.isArray(updated.members) ? updated.members : [...members, next]);
        await refreshAll();
      } catch {
        setMembers((prev) => prev.filter((m) => m.userId !== user.id));
        toast.error('Erro ao adicionar membro');
      } finally {
        setSaving(false);
      }
    }
  }

  async function removeMember(userId: string) {
    const prev = members;
    setMembers((m) => m.filter((x) => x.userId !== userId));
    setHoveringMemberId(null);
    if (isDetail && cardId) {
      setSaving(true);
      try {
        const updated = await removeKanbanCardMember(cardId, userId);
        setMembers(Array.isArray(updated.members) ? updated.members : []);
        await refreshAll();
      } catch {
        setMembers(prev);
        toast.error('Erro ao remover membro');
      } finally {
        setSaving(false);
      }
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
      queryClient.invalidateQueries({ queryKey: ['kanban-card', newCardId] });
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
  const showCostButton = isDetail && !!cardId && canViewAllKanbanBoards;
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
      size={isCreate ? 'sm' : 'xl'}
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
            {saving && <Loader2 className="w-4 h-4 animate-spin text-red-600 shrink-0" />}
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
      ) : isDetail && isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      ) : (
        <div
          className={clsx(
            'flex flex-1 min-h-0 flex-col overflow-hidden',
            isDetail && 'lg:flex-row lg:gap-0',
            isCreate && 'gap-0',
            '[&_input:focus]:outline-none [&_input:focus]:ring-0 [&_input:focus-visible]:ring-0',
            '[&_textarea:focus]:outline-none [&_textarea:focus]:ring-0 [&_textarea:focus-visible]:ring-0',
            '[&_button:focus]:outline-none [&_button:focus]:ring-0 [&_button:focus-visible]:ring-0',
          )}
        >
          {/* Coluna principal — único scroll vertical do conteúdo do card */}
          <div
            className={clsx(
              'flex flex-col flex-1 min-w-0 min-h-0 overflow-y-scroll overflow-x-hidden space-y-5 pr-1 [scrollbar-gutter:stable]',
              isDetail && 'lg:pr-6',
            )}
          >
            {/* Botões de ação */}
            <div className="flex flex-wrap gap-2">
              <KanbanCardActionButton
                icon={<Tag className="w-4 h-4" />}
                active={hasLabels}
                onClick={() => setOpenMenu((m) => (m === 'labels' ? null : 'labels'))}
              >
                Etiquetas
              </KanbanCardActionButton>
              <KanbanCardActionButton
                icon={<Clock className="w-4 h-4" />}
                active={hasDates}
                onClick={() => setOpenMenu((m) => (m === 'dates' ? null : 'dates'))}
              >
                Datas
              </KanbanCardActionButton>
              <KanbanCardActionButton
                icon={<ListChecks className="w-4 h-4" />}
                active={checklistEnabled}
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
              >
                Anexos
              </KanbanCardActionButton>
              {showCostButton ? (
                <KanbanCardActionButton
                  active={showCostModal}
                  onClick={() => setShowCostModal(true)}
                >
                  $
                </KanbanCardActionButton>
              ) : null}
            </div>

            {labels.length > 0 && <KanbanLabelChips labels={labels} />}

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

            <div>
              <label className={kanbanLabel}>Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => isDetail && saveMeta({ description })}
                rows={4}
                placeholder="Detalhes, links, observações..."
                className={kanbanTextarea}
              />
            </div>

            {isDetail && hasAttachments ? (
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

          {isDetail && (
          <div className="w-full lg:w-[280px] shrink-0 flex flex-col min-h-0 overflow-hidden border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 lg:pl-6 pt-6 lg:pt-0">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 shrink-0">
              Comentários
            </h4>

              <>
                <div className="mb-4 flex-1 min-h-0 space-y-4 overflow-x-hidden overflow-y-scroll [scrollbar-gutter:stable]">
                  {card?.commentsList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      Nenhum comentário ainda.
                    </p>
                  ) : (
                    card?.commentsList.map((comment) => (
                      <div
                        key={comment.id}
                        className="group flex gap-2.5 rounded-lg px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div
                          className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 self-center',
                            comment.author.avatarColor,
                          )}
                        >
                          {getKanbanInitials(comment.author.name)}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 py-0.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
                            {comment.author.name}
                          </span>
                          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words leading-snug">
                            {comment.content}
                          </p>
                        </div>
                        <div className="flex flex-col items-end justify-center gap-1 shrink-0 self-center min-w-[2rem]">
                          <span className="text-[10px] text-gray-400 leading-none">
                            {formatRelativeTime(comment.createdAt)}
                          </span>
                          {currentUserId === comment.author.id && (
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
                              className="p-1 rounded-md text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
                              title="Excluir comentário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="shrink-0 mt-auto">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Escrever um comentário..."
                    rows={2}
                    className={clsx(kanbanTextarea, 'text-sm mb-2 !min-h-0 py-2')}
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
              </>
          </div>
          )}
        </div>
      )}
    </Modal>
    {subModals}
    </>
  );
}
