'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FolderInput,
  HardDrive,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Pencil,
  Search,
  LayoutGrid,
  List,
  X,
  AlertTriangle,
  Loader2,
  MoreVertical,
  Users,
  Star,
  RotateCcw,
  Clock,
} from 'lucide-react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { formatPersonCpf, personInitials, toPersonSelectOptions } from '@/lib/personSelectOptions';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { DriveFileThumb } from '@/components/drive/DriveFileThumb';
import { DriveFilePreviewModal, DriveHoverActions } from '@/components/drive/DriveFilePreviewModal';
import { DriveMimeIcon } from '@/components/drive/DriveMimeIcon';
import {
  DriveSidebar,
  type DriveSidebarView,
} from '@/components/drive/DriveSidebar';
import { DriveListView } from '@/components/drive/DriveListView';
import { DriveMoveModal, type DriveMoveTarget } from '@/components/drive/DriveMoveModal';
import { DriveSelectionBar } from '@/components/drive/DriveSelectionBar';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import {
  DriveFilters,
  DRIVE_FILTERS_EMPTY,
  driveFileCategory,
  driveFiltersActive,
  driveMatchesModified,
  type DriveFiltersState,
} from '@/components/drive/DriveFilters';
import { computeSelection, fileKey, folderKey, type SelectMods } from '@/components/drive/driveSelection';
import {
  folderDropProps,
  isDriveItemDrag,
  startDriveItemDrag,
  type DriveDragItem,
} from '@/components/drive/driveItemDrag';
import { FolderAppearanceModal } from '@/components/drive/FolderAppearanceModal';
import { FolderIconTile } from '@/components/drive/folderAppearance';
import { useDriveMenuDismiss } from '@/components/drive/useDriveMenuDismiss';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import {
  DriveUploadPanel,
  type DriveUploadItem,
} from '@/components/drive/DriveUploadPanel';
import {
  collectFilesFromDataTransfer,
  filesFromFileList,
  isAbortError,
  postFileViaApi,
  putFileToPresignedUrl,
  type DriveDroppedFile,
} from '@/lib/driveUpload';

const SHARE_PERMISSION_OPTIONS = labeledToSelectOptions([
  { value: 'READ', label: 'Pode ver' },
  { value: 'READ_WRITE', label: 'Pode editar' },
]);

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  ownerName?: string | null;
  ownerPhotoUrl?: string | null;
  starred?: boolean;
  iconKey?: string | null;
  iconColor?: string | null;
  trashedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
  canManageShares?: boolean;
  /** Pode enviar ficheiros e criar subpastas (falso se só leitura na partilha). */
  canWrite?: boolean;
}

interface DriveFile {
  id: string;
  name: string;
  originalName: string;
  s3Key: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  ownerId: string;
  ownerName?: string | null;
  ownerPhotoUrl?: string | null;
  starred?: boolean;
  trashedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FolderContents {
  folders: DriveFolder[];
  files: DriveFile[];
  breadcrumb: Array<{ id: string; name: string }>;
  /** Pasta atualmente aberta (quando não está na raiz). */
  currentFolder?: DriveFolder | null;
}

// ── Utilitários ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Alternância grade / lista — mesmo SegmentedControl da Agenda/Tarefas. */
function DriveViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <SegmentedControl
      value={viewMode}
      onChange={onViewModeChange}
      aria-label="Exibição: grade ou lista"
      options={[
        {
          value: 'grid',
          title: 'Grade',
          ariaLabel: 'Grade',
          label: <LayoutGrid className="h-4 w-4" aria-hidden />,
        },
        {
          value: 'list',
          title: 'Lista',
          ariaLabel: 'Lista',
          label: <List className="h-4 w-4" aria-hidden />,
        },
      ]}
    />
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

function DrivePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Pasta aberta = query `?folder=<id>`. Atual com voltar/avançar e links partilháveis. */
  const currentFolderId = searchParams?.get('folder')?.trim() || undefined;
  const viewParam = searchParams?.get('view')?.trim() || '';
  const driveView: DriveSidebarView =
    viewParam === 'shared' ||
    viewParam === 'recent' ||
    viewParam === 'starred' ||
    viewParam === 'trash'
      ? viewParam
      : 'meu-drive';
  const isMyDriveView = driveView === 'meu-drive';

  const [viewMode, setViewModeState] = useState<'grid' | 'list'>('grid');
  // Lembra a escolha (grade/lista) do usuário neste navegador.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem('drive-view-mode');
      if (salvo === 'grid' || salvo === 'list') setViewModeState(salvo);
    } catch {
      /* armazenamento indisponível: fica em grade */
    }
  }, []);
  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('drive-view-mode', mode);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  /** Item aberto na janela "Mover para…". */
  const [moveTarget, setMoveTarget] = useState<DriveMoveTarget | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadItems, setUploadItems] = useState<DriveUploadItem[]>([]);
  const [uploadPanelMinimized, setUploadPanelMinimized] = useState(false);
  const uploadAbortRef = useRef<Map<string, AbortController>>(new Map());
  const [showNewMenu, setShowNewMenu] = useState(false);
  /** null = menu ancorado no botão; coords = menu no clique direito */
  const [newMenuCoords, setNewMenuCoords] = useState<{ x: number; y: number } | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const driveRootRef = useRef<HTMLDivElement>(null);

  // Modais
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameTarget, setRenameTarget] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
  } | null>(null);
  const [renameName, setRenameName] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
  } | null>(null);

  const [shareFolder, setShareFolder] = useState<DriveFolder | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  /** Aviso "arquivo já existe nesta pasta": resolve true = substituir, false = cancelar. */
  const [replaceDialog, setReplaceDialog] = useState<{
    names: string[];
    resolve: (replace: boolean) => void;
  } | null>(null);
  const askReplace = useCallback(
    (names: string[]) =>
      new Promise<boolean>((resolve) => {
        setReplaceDialog({ names, resolve });
      }),
    [],
  );
  const answerReplace = (replace: boolean) => {
    replaceDialog?.resolve(replace);
    setReplaceDialog(null);
  };
  const [appearanceFolder, setAppearanceFolder] = useState<DriveFolder | null>(null);
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<Set<string>>(() => new Set());

  // ── Dados do usuário (padrão do sistema) ──────────────────────────────────

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data;

  const goToFolder = useCallback(
    (id: string | undefined) => {
      setSearchQuery('');
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      next.delete('view');
      if (id) {
        next.set('folder', id);
      } else {
        next.delete('folder');
      }
      const qs = next.toString();
      const base = pathname ?? '/ponto/drive';
      // push (não replace) para o botão Voltar do navegador retornar à pasta anterior
      router.push(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setDriveView = useCallback(
    (view: DriveSidebarView) => {
      setSearchQuery('');
      const next = new URLSearchParams();
      if (view !== 'meu-drive') {
        next.set('view', view);
      }
      const qs = next.toString();
      const base = pathname ?? '/ponto/drive';
      router.push(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router],
  );

  // ── Queries de conteúdo ───────────────────────────────────────────────────

  const { data: contents, isLoading: loadingContents, error: contentsError } = useQuery<FolderContents>({
    queryKey: ['drive', currentFolderId ?? 'root'],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (currentFolderId) params.folderId = currentFolderId;
      const res = await api.get('/drive', { params });
      return res.data.data;
    },
    enabled: !!user && !searchQuery && isMyDriveView,
    retry: 1,
    // Outras pessoas criam pastas/arquivos nas pastas compartilhadas: atualiza sozinho (aba visível), ao voltar para a aba e ao abrir.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: () => visibleTabRefetchInterval(15_000),
  });

  const { data: viewContents, isLoading: loadingView } = useQuery<{
    folders: DriveFolder[];
    files: DriveFile[];
  }>({
    queryKey: ['drive-view', driveView],
    queryFn: async () => {
      const path =
        driveView === 'shared'
          ? '/drive/views/shared'
          : driveView === 'recent'
            ? '/drive/views/recent'
            : driveView === 'starred'
              ? '/drive/views/starred'
              : '/drive/views/trash';
      const res = await api.get(path);
      return res.data.data;
    },
    enabled: !!user && !searchQuery && !isMyDriveView,
    retry: 1,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: () => visibleTabRefetchInterval(15_000),
  });

  const { data: storageInfo, isLoading: loadingStorage } = useQuery({
    queryKey: ['drive-storage'],
    queryFn: async () => {
      const res = await api.get('/drive/storage');
      return res.data.data as { usedBytes: number; quotaBytes: number };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery<{
    folders: DriveFolder[];
    files: DriveFile[];
  }>({
    queryKey: ['drive-search', searchQuery],
    queryFn: async () => {
      const res = await api.get('/drive/search', { params: { q: searchQuery } });
      return res.data.data;
    },
    enabled: !!user && !!searchQuery.trim(),
  });

  const rawFolders = searchQuery
    ? (searchResults?.folders ?? [])
    : isMyDriveView
      ? (contents?.folders ?? [])
      : (viewContents?.folders ?? []);
  const rawFiles = searchQuery
    ? (searchResults?.files ?? [])
    : isMyDriveView
      ? (contents?.files ?? [])
      : (viewContents?.files ?? []);

  // ── Filtros (tipo / data de modificação / proprietário) ───────────────────
  const [filters, setFilters] = useState<DriveFiltersState>(DRIVE_FILTERS_EMPTY);
  const filtersActive = driveFiltersActive(filters);
  const ownerOk = (ownerId: string) =>
    filters.owner === 'all' || (filters.owner === 'me' ? ownerId === user?.id : ownerId !== user?.id);
  const folders = useMemo(() => {
    if (!filtersActive) return rawFolders;
    // Qualquer tipo de arquivo escolhido esconde as pastas; "Pastas" e "Todos" as mantêm.
    if (filters.type !== 'all' && filters.type !== 'folders') return [];
    return rawFolders.filter((f) => ownerOk(f.ownerId) && driveMatchesModified(f.updatedAt, filters.modified));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFolders, filters, user?.id]);
  const files = useMemo(() => {
    if (!filtersActive) return rawFiles;
    if (filters.type === 'folders') return [];
    return rawFiles.filter(
      (f) =>
        (filters.type === 'all' || driveFileCategory(f.mimeType, f.originalName || f.name) === filters.type) &&
        ownerOk(f.ownerId) &&
        driveMatchesModified(f.updatedAt, filters.modified),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFiles, filters, user?.id]);
  /** Arquivos da pasta aberta (usado pelo upload para detectar nome repetido sem recriar callbacks). */
  const filesRef = useRef(files);
  filesRef.current = files;
  const breadcrumb = isMyDriveView ? (contents?.breadcrumb ?? []) : [];
  const currentFolderMeta = isMyDriveView ? (contents?.currentFolder ?? null) : null;
  /** Título da página: "Meu Drive" na raiz; dentro de uma pasta, o nome dela. */
  const nomePastaAtual = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1]!.name : 'Meu Drive';
  const isLoading = loadingContents || loadingSearch || loadingView;
  const isEmpty = !isLoading && folders.length === 0 && files.length === 0;
  /** Raiz: sempre pode; dentro de pasta: `canWrite === false` = só leitura (não exibir upload/nova pasta). */
  const canWriteInCurrentFolder =
    driveView === 'trash'
      ? false
      : !currentFolderId || currentFolderMeta?.canWrite !== false;
  const isTrashView = driveView === 'trash';
  /** Dentro de uma pasta onde tenho edição: posso mover também o que outras pessoas criaram ali. */
  const canMoveOthers =
    isMyDriveView && !isTrashView && !searchQuery && !!currentFolderId && currentFolderMeta?.canWrite !== false;

  // ── Seleção múltipla (Ctrl/Shift + clique) ────────────────────────────────
  const [selection, setSelection] = useState<string[]>([]);
  const selectionAnchor = useRef<string | null>(null);
  const orderedKeys = useMemo(
    () => [...folders.map((f) => folderKey(f.id)), ...files.map((f) => fileKey(f.id))],
    [folders, files],
  );
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const clearSelection = useCallback(() => {
    setSelection([]);
    selectionAnchor.current = null;
  }, []);
  const handleSelect = useCallback(
    (key: string, mods: SelectMods) => {
      const r = computeSelection(selection, selectionAnchor.current, key, mods, orderedKeys);
      selectionAnchor.current = r.anchor;
      setSelection(r.selection);
    },
    [selection, orderedKeys],
  );
  /** Itens selecionados que ainda estão na tela (a seleção some ao trocar de pasta/visão/busca). */
  const selectedItems = useMemo(() => {
    const out: Array<{ type: 'folder' | 'file'; id: string; name: string; ownerId: string }> = [];
    for (const f of folders) if (selectedSet.has(folderKey(f.id))) out.push({ type: 'folder', id: f.id, name: f.name, ownerId: f.ownerId });
    for (const f of files) if (selectedSet.has(fileKey(f.id))) out.push({ type: 'file', id: f.id, name: f.name, ownerId: f.ownerId });
    return out;
  }, [folders, files, selectedSet]);

  useEffect(() => {
    clearSelection();
  }, [currentFolderId, driveView, searchQuery, clearSelection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable;
      if (typing || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') clearSelection();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && orderedKeys.length > 0) {
        e.preventDefault();
        selectionAnchor.current = orderedKeys[0] ?? null;
        setSelection(orderedKeys);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedKeys, clearSelection]);

  // Clique fora dos itens (e da barra de ações, dos menus e das janelas) desmarca tudo.
  useEffect(() => {
    if (selection.length === 0) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-drive-item], [role="toolbar"], [role="dialog"], [role="menu"], [data-drive-menu], [data-drive-menu-btn]')) return;
      clearSelection();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [selection.length, clearSelection]);

  /** Itens sendo arrastados agora (ficam esmaecidos até soltar). */
  const [draggingKeys, setDraggingKeys] = useState<Set<string>>(new Set());
  const onDragStateChange = useCallback((keys: string[] | null) => setDraggingKeys(new Set(keys ?? [])), []);

  /** Ao arrastar um item selecionado, leva a seleção toda (só o que é seu pode ser movido). */
  const dragItemsFor = (item: DriveDragItem): DriveDragItem[] => {
    if (selectedSet.has(`${item.type}-${item.id}`) && selectedItems.length > 1) {
      return selectedItems
        .filter((i) => canMoveOthers || i.ownerId === user?.id)
        .map(({ type, id }) => ({ type, id }));
    }
    return [item];
  };

  const topBreadcrumbTrail = useMemo(() => {
    if (!isMyDriveView) {
      if (driveView === 'shared') return [{ label: 'Compartilhados comigo' }];
      if (driveView === 'recent') return [{ label: 'Recentes' }];
      if (driveView === 'starred') return [{ label: 'Com estrela' }];
      if (driveView === 'trash') return [{ label: 'Lixeira' }];
      return null;
    }
    // Raiz: o topo mostra só "Meu Drive". Dentro de pastas: Principal > Meu Drive > Pasta > Subpasta,
    // com o botão de compartilhar na pasta atual (antes isso ficava no título da página).
    if (breadcrumb.length === 0) return null;
    const podeCompartilhar = !!currentFolderId && !!currentFolderMeta?.canManageShares;
    return [
      { label: 'Meu Drive', onClick: () => goToFolder(undefined) },
      ...breadcrumb.map((crumb, i) => {
        const ultima = i === breadcrumb.length - 1;
        return {
          label: crumb.name,
          ...(ultima ? {} : { onClick: () => goToFolder(crumb.id) }),
          ...(ultima && podeCompartilhar
            ? {
                action: {
                  label: 'Gerenciar acesso a esta pasta',
                  icon: 'share' as const,
                  onClick: () => {
                    if (currentFolderMeta) setShareFolder(currentFolderMeta as DriveFolder);
                  },
                },
              }
            : {}),
        };
      }),
    ];
  }, [isMyDriveView, driveView, breadcrumb, goToFolder, currentFolderId, currentFolderMeta]);

  useBreadcrumbEntity(topBreadcrumbTrail);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidateDrive = () => {
    queryClient.invalidateQueries({ queryKey: ['drive'] });
    queryClient.invalidateQueries({ queryKey: ['drive-view'] });
    queryClient.invalidateQueries({ queryKey: ['drive-search'] });
    queryClient.invalidateQueries({ queryKey: ['drive-shares'] });
    queryClient.invalidateQueries({ queryKey: ['drive-storage'] });
  };

  const { data: shareRows = [] } = useQuery({
    queryKey: ['drive-shares', shareFolder?.id],
    queryFn: async () => {
      const res = await api.get(`/drive/folders/${shareFolder!.id}/shares`);
      return res.data.data as Array<{
        id: string;
        userId: string;
        permission: 'READ' | 'READ_WRITE';
        user: { id: string; name: string; email: string; cpf?: string | null; profilePhotoUrl?: string | null };
      }>;
    },
    enabled: !!shareFolder?.id,
  });

  const { data: allUsersForShare = [], isLoading: loadingShareUserList } = useQuery({
    queryKey: ['drive-share-candidates'],
    queryFn: async () => {
      const res = await api.get('/drive/share-candidates');
      return (res.data.data ?? []) as Array<{
        id: string;
        name: string;
        email: string;
        cpf?: string | null;
        profilePhotoUrl?: string | null;
      }>;
    },
    enabled: !!shareFolder,
    staleTime: 60_000,
  });

  const shareCandidateOptions = useMemo(() => {
    const sharedIds = new Set(shareRows.map((r) => r.userId));
    return toPersonSelectOptions(
      allUsersForShare
        .filter((u) => u.id !== user?.id && !sharedIds.has(u.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((u) => ({
          value: u.id,
          name: u.name,
          cpf: u.cpf,
          profilePhotoUrl: u.profilePhotoUrl,
          extraSearchText: u.email,
        })),
    );
  }, [allUsersForShare, shareRows, user?.id]);

  const addShareMut = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedShareUserIds);
      if (ids.length === 0) return { added: 0, failed: 0 };
      const results = await Promise.allSettled(
        ids.map((userId) =>
          api.post(`/drive/folders/${shareFolder!.id}/shares`, {
            userId,
            permission: 'READ' as const,
          }),
        ),
      );
      const added = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - added;
      // Motivo real devolvido pelo servidor (ex.: "Apenas o dono pode compartilhar"), em vez de uma mensagem genérica.
      const motivo = results
        .map((r) => (r.status === 'rejected' ? (r.reason as any)?.response?.data?.error : null))
        .find((m) => typeof m === 'string' && m.trim()) as string | undefined;
      return { added, failed, motivo };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['drive-shares', shareFolder?.id] });
      setSelectedShareUserIds(new Set());
      if (data == null) return;
      if (data.added > 0 && data.failed === 0) {
        toast.success(
          data.added === 1
            ? 'Pessoa adicionada. Ajuste a permissão abaixo, se quiser.'
            : `${data.added} pessoas adicionadas. Ajuste a permissão de cada uma abaixo, se quiser.`,
        );
      } else if (data.added > 0 && data.failed > 0) {
        toast.success(`${data.added} adicionado(s); ${data.failed} falhou(aram).${data.motivo ? ` ${data.motivo}` : ''}`);
      } else if (data.failed > 0) {
        toast.error(data.motivo || 'Não foi possível conceder acesso. Talvez alguns já tenham permissão.');
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao compartilhar'),
  });

  useEffect(() => {
    if (!showNewMenu) return;
    const handle = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
        setNewMenuCoords(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showNewMenu]);

  const closeNewMenu = useCallback(() => {
    setShowNewMenu(false);
    setNewMenuCoords(null);
  }, []);

  const openNewMenuAt = useCallback((clientX: number, clientY: number) => {
    const menuW = 190;
    const menuH = 90;
    const x = Math.min(clientX, window.innerWidth - menuW - 8);
    const y = Math.min(clientY, window.innerHeight - menuH - 8);
    setNewMenuCoords({ x: Math.max(8, x), y: Math.max(8, y) });
    setShowNewMenu(true);
  }, []);

  // Botão direito em qualquer ponto da área da página, inclusive no vazio abaixo dos arquivos
  // (antes só funcionava sobre o conteúdo, e no resto aparecia o menu do navegador).
  useEffect(() => {
    const raiz = driveRootRef.current;
    const area = (raiz?.closest('main') as HTMLElement | null) ?? raiz;
    if (!area) return;
    const aoClicarComBotaoDireito = (e: MouseEvent) => {
      if (!canWriteInCurrentFolder) return;
      const alvo = e.target as HTMLElement | null;
      if (
        alvo?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [data-drive-menu]',
        )
      ) {
        return;
      }
      e.preventDefault();
      openNewMenuAt(e.clientX, e.clientY);
    };
    area.addEventListener('contextmenu', aoClicarComBotaoDireito);
    return () => area.removeEventListener('contextmenu', aoClicarComBotaoDireito);
  }, [canWriteInCurrentFolder, openNewMenuAt]);

  const newMenuPanel = (
    <div
      ref={newMenuRef}
      role="menu"
      className={
        newMenuCoords
          ? 'fixed z-[60] min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900'
          : 'absolute right-0 z-30 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900'
      }
      style={
        newMenuCoords
          ? { left: newMenuCoords.x, top: newMenuCoords.y }
          : undefined
      }
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          closeNewMenu();
          setNewFolderName('');
          setShowNewFolder(true);
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <FolderPlus className="h-4 w-4" /> Nova pasta
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          closeNewMenu();
          fileInputRef.current?.click();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Upload className="h-4 w-4" /> Upload de arquivo
      </button>
    </div>
  );

  const removeShareMut = useMutation({
    mutationFn: (uid: string) =>
      api.delete(`/drive/folders/${shareFolder!.id}/shares/${uid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-shares', shareFolder?.id] });
      toast.success('Acesso removido');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao remover'),
  });

  const updateShareMut = useMutation({
    mutationFn: ({ uid, perm }: { uid: string; perm: 'READ' | 'READ_WRITE' }) =>
      api.patch(`/drive/folders/${shareFolder!.id}/shares/${uid}`, { permission: perm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-shares', shareFolder?.id] });
      toast.success('Permissão atualizada');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao atualizar'),
  });

  const appearanceMut = useMutation({
    mutationFn: async ({
      id,
      name,
      iconKey,
      iconColor,
      renomear,
      personalizar,
    }: {
      id: string;
      name: string;
      iconKey: string | null;
      iconColor: string | null;
      renomear: boolean;
      personalizar: boolean;
    }) => {
      if (renomear) await api.patch(`/drive/folders/${id}`, { name });
      if (personalizar) await api.patch(`/drive/folders/${id}/appearance`, { iconKey, iconColor });
    },
    onSuccess: () => {
      invalidateDrive();
      setAppearanceFolder(null);
      toast.success('Pasta atualizada');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao editar a pasta'),
  });

  const createFolderMut = useMutation({
    mutationFn: (name: string) =>
      api.post('/drive/folders', { name, parentId: currentFolderId ?? null }),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta criada com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao criar pasta');
    },
  });

  /** Move pasta (com o conteúdo) ou arquivo para outra pasta, ou para a raiz do Meu Drive (null). */
  const moveItemMut = useMutation({
    mutationFn: async ({ type, id, destinoId }: { type: 'folder' | 'file'; id: string; destinoId: string | null }): Promise<unknown> =>
      type === 'folder'
        ? api.patch(`/drive/folders/${id}/move`, { parentId: destinoId })
        : api.patch(`/drive/files/${id}/move`, { folderId: destinoId }),
    onSuccess: (_res, vars) => {
      toast.success(vars.type === 'folder' ? 'Pasta movida.' : 'Arquivo movido.');
      setMoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      queryClient.invalidateQueries({ queryKey: ['drive-view'] });
      queryClient.invalidateQueries({ queryKey: ['drive-move-folders'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Não foi possível mover'),
  });
  /** Move vários itens de uma vez (um por um, para relatar o que falhou). */
  const [bulkMoveItems, setBulkMoveItems] = useState<DriveDragItem[] | null>(null);
  const bulkMoveMut = useMutation({
    mutationFn: async ({ items, destinoId }: { items: DriveDragItem[]; destinoId: string | null }) => {
      let ok = 0;
      for (const it of items) {
        try {
          await (it.type === 'folder'
            ? api.patch(`/drive/folders/${it.id}/move`, { parentId: destinoId })
            : api.patch(`/drive/files/${it.id}/move`, { folderId: destinoId }));
          ok += 1;
        } catch {
          /* conta como falha */
        }
      }
      return { ok, failed: items.length - ok };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok > 0) toast.success(ok === 1 ? '1 item movido.' : `${ok} itens movidos.`);
      if (failed > 0) toast.error(failed === 1 ? '1 item não pôde ser movido.' : `${failed} itens não puderam ser movidos.`);
      setBulkMoveItems(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      queryClient.invalidateQueries({ queryKey: ['drive-view'] });
      queryClient.invalidateQueries({ queryKey: ['drive-move-folders'] });
    },
  });
  const soltarEmPasta = (items: DriveDragItem[], targetFolderId: string) => {
    if (items.length === 1) {
      moveItemMut.mutate({ type: items[0]!.type, id: items[0]!.id, destinoId: targetFolderId });
      return;
    }
    bulkMoveMut.mutate({ items, destinoId: targetFolderId });
  };

  const renameFolderMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/drive/folders/${id}`, { name }),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta renomeada!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao renomear pasta');
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/folders/${id}`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta movida para a lixeira');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao excluir pasta');
    },
  });

  const renameFileMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/drive/files/${id}`, { name }),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo renomeado!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao renomear arquivo');
    },
  });

  const deleteFileMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/files/${id}`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo movido para a lixeira');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao excluir arquivo');
    },
  });

  const starFolderMut = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch(`/drive/folders/${id}/star`, { starred }),
    onSuccess: (_d, vars) => {
      invalidateDrive();
      toast.success(vars.starred ? 'Pasta marcada com estrela' : 'Estrela removida');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao marcar pasta'),
  });

  const starFileMut = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch(`/drive/files/${id}/star`, { starred }),
    onSuccess: (_d, vars) => {
      invalidateDrive();
      toast.success(vars.starred ? 'Arquivo marcado com estrela' : 'Estrela removida');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao marcar arquivo'),
  });

  const restoreFolderMut = useMutation({
    mutationFn: (id: string) => api.post(`/drive/folders/${id}/restore`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta restaurada');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao restaurar'),
  });

  const restoreFileMut = useMutation({
    mutationFn: (id: string) => api.post(`/drive/files/${id}/restore`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo restaurado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao restaurar'),
  });

  const permanentDeleteFolderMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/folders/${id}/permanent`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta excluída permanentemente');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao excluir'),
  });

  const permanentDeleteFileMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/files/${id}/permanent`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo excluído permanentemente');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao excluir'),
  });

  /** Excluir (lixeira ou definitivo) e restaurar vários itens de uma vez. */
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const bulkDeleteMut = useMutation({
    mutationFn: async ({ items, permanent }: { items: DriveDragItem[]; permanent: boolean }) => {
      let ok = 0;
      for (const it of items) {
        try {
          const base = it.type === 'folder' ? `/drive/folders/${it.id}` : `/drive/files/${it.id}`;
          await api.delete(permanent ? `${base}/permanent` : base);
          ok += 1;
        } catch {
          /* conta como falha */
        }
      }
      return { ok, failed: items.length - ok, permanent };
    },
    onSuccess: ({ ok, failed, permanent }) => {
      if (ok > 0) {
        toast.success(
          permanent
            ? ok === 1 ? '1 item excluído permanentemente.' : `${ok} itens excluídos permanentemente.`
            : ok === 1 ? '1 item movido para a lixeira.' : `${ok} itens movidos para a lixeira.`,
        );
      }
      if (failed > 0) toast.error(failed === 1 ? '1 item não pôde ser excluído.' : `${failed} itens não puderam ser excluídos.`);
      setBulkDeleteOpen(false);
      clearSelection();
      invalidateDrive();
    },
  });
  const bulkRestoreMut = useMutation({
    mutationFn: async (items: DriveDragItem[]) => {
      let ok = 0;
      for (const it of items) {
        try {
          await api.post(it.type === 'folder' ? `/drive/folders/${it.id}/restore` : `/drive/files/${it.id}/restore`);
          ok += 1;
        } catch {
          /* conta como falha */
        }
      }
      return { ok, failed: items.length - ok };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok > 0) toast.success(ok === 1 ? '1 item restaurado.' : `${ok} itens restaurados.`);
      if (failed > 0) toast.error(failed === 1 ? '1 item não pôde ser restaurado.' : `${failed} itens não puderam ser restaurados.`);
      clearSelection();
      invalidateDrive();
    },
  });

  // ── Upload ─────────────────────────────────────────────────────────────────

  const patchUploadItem = useCallback((id: string, patch: Partial<DriveUploadItem>) => {
    setUploadItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const cancelUploadItem = useCallback((id: string) => {
    const ctrl = uploadAbortRef.current.get(id);
    ctrl?.abort();
    uploadAbortRef.current.delete(id);
    patchUploadItem(id, { status: 'cancelled', progress: 0 });
  }, [patchUploadItem]);

  const cancelAllUploads = useCallback(() => {
    uploadAbortRef.current.forEach((ctrl) => ctrl.abort());
    uploadAbortRef.current.clear();
    setUploadItems((prev) =>
      prev.map((it) =>
        it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued'
          ? { ...it, status: 'cancelled' as const, progress: 0 }
          : it,
      ),
    );
  }, []);

  const closeUploadPanel = useCallback(() => {
    const hasActive = uploadItems.some(
      (it) => it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued',
    );
    if (hasActive) {
      cancelAllUploads();
    }
    setUploadItems([]);
    setUploadPanelMinimized(false);
  }, [uploadItems, cancelAllUploads]);

  const uploadOneFile = useCallback(
    async (file: File, itemId: string, folderId: string | undefined, signal: AbortSignal) => {
      let startedAt = Date.now();
      patchUploadItem(itemId, {
        status: 'uploading',
        startedAt,
        loaded: 0,
        progress: 0,
      });

      const onProgress = (loaded: number, total: number) => {
        const elapsedSec = Math.max(0.05, (Date.now() - startedAt) / 1000);
        const speedBps = loaded / elapsedSec;
        const doneBytes = total > 0 && loaded >= total;
        const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
        patchUploadItem(itemId, {
          loaded,
          size: total || file.size,
          progress: pct,
          speedBps,
          status: doneBytes ? 'finalizing' : 'uploading',
        });
      };

      const runProxyUpload = async () => {
        startedAt = Date.now();
        patchUploadItem(itemId, {
          status: 'uploading',
          loaded: 0,
          progress: 0,
          startedAt,
        });
        await postFileViaApi(file, folderId, onProgress, signal);
      };

      let uploadedViaS3 = false;
      let finishedViaProxy = false;

      try {
        const presignRes = await api.post(
          '/drive/files/presign',
          {
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            folderId: folderId || undefined,
          },
          { timeout: 60_000 },
        );
        const { uploadUrl, s3Key, contentType } = presignRes.data.data as {
          uploadUrl: string;
          s3Key: string;
          contentType: string;
        };

        try {
          await putFileToPresignedUrl(
            uploadUrl,
            file,
            contentType || file.type || 'application/octet-stream',
            onProgress,
            signal,
          );
          uploadedViaS3 = true;
        } catch (putErr) {
          if (isAbortError(putErr) || signal.aborted) throw putErr;
          // CORS / rede → sobe pelo API (mais lento em arquivos grandes)
          await runProxyUpload();
          finishedViaProxy = true;
        }

        if (uploadedViaS3) {
          patchUploadItem(itemId, { status: 'finalizing', progress: 99 });
          await api.post(
            '/drive/files/confirm',
            {
              s3Key,
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              folderId: folderId || undefined,
            },
            { timeout: 120_000 },
          );
        }
      } catch (err) {
        if (isAbortError(err) || signal.aborted) throw err;
        if (uploadedViaS3 || finishedViaProxy) throw err;
        await runProxyUpload();
      }

      patchUploadItem(itemId, {
        status: 'done',
        progress: 100,
        loaded: file.size,
      });
    },
    [patchUploadItem],
  );

  const uploadFiles = useCallback(
    async (droppedAll: DriveDroppedFile[]) => {
      if (droppedAll.length === 0) {
        toast.error('Nenhum arquivo encontrado. Se arrastou uma pasta, tente de novo.');
        return;
      }

      // Nome repetido na pasta atual (só arquivos enviados direto nela, não os de subpastas arrastadas).
      const existingByName = new Map(filesRef.current.map((f) => [f.name.trim().toLowerCase(), f.id]));
      const replaceByFile = new Map<File, string>();
      for (const d of droppedAll) {
        if (d.relativePath.replace(/\\/g, '/').includes('/')) continue;
        const existingId = existingByName.get(d.file.name.trim().toLowerCase());
        if (existingId) replaceByFile.set(d.file, existingId);
      }
      let dropped = droppedAll;
      if (replaceByFile.size > 0) {
        const names = droppedAll.filter((d) => replaceByFile.has(d.file)).map((d) => d.file.name);
        const replace = await askReplace(names);
        if (!replace) {
          // Cancelar: não envia os repetidos (os demais seguem normalmente).
          dropped = droppedAll.filter((d) => !replaceByFile.has(d.file));
          replaceByFile.clear();
          if (dropped.length === 0) {
            toast('Envio cancelado.');
            return;
          }
        }
      }

      const rootFolderId = currentFolderId;
      /** path relativo da pasta (sem o nome do arquivo) → id no Drive */
      const folderIdByPath = new Map<string, string | undefined>();
      folderIdByPath.set('', rootFolderId);

      const ensureFolderPath = async (dirPath: string): Promise<string | undefined> => {
        if (!dirPath) return rootFolderId;
        if (folderIdByPath.has(dirPath)) return folderIdByPath.get(dirPath);

        const parts = dirPath.split('/').filter(Boolean);
        let parentId = rootFolderId;
        let built = '';
        for (const part of parts) {
          built = built ? `${built}/${part}` : part;
          if (folderIdByPath.has(built)) {
            parentId = folderIdByPath.get(built);
            continue;
          }
          const res = await api.post('/drive/folders', {
            name: part,
            parentId: parentId ?? null,
          });
          const createdId = (res.data.data as { id: string }).id;
          folderIdByPath.set(built, createdId);
          parentId = createdId;
        }
        return parentId;
      };

      const batch = dropped.map(({ file, relativePath }) => {
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const normalized = relativePath.replace(/\\/g, '/');
        const slash = normalized.lastIndexOf('/');
        const dirPath = slash >= 0 ? normalized.slice(0, slash) : '';
        return {
          id,
          name: file.name,
          size: file.size,
          loaded: 0,
          progress: 0,
          status: 'queued' as const,
          startedAt: Date.now(),
          file,
          dirPath,
        };
      });

      setUploadPanelMinimized(false);
      setUploadItems((prev) => [
        ...prev.filter((it) => it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued'),
        ...batch.map(({ file: _f, dirPath: _d, ...rest }) => rest),
      ]);

      let ok = 0;
      let failed = 0;

      for (const item of batch) {
        const ctrl = new AbortController();
        uploadAbortRef.current.set(item.id, ctrl);
        try {
          if (!item.file.size) {
            throw new Error('Arquivo vazio ou pasta inválida');
          }
          const targetFolderId = await ensureFolderPath(item.dirPath);
          await uploadOneFile(item.file, item.id, targetFolderId, ctrl.signal);
          ok += 1;
          // Substituição: o novo já subiu, então o antigo vai para a lixeira (dá para restaurar).
          const oldId = replaceByFile.get(item.file);
          if (oldId) await api.delete(`/drive/files/${oldId}`).catch(() => undefined);
        } catch (err: unknown) {
          if (isAbortError(err) || ctrl.signal.aborted) {
            patchUploadItem(item.id, { status: 'cancelled' });
          } else {
            failed += 1;
            const msg =
              err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                : undefined;
            patchUploadItem(item.id, {
              status: 'error',
              error: msg || (err instanceof Error ? err.message : 'Falha no upload'),
            });
          }
        } finally {
          uploadAbortRef.current.delete(item.id);
        }
      }

      if (ok > 0) {
        invalidateDrive();
        toast.success(ok === 1 ? 'Arquivo enviado com sucesso!' : `${ok} arquivos enviados!`);
      }
      if (failed > 0 && ok === 0) {
        toast.error(failed === 1 ? 'Falha no upload' : `${failed} uploads falharam`);
      }
    },
    [currentFolderId, uploadOneFile, patchUploadItem, askReplace],
  );

  const isUploading = uploadItems.some(
    (it) => it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued',
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void uploadFiles(filesFromFileList(e.target.files));
    }
    e.target.value = '';
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (!canWriteInCurrentFolder) {
        toast.error('Não é possível enviar arquivos nesta pasta (somente leitura).');
        return;
      }
      try {
        const files = await collectFilesFromDataTransfer(e.dataTransfer);
        await uploadFiles(files);
      } catch {
        toast.error('Não foi possível ler a pasta arrastada. Tente novamente.');
      }
    },
    [uploadFiles, canWriteInCurrentFolder],
  );

  // ── Download ───────────────────────────────────────────────────────────────

  const downloadFile = async (file: DriveFile) => {
    try {
      const res = await api.get(`/drive/files/${file.id}/download`);
      const url = res.data.data.url;
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      // A URL assinada já força "attachment": baixa direto, sem abrir outra aba.
      a.rel = 'noopener';
      a.click();
    } catch {
      toast.error('Erro ao gerar link de download');
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openFolder = (id: string) => {
    goToFolder(id);
  };

  const openRename = (type: 'folder' | 'file', id: string, name: string) => {
    setRenameTarget({ type, id, name });
    setRenameName(name);
  };

  const submitRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    if (renameTarget.type === 'folder') {
      await renameFolderMut.mutateAsync({ id: renameTarget.id, name: renameName.trim() });
    } else {
      await renameFileMut.mutateAsync({ id: renameTarget.id, name: renameName.trim() });
    }
    setRenameTarget(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (isTrashView) {
      if (deleteTarget.type === 'folder') {
        await permanentDeleteFolderMut.mutateAsync(deleteTarget.id);
      } else {
        await permanentDeleteFileMut.mutateAsync(deleteTarget.id);
      }
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.type === 'folder') {
      const wasViewingThisFolder = deleteTarget.id === currentFolderId;
      await deleteFolderMut.mutateAsync(deleteTarget.id);
      if (wasViewingThisFolder) {
        if (breadcrumb.length >= 2) {
          goToFolder(breadcrumb[breadcrumb.length - 2]!.id);
        } else {
          goToFolder(undefined);
        }
      }
    } else {
      await deleteFileMut.mutateAsync(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  // ── Loading inicial (padrão do sistema) ───────────────────────────────────

  if (loadingUser || !userData) {
    return <Loading message="Carregando Drive..." fullScreen size="lg" />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <MainLayout userRole={user?.role} userName={user?.name} onLogout={handleLogout}>
      {/* Zona de drag-and-drop global */}
      <div
        className="min-h-full"
        onDragOver={(e) => {
          if (isDriveItemDrag(e)) return;
          if (!canWriteInCurrentFolder) return;
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingOver(false);
          }
        }}
        onDrop={(e) => {
          if (isDriveItemDrag(e)) return;
          void handleDrop(e);
        }}
        ref={driveRootRef}
      >
        {/* Overlay drag-and-drop */}
        {isDraggingOver && canWriteInCurrentFolder && (
          <div className="fixed inset-0 z-[2000] bg-red-600/10 border-4 border-dashed border-red-500 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl text-center border border-gray-200 dark:border-gray-700">
              <Upload className="h-12 w-12 text-red-600 dark:text-red-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Solte para fazer upload
              </p>
            </div>
          </div>
        )}

        {/* Input oculto para upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          {/* Coluna da esquerda: fica parada ao rolar a página (título + menu lateral). */}
          <div className="flex w-full shrink-0 flex-col gap-5 lg:sticky lg:top-0 lg:w-52 lg:self-start">
            <h1 className="sr-only">
              {driveView === 'shared'
                ? 'Compartilhados comigo'
                : driveView === 'recent'
                  ? 'Recentes'
                  : driveView === 'starred'
                    ? 'Com estrela'
                    : driveView === 'trash'
                      ? 'Lixeira'
                      : nomePastaAtual}
            </h1>
            <DriveSidebar
              activeView={driveView}
              onChangeView={setDriveView}
              storage={storageInfo}
              storageLoading={loadingStorage}
              onNew={
                canWriteInCurrentFolder
                  ? (anchor) => openNewMenuAt(anchor.left, anchor.bottom + 6)
                  : undefined
              }
              newLoading={isUploading}
            />
          </div>

          <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="group relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Buscar arquivos e pastas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                aria-label="Buscar arquivos e pastas"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  title="Limpar busca (Esc)"
                  className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <DriveFilters filters={filters} onChange={setFilters} />

            <DriveSelectionBar
              count={selectedItems.length}
              trashMode={isTrashView}
              busy={bulkMoveMut.isPending || bulkDeleteMut.isPending || bulkRestoreMut.isPending}
              onMove={() => setBulkMoveItems(selectedItems.map(({ type, id }) => ({ type, id })))}
              onDelete={() => setBulkDeleteOpen(true)}
              onRestore={() => bulkRestoreMut.mutate(selectedItems.map(({ type, id }) => ({ type, id })))}
              onClear={clearSelection}
            />
            </div>

            <div className="flex h-9 items-center gap-2">
              {!isLoading && !contentsError && !isEmpty && (
                <DriveViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
              )}
            </div>
          </div>

        {searchQuery && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Resultados para{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              &ldquo;{searchQuery}&rdquo;
            </span>{' '}
            — {folders.length + files.length} item(s)
          </p>
        )}

        {/* ── Conteúdo ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <CadastroListLoading message="Carregando arquivos..." />
          </div>
        ) : contentsError ? (
          <Card>
            <CardContent className="py-10 text-center">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
              <p className="font-medium text-gray-700 dark:text-gray-300">
                Erro ao carregar o Drive
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Verifique se o servidor está rodando e tente novamente.
              </p>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['drive'] })}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
              >
                Tentar novamente
              </button>
            </CardContent>
          </Card>
        ) : isEmpty ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-600 dark:bg-gray-900/40">
            <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-2xl bg-red-50 p-4 dark:bg-red-950/30">
              {driveView === 'trash' ? (
                <Trash2 className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : driveView === 'starred' ? (
                <Star className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : driveView === 'shared' ? (
                <Users className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : driveView === 'recent' ? (
                <Clock className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : (
                <HardDrive className="h-9 w-9 text-red-500 dark:text-red-400" />
              )}
            </div>
            <p className="mb-1 text-base font-semibold text-gray-800 dark:text-gray-200">
              {filtersActive
                ? 'Nenhum item com esses filtros'
                : searchQuery
                ? 'Nenhum resultado encontrado'
                : driveView === 'shared'
                  ? 'Nada compartilhado com você'
                  : driveView === 'recent'
                    ? 'Nenhum arquivo recente'
                    : driveView === 'starred'
                      ? 'Nenhum item com estrela'
                      : driveView === 'trash'
                        ? 'Lixeira vazia'
                        : 'Pasta vazia'}
            </p>
            <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              {filtersActive
                ? 'Mude ou limpe os filtros para ver os outros itens.'
                : searchQuery
                ? 'Tente uma busca diferente'
                : driveView === 'shared'
                  ? 'Quando alguém compartilhar uma pasta com você, ela aparecerá aqui.'
                  : driveView === 'recent'
                    ? 'Arquivos que você abrir ou alterar aparecerão aqui.'
                    : driveView === 'starred'
                      ? 'Marque pastas ou arquivos com estrela para encontrá-los rápido.'
                      : driveView === 'trash'
                        ? 'Itens excluídos ficam aqui até serem restaurados ou apagados.'
                        : canWriteInCurrentFolder
                          ? 'Faça upload de arquivos ou crie uma nova pasta para começar.'
                          : 'Esta pasta foi compartilhada com acesso somente leitura.'}
            </p>
            {!searchQuery && !filtersActive && isMyDriveView && canWriteInCurrentFolder && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Upload className="h-4 w-4" />
                  Upload de arquivo
                </button>
                <button
                  onClick={() => {
                    setNewFolderName('');
                    setShowNewFolder(true);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <FolderPlus className="h-4 w-4" />
                  Nova pasta
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <GridView
            folders={folders}
            files={files}
            onOpenFolder={openFolder}
            onDownload={downloadFile}
            onPreview={setPreviewFile}
            onRename={openRename}
            onDelete={(type, id, name) => setDeleteTarget({ type, id, name })}
            onOpenShare={setShareFolder}
            onCustomize={setAppearanceFolder}
            onToggleStar={(type, id, starred) => {
              if (type === 'folder') starFolderMut.mutate({ id, starred });
              else starFileMut.mutate({ id, starred });
            }}
            onRestore={(type, id) => {
              if (type === 'folder') restoreFolderMut.mutate(id);
              else restoreFileMut.mutate(id);
            }}
            onMove={(type, id, name) => setMoveTarget({ type, id, name })}
            onDropInto={soltarEmPasta}
            selectedKeys={selectedSet}
            onSelect={handleSelect}
            onClearSelection={clearSelection}
            dragItemsFor={dragItemsFor}
            draggingKeys={draggingKeys}
            onDragStateChange={onDragStateChange}
            canMoveOthers={canMoveOthers}
            trashMode={isTrashView}
            currentUserId={user?.id}
          />
        ) : (
          <DriveListView
            folders={folders}
            files={files}
            onOpenFolder={openFolder}
            onDownload={downloadFile}
            onPreview={setPreviewFile}
            onRename={openRename}
            onDelete={(type, id, name) => setDeleteTarget({ type, id, name })}
            onOpenShare={setShareFolder}
            onCustomize={setAppearanceFolder}
            onToggleStar={(type, id, starred) => {
              if (type === 'folder') starFolderMut.mutate({ id, starred });
              else starFileMut.mutate({ id, starred });
            }}
            onRestore={(type, id) => {
              if (type === 'folder') restoreFolderMut.mutate(id);
              else restoreFileMut.mutate(id);
            }}
            onMove={(type, id, name) => setMoveTarget({ type, id, name })}
            onDropInto={soltarEmPasta}
            selectedKeys={selectedSet}
            onSelect={handleSelect}
            onClearSelection={clearSelection}
            dragItemsFor={dragItemsFor}
            draggingKeys={draggingKeys}
            onDragStateChange={onDragStateChange}
            canMoveOthers={canMoveOthers}
            trashMode={isTrashView}
            currentUserId={user?.id}
          />
        )}
          </div>
        </div>

        {/* ── Modais ─────────────────────────────────────────────────────── */}

        <DriveMoveModal
          item={
            bulkMoveItems
              ? {
                  type: 'file',
                  id: '__bulk__',
                  name: `${bulkMoveItems.length} itens`,
                  blockedIds: bulkMoveItems.filter((i) => i.type === 'folder').map((i) => i.id),
                }
              : null
          }
          onClose={() => setBulkMoveItems(null)}
          moving={bulkMoveMut.isPending}
          onConfirm={(_item, destinoId) => bulkMoveItems && bulkMoveMut.mutate({ items: bulkMoveItems, destinoId })}
        />

        <Modal
          isOpen={bulkDeleteOpen}
          onClose={() => setBulkDeleteOpen(false)}
          confirmBeforeClose={false}
          title={isTrashView ? 'Excluir permanentemente' : 'Mover para a lixeira'}
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {isTrashView ? (
                    <>
                      Tem certeza que deseja excluir permanentemente{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedItems.length} itens</span>?
                      Esta ação não pode ser desfeita.
                    </>
                  ) : (
                    <>
                      Mover{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedItems.length} itens</span>{' '}
                      para a lixeira?
                    </>
                  )}
                </p>
                {selectedItems.some((i) => i.type === 'folder') ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {isTrashView
                      ? 'Todo o conteúdo das pastas selecionadas será excluído permanentemente.'
                      : 'As pastas selecionadas e todo o conteúdo delas serão movidos para a lixeira.'}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBulkDeleteOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                disabled={bulkDeleteMut.isPending}
                onClick={() =>
                  bulkDeleteMut.mutate({
                    items: selectedItems.map(({ type, id }) => ({ type, id })),
                    permanent: isTrashView,
                  })
                }
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:bg-red-400"
              >
                {bulkDeleteMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isTrashView ? 'Excluir permanentemente' : 'Mover para lixeira'}
              </button>
            </div>
          </div>
        </Modal>

        <DriveMoveModal
          item={moveTarget}
          onClose={() => setMoveTarget(null)}
          moving={moveItemMut.isPending}
          onConfirm={(item, destinoId) => moveItemMut.mutate({ type: item.type, id: item.id, destinoId })}
        />

        {previewFile ? (
          <DriveFilePreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
            onDownload={() => downloadFile(previewFile)}
          />
        ) : null}

        {/* Nova Pasta */}
        <FolderAppearanceModal
          folder={appearanceFolder}
          saving={appearanceMut.isPending}
          onClose={() => setAppearanceFolder(null)}
          onSave={(id, dados) =>
            appearanceMut.mutate({
              id,
              ...dados,
              renomear: dados.name !== (appearanceFolder?.name ?? ''),
              personalizar:
                (dados.iconKey ?? null) !== (appearanceFolder?.iconKey ?? null) ||
                (dados.iconColor ?? null) !== (appearanceFolder?.iconColor ?? null),
            })
          }
        />

        <Modal
          isOpen={showNewFolder}
          onClose={() => setShowNewFolder(false)}
          title="Nova Pasta"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome da pasta
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Digite o nome da pasta..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    createFolderMut.mutate(newFolderName.trim());
                    setShowNewFolder(false);
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewFolder(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={!newFolderName.trim() || createFolderMut.isPending}
                onClick={() => {
                  createFolderMut.mutate(newFolderName.trim());
                  setShowNewFolder(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {createFolderMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar
              </button>
            </div>
          </div>
        </Modal>

        {/* Arquivo já existe: substituir ou cancelar */}
        <Modal
          isOpen={!!replaceDialog}
          onClose={() => answerReplace(false)}
          confirmBeforeClose={false}
          title={
            (replaceDialog?.names.length ?? 0) > 1
              ? 'Arquivos já existem nesta pasta'
              : 'Arquivo já existe nesta pasta'
          }
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {(replaceDialog?.names.length ?? 0) > 1
                ? 'Já existem arquivos com estes nomes. Deseja substituí-los pelos novos?'
                : 'Já existe um arquivo com este nome. Deseja substituí-lo pelo novo?'}
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
              {replaceDialog?.names.map((n, i) => (
                <li key={`${n}-${i}`} className="truncate" title={n}>
                  {n}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ao substituir, a versão antiga vai para a lixeira. Ao cancelar, o arquivo repetido não é enviado.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => answerReplace(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                autoFocus
                onClick={() => answerReplace(true)}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Substituir
              </button>
            </div>
          </div>
        </Modal>

        {/* Renomear */}
        <Modal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          title={`Renomear ${renameTarget?.type === 'folder' ? 'pasta' : 'arquivo'}`}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Novo nome
              </label>
              <input
                type="text"
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameName.trim()) submitRename();
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={
                  !renameName.trim() ||
                  renameFolderMut.isPending ||
                  renameFileMut.isPending
                }
                onClick={submitRename}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {(renameFolderMut.isPending || renameFileMut.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </Modal>

        {/* Excluir / Lixeira */}
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          confirmBeforeClose={false}
          title={isTrashView ? 'Excluir permanentemente' : 'Mover para a lixeira'}
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {isTrashView ? (
                    <>
                      Tem certeza que deseja excluir permanentemente{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        &ldquo;{deleteTarget?.name}&rdquo;
                      </span>
                      ? Esta ação não pode ser desfeita.
                    </>
                  ) : (
                    <>
                      Mover{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        &ldquo;{deleteTarget?.name}&rdquo;
                      </span>{' '}
                      para a lixeira?
                    </>
                  )}
                </p>
                {deleteTarget?.type === 'folder' && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {isTrashView
                      ? 'Todo o conteúdo da pasta será excluído permanentemente.'
                      : 'A pasta e todo o conteúdo serão movidos para a lixeira.'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={
                  deleteFolderMut.isPending ||
                  deleteFileMut.isPending ||
                  permanentDeleteFolderMut.isPending ||
                  permanentDeleteFileMut.isPending
                }
                onClick={submitDelete}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {(deleteFolderMut.isPending ||
                  deleteFileMut.isPending ||
                  permanentDeleteFolderMut.isPending ||
                  permanentDeleteFileMut.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {isTrashView ? 'Excluir permanentemente' : 'Mover para lixeira'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Compartilhamento de pasta */}
        <Modal
          isOpen={!!shareFolder}
          onClose={() => {
            setShareFolder(null);
            setSelectedShareUserIds(new Set());
          }}
          title={shareFolder ? `Acesso: ${shareFolder.name}` : 'Acesso à pasta'}
          size="md"
        >
          {shareFolder && (
            <div className="space-y-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Adicionar pessoas
                </label>
                <div className="flex items-start gap-2">
                  <MultiSelectSearchDropdown
                    className="min-w-0 flex-1"
                    options={shareCandidateOptions}
                    selected={Array.from(selectedShareUserIds)}
                    onChange={(ids) => setSelectedShareUserIds(new Set(ids))}
                    placeholder={loadingShareUserList ? 'Carregando pessoas...' : 'Selecionar pessoas...'}
                    searchPlaceholder="Pesquisar por nome ou CPF..."
                    emptyOptionsMessage="Não há outras pessoas disponíveis."
                    emptySearchMessage="Nenhuma pessoa encontrada."
                    disabled={loadingShareUserList}
                    noFocusRing
                  />
                  <button
                    type="button"
                    disabled={selectedShareUserIds.size === 0 || addShareMut.isPending}
                    onClick={() => addShareMut.mutate()}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    {addShareMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {selectedShareUserIds.size > 0 ? `Adicionar (${selectedShareUserIds.size})` : 'Adicionar'}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Pessoas com acesso</p>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{shareRows.length}</span>
                </div>
                {shareRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    Ninguém além de você.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                    {shareRows.map((row) => {
                      const foto = resolveApiMediaUrl(row.user.profilePhotoUrl ?? null);
                      const cpf = formatPersonCpf(row.user.cpf);
                      return (
                        <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                            {foto ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={foto} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              personInitials(row.user.name)
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{row.user.name}</p>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{cpf || row.user.email}</p>
                          </div>
                          <StringSingleSelectDropdown
                            value={row.permission}
                            onChange={(perm) =>
                              updateShareMut.mutate({ uid: row.userId, perm: perm as 'READ' | 'READ_WRITE' })
                            }
                            options={SHARE_PERMISSION_OPTIONS}
                            disabled={updateShareMut.isPending}
                            allowEmpty={false}
                            className="w-36 shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Remover acesso desta pessoa?')) removeShareMut.mutate(row.userId);
                            }}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                            title="Remover acesso"
                            aria-label={`Remover acesso de ${row.user.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Modal>

        {showNewMenu && newMenuCoords ? newMenuPanel : null}

        <DriveUploadPanel
          items={uploadItems}
          minimized={uploadPanelMinimized}
          onToggleMinimized={() => setUploadPanelMinimized((v) => !v)}
          onClose={closeUploadPanel}
          onCancelAll={cancelAllUploads}
          onCancelItem={cancelUploadItem}
        />
      </div>
    </MainLayout>
  );
}

export default function DrivePage() {
  return (
    <Suspense fallback={<Loading message="Carregando Drive..." fullScreen size="lg" />}>
      <DrivePageContent />
    </Suspense>
  );
}

// ── Vista em grade ────────────────────────────────────────────────────────────

function GridView({
  folders,
  files,
  onOpenFolder,
  onDownload,
  onPreview,
  onRename,
  onDelete,
  onOpenShare,
  onCustomize,
  onToggleStar,
  onRestore,
  onMove,
  onDropInto,
  selectedKeys,
  onSelect,
  onClearSelection,
  dragItemsFor,
  draggingKeys,
  onDragStateChange,
  canMoveOthers = false,
  trashMode,
  currentUserId,
}: {
  folders: DriveFolder[];
  files: DriveFile[];
  onOpenFolder: (id: string) => void;
  onDownload: (f: DriveFile) => void;
  onPreview: (f: DriveFile) => void;
  onRename: (type: 'folder' | 'file', id: string, name: string) => void;
  onDelete: (type: 'folder' | 'file', id: string, name: string) => void;
  onOpenShare?: (folder: DriveFolder) => void;
  onCustomize?: (folder: DriveFolder) => void;
  onToggleStar?: (type: 'folder' | 'file', id: string, starred: boolean) => void;
  onRestore?: (type: 'folder' | 'file', id: string) => void;
  onMove?: (type: 'folder' | 'file', id: string, name: string) => void;
  onDropInto?: (items: DriveDragItem[], targetFolderId: string) => void;
  selectedKeys: Set<string>;
  onSelect: (key: string, mods: SelectMods) => void;
  onClearSelection: () => void;
  dragItemsFor: (item: DriveDragItem) => DriveDragItem[];
  draggingKeys: Set<string>;
  onDragStateChange: (keys: string[] | null) => void;
  /** Pode mover também itens de outras pessoas (pasta onde tenho edição). */
  canMoveOthers?: boolean;
  trashMode?: boolean;
  currentUserId?: string;
}) {
  const canManage = (f: DriveFolder) =>
    f.canManageShares ?? (!!currentUserId && f.ownerId === currentUserId);
  const isOwnerFile = (f: DriveFile) => !!currentUserId && f.ownerId === currentUserId;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** Pasta destacada enquanto um item é arrastado sobre ela. */
  const [dropAlvo, setDropAlvo] = useState<string | null>(null);
  const fecharMenu = useCallback(() => setOpenMenuId(null), []);
  useDriveMenuDismiss(openMenuId !== null, fecharMenu);

  return (
    <div
      className="space-y-6"
      onClick={() => {
        setOpenMenuId(null);
        onClearSelection();
      }}
    >
      {folders.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Pastas
          </h2>
          <div className="drive-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {folders.map((folder) => {
              const shared = folder.isOwner === false;
              const sel = selectedKeys.has(`folder-${folder.id}`);
              return (
                <div key={folder.id} className="relative min-w-0">
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={!trashMode && !!onMove && (canMoveOthers || folder.ownerId === currentUserId)}
                    data-drive-item
                    data-drive-key={`folder-${folder.id}`}
style={draggingKeys.has(`folder-${folder.id}`) ? { opacity: 0.45 } : undefined}
                    onDragStart={(e) => {
                      const items = dragItemsFor({ type: 'folder', id: folder.id });
                      startDriveItemDrag(e, items);
                      onDragStateChange(items.map((i) => `${i.type}-${i.id}`));
                    }}
                    onDragEnd={() => onDragStateChange(null)}
                    {...(!trashMode ? folderDropProps(folder.id, onDropInto, setDropAlvo) : {})}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(null);
                      onSelect(`folder-${folder.id}`, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
                    }}
                    onDoubleClick={() => {
                      setOpenMenuId(null);
                      if (!trashMode) onOpenFolder(folder.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setOpenMenuId(null);
                        if (!trashMode) onOpenFolder(folder.id);
                      } else if (e.key === ' ') {
                        e.preventDefault();
                        onSelect(`folder-${folder.id}`, { ctrl: true, shift: false });
                      }
                    }}
                    className={`group flex w-full select-none items-center gap-2.5 rounded-xl outline-none drive-item-card border border-gray-200 bg-white p-3 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800/60 ${
                      trashMode ? 'cursor-default' : 'cursor-pointer'
                    } ${dropAlvo === folder.id ? '!border-red-300 !bg-red-50 scale-[1.03] shadow-lg dark:!border-red-800 dark:!bg-[#2b1518]' : ''} ${
                      sel ? '!border-red-300 !bg-red-50 dark:!border-red-800 dark:!bg-[#2b1518]' : ''
                    }`}
                  >
                    <FolderIconTile
                      iconKey={folder.iconKey}
                      color={folder.iconColor}
                      shared={shared}
                      className="drive-item-card__icon h-8 w-8 rounded-lg"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {folder.name}
                    </span>
                    {folder.starred && !trashMode && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    )}
                    <button
                      type="button"
                      data-drive-menu
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === folder.id ? null : folder.id);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                      aria-label={`Opções de ${folder.name}`}
                      data-drive-menu-btn
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                  {openMenuId === folder.id && (
                    <div data-drive-menu className="absolute right-0 top-12 z-20 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {trashMode ? (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onRestore?.('folder', folder.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <RotateCcw className="h-4 w-4" /> Restaurar
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); onDelete('folder', folder.id, folder.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir permanentemente
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onOpenFolder(folder.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Folder className="h-4 w-4" /> Abrir
                          </button>
                          {canManage(folder) && onToggleStar && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onToggleStar('folder', folder.id, !folder.starred);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Star className={`h-4 w-4 ${folder.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                              {folder.starred ? 'Remover estrela' : 'Com estrela'}
                            </button>
                          )}
                          {onMove && (canMoveOthers || folder.ownerId === currentUserId) && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onMove('folder', folder.id, folder.name);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <FolderInput className="h-4 w-4" />
                              Mover
                            </button>
                          )}
                          {canManage(folder) && onOpenShare && (
                            <button
                              onClick={() => { setOpenMenuId(null); onOpenShare(folder); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Users className="h-4 w-4" /> Acesso
                            </button>
                          )}
                          {folder.isOwner !== false && onCustomize && (
                            <button
                              onClick={() => { setOpenMenuId(null); onCustomize(folder); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Pencil className="h-4 w-4" /> Editar pasta
                            </button>
                          )}
                          {canManage(folder) && (
                            <>
                              <button
                                onClick={() => { setOpenMenuId(null); onDelete('folder', folder.id, folder.name); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                              >
                                <Trash2 className="h-4 w-4" /> Excluir
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Arquivos
          </h2>
          <div className="drive-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {files.map((file) => {
              const sel = selectedKeys.has(`file-${file.id}`);
              return (
                <div key={file.id} className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={!trashMode && !!onMove && (canMoveOthers || isOwnerFile(file))}
                    data-drive-item
                    data-drive-key={`file-${file.id}`}
style={draggingKeys.has(`file-${file.id}`) ? { opacity: 0.45 } : undefined}
                    onDragStart={(e) => {
                      const items = dragItemsFor({ type: 'file', id: file.id });
                      startDriveItemDrag(e, items);
                      onDragStateChange(items.map((i) => `${i.type}-${i.id}`));
                    }}
                    onDragEnd={() => onDragStateChange(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(null);
                      onSelect(`file-${file.id}`, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
                    }}
                    onDoubleClick={() => {
                      setOpenMenuId(null);
                      if (!trashMode) onPreview(file);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setOpenMenuId(null);
                        if (!trashMode) onPreview(file);
                      } else if (e.key === ' ') {
                        e.preventDefault();
                        onSelect(`file-${file.id}`, { ctrl: true, shift: false });
                      }
                    }}
                    className={`group flex cursor-pointer select-none flex-col overflow-hidden rounded-xl outline-none drive-item-card border border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800/60 ${
                      sel ? '!border-red-300 !bg-red-50 dark:!border-red-800 dark:!bg-[#2b1518]' : ''
                    }`}
                  >
                    <div
                      className={`relative flex h-28 items-center justify-center border-b ${
                        sel
                          ? 'border-red-200 bg-red-100/50 dark:border-red-900/50 dark:bg-red-950/30'
                          : 'border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40'
                      }`}
                    >
                      <DriveFileThumb
                        file={file}
                        className="absolute inset-0"
                        iconFallback={
                          <DriveMimeIcon
                            mimeType={file.mimeType}
                            fileName={file.name}
                            className="h-12 w-12"
                          />
                        }
                      />
                      {file.starred && !trashMode && (
                        <Star className="absolute left-2 top-2 h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      )}
                      {!trashMode && (
                        <DriveHoverActions
                          file={file}
                          onPreview={() => onPreview(file)}
                          onDownload={() => onDownload(file)}
                          className="absolute right-1.5 top-1.5"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <DriveMimeIcon
                        mimeType={file.mimeType}
                        fileName={file.name}
                        className="drive-item-card__icon h-5 w-5"
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                        {file.name}
                      </p>
                      <button
                        data-drive-menu
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === file.id ? null : file.id);
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        aria-label={`Opções de ${file.name}`}
                        data-drive-menu-btn
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {openMenuId === file.id && (
                    <div data-drive-menu className="absolute bottom-10 right-0 z-20 min-w-[170px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {trashMode ? (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onRestore?.('file', file.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <RotateCcw className="h-4 w-4" /> Restaurar
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); onDelete('file', file.id, file.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir permanentemente
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onDownload(file); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Download className="h-4 w-4" /> Baixar
                          </button>
                          {isOwnerFile(file) && onToggleStar && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onToggleStar('file', file.id, !file.starred);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Star className={`h-4 w-4 ${file.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                              {file.starred ? 'Remover estrela' : 'Com estrela'}
                            </button>
                          )}
                          {onMove && (canMoveOthers || isOwnerFile(file)) && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onMove('file', file.id, file.name);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <FolderInput className="h-4 w-4" />
                              Mover
                            </button>
                          )}
                          <button
                            onClick={() => { setOpenMenuId(null); onRename('file', file.id, file.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-4 w-4" /> Renomear
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); onDelete('file', file.id, file.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
