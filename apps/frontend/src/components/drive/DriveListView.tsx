'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDriveMenuDismiss } from './useDriveMenuDismiss';
import {
  Download,
  Folder,
  FolderInput,
  MoreVertical,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { folderDropProps, startDriveItemDrag, type DriveDragItem } from '@/components/drive/driveItemDrag';
import { DriveMimeIcon } from '@/components/drive/DriveMimeIcon';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { FolderIconTile } from '@/components/drive/folderAppearance';

type DriveFolder = {
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
  canWrite?: boolean;
};

type DriveFile = {
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
};

/** ícone | nome | proprietário | modificado | tamanho | menu */
const GRID_COLS = 'grid-cols-[auto,1fr,140px,150px,100px,56px]';

type Props = {
  folders: DriveFolder[];
  files: DriveFile[];
  onOpenFolder: (id: string) => void;
  onDownload: (f: DriveFile) => void | Promise<void>;
  onRename: (type: 'folder' | 'file', id: string, name: string) => void;
  onDelete: (type: 'folder' | 'file', id: string, name: string) => void;
  onOpenShare?: (folder: DriveFolder) => void;
  /** Abre a janela de ícone e cor da pasta. */
  onCustomize?: (folder: DriveFolder) => void;
  onToggleStar?: (type: 'folder' | 'file', id: string, starred: boolean) => void;
  onRestore?: (type: 'folder' | 'file', id: string) => void;
  onMove?: (type: 'folder' | 'file', id: string, name: string) => void;
  onDropInto?: (item: DriveDragItem, targetFolderId: string) => void;
  trashMode?: boolean;
  currentUserId?: string;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ownerLabel(
  ownerId: string,
  ownerName: string | null | undefined,
  currentUserId?: string,
): string {
  if (currentUserId && ownerId === currentUserId) return 'Eu';
  return ownerName?.trim() || '—';
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function OwnerCell({
  ownerId,
  ownerName,
  ownerPhotoUrl,
  currentUserId,
}: {
  ownerId: string;
  ownerName?: string | null;
  ownerPhotoUrl?: string | null;
  currentUserId?: string;
}) {
  const label = ownerLabel(ownerId, ownerName, currentUserId);
  const photo = resolveApiMediaUrl(ownerPhotoUrl ?? null);
  const initialSource =
    currentUserId && ownerId === currentUserId
      ? ownerName?.trim() || label
      : ownerName?.trim() || label;

  return (
    <div className="flex min-w-0 items-center justify-center gap-2">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initialsFromName(initialSource === '—' ? '?' : initialSource)
        )}
      </span>
      <span className="min-w-0 truncate text-xs text-gray-600 dark:text-gray-300">{label}</span>
    </div>
  );
}

function MenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

type AncoraMenu = { top: number; bottom: number; right: number };

const MENU_LARGURA = 188;
const MENU_ALTURA_ESTIMADA = 230;

/**
 * Painel do menu de três pontinhos. É desenhado direto no `body` (fora da tabela, que corta o que passa da borda)
 * e posicionado ao lado do botão: abre para baixo, ou para cima quando não há espaço embaixo.
 */
function MenuFlutuante({ ancora, children }: { ancora: AncoraMenu; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  const paraCima = ancora.bottom + MENU_ALTURA_ESTIMADA > window.innerHeight && ancora.top > MENU_ALTURA_ESTIMADA;
  const left = Math.max(8, Math.min(ancora.right - MENU_LARGURA, window.innerWidth - MENU_LARGURA - 8));
  return createPortal(
    <div
      data-drive-menu
      className="fixed z-[70] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={{
        left,
        minWidth: MENU_LARGURA,
        ...(paraCima ? { bottom: window.innerHeight - ancora.top + 4 } : { top: ancora.bottom + 4 }),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

const rowClass = `group relative grid ${GRID_COLS} items-center gap-4 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700/50 cursor-pointer`;

export function DriveListView({
  folders,
  files,
  onOpenFolder,
  onDownload,
  onRename,
  onDelete,
  onOpenShare,
  onCustomize,
  onToggleStar,
  onRestore,
  onMove,
  onDropInto,
  trashMode,
  currentUserId,
}: Props) {
  const canManage = (f: DriveFolder) =>
    f.canManageShares ?? (!!currentUserId && f.ownerId === currentUserId);
  const isOwnerFile = (f: DriveFile) => !!currentUserId && f.ownerId === currentUserId;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** Pasta destacada enquanto um item é arrastado sobre ela. */
  const [dropAlvo, setDropAlvo] = useState<string | null>(null);
  const [menuAncora, setMenuAncora] = useState<AncoraMenu | null>(null);
  const fecharMenu = useCallback(() => setOpenMenuId(null), []);
  useDriveMenuDismiss(openMenuId !== null, fecharMenu);
  // O painel é fixo na tela: se a página rolar ou a janela mudar de tamanho, fecha em vez de ficar solto.
  useEffect(() => {
    if (openMenuId === null) return;
    window.addEventListener('scroll', fecharMenu, true);
    window.addEventListener('resize', fecharMenu);
    return () => {
      window.removeEventListener('scroll', fecharMenu, true);
      window.removeEventListener('resize', fecharMenu);
    };
  }, [openMenuId, fecharMenu]);
  const alternarMenu = (menuKey: string, aberto: boolean, botao: HTMLElement) => {
    if (aberto) {
      setOpenMenuId(null);
      return;
    }
    const r = botao.getBoundingClientRect();
    setMenuAncora({ top: r.top, bottom: r.bottom, right: r.right });
    setOpenMenuId(menuKey);
  };

  return (
    <div onClick={() => setOpenMenuId(null)}>
      <Card padding="none" className="!shadow-none">
        <div className="table-scroll">
          <div className="min-w-[40rem]">
        <div
          className={`grid ${GRID_COLS} gap-4 border-b border-gray-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400`}
        >
          <div className="relative w-8">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              Nome
            </span>
          </div>
          <div />
          <div className="text-center">Proprietário</div>
          <div className="text-center">Modificado</div>
          <div className="text-right">Tamanho</div>
          <div className="text-center">Ação</div>
        </div>

        {folders.map((folder) => {
          const menuKey = `folder-${folder.id}`;
          const menuOpen = openMenuId === menuKey;

          return (
            <div
              key={folder.id}
              role="button"
              tabIndex={0}
              draggable={!trashMode && !!onMove && folder.ownerId === currentUserId}
              onDragStart={(e) => startDriveItemDrag(e, { type: 'folder', id: folder.id })}
              {...(!trashMode ? folderDropProps(folder.id, onDropInto, setDropAlvo) : {})}
              onClick={() => {
                setOpenMenuId(null);
                if (!trashMode) onOpenFolder(folder.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenMenuId(null);
                  if (!trashMode) onOpenFolder(folder.id);
                }
              }}
              className={`${rowClass} ${dropAlvo === folder.id ? 'bg-red-50 ring-2 ring-inset ring-red-400 dark:bg-red-950/30' : ''}`}
            >
              <FolderIconTile iconKey={folder.iconKey} color={folder.iconColor} />
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {folder.name}
                </span>
                {folder.starred && !trashMode && (
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                )}
              </div>
              <OwnerCell
                ownerId={folder.ownerId}
                ownerName={folder.ownerName}
                ownerPhotoUrl={folder.ownerPhotoUrl}
                currentUserId={currentUserId}
              />
              <span className="text-center text-xs text-gray-400 dark:text-gray-500">
                {formatDate(folder.updatedAt)}
              </span>
              <span className="text-right text-xs text-gray-400 dark:text-gray-500">—</span>
              <button
                type="button"
                data-drive-menu
                onClick={(e) => {
                  e.stopPropagation();
                  alternarMenu(menuKey, menuOpen, e.currentTarget);
                }}
                className={`mx-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200 ${
                  menuOpen ? 'bg-gray-200 text-gray-700 dark:bg-gray-600' : ''
                }`}
                aria-label={`Opções de ${folder.name}`}
                data-drive-menu-btn
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen && menuAncora && (
                <MenuFlutuante ancora={menuAncora}>
                  {trashMode ? (
                    <>
                      <MenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          onRestore?.('folder', folder.id);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> Restaurar
                      </MenuItem>
                      <MenuItem
                        danger
                        onClick={() => {
                          setOpenMenuId(null);
                          onDelete('folder', folder.id, folder.name);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir permanentemente
                      </MenuItem>
                    </>
                  ) : (
                    <>
                      <MenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          onOpenFolder(folder.id);
                        }}
                      >
                        <Folder className="h-4 w-4" /> Abrir
                      </MenuItem>
                      {canManage(folder) && onToggleStar && (
                        <MenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            onToggleStar('folder', folder.id, !folder.starred);
                          }}
                        >
                          <Star
                            className={`h-4 w-4 ${folder.starred ? 'fill-amber-400 text-amber-500' : ''}`}
                          />
                          {folder.starred ? 'Remover estrela' : 'Com estrela'}
                        </MenuItem>
                      )}
                      {onMove && folder.ownerId === currentUserId && (
                        <MenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            onMove('folder', folder.id, folder.name);
                          }}
                        >
                          <FolderInput className="h-4 w-4" /> Mover
                        </MenuItem>
                      )}
                      {canManage(folder) && onOpenShare && (
                        <MenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            onOpenShare(folder);
                          }}
                        >
                          <Users className="h-4 w-4" /> Acesso
                        </MenuItem>
                      )}
                      {folder.isOwner !== false && onCustomize && (
                        <MenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            onCustomize(folder);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Editar pasta
                        </MenuItem>
                      )}
                      {canManage(folder) && (
                        <>
                          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                          <MenuItem
                            danger
                            onClick={() => {
                              setOpenMenuId(null);
                              onDelete('folder', folder.id, folder.name);
                            }}
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </MenuItem>
                        </>
                      )}
                    </>
                  )}
                </MenuFlutuante>
              )}
            </div>
          );
        })}

        {files.map((file) => {
          const menuKey = `file-${file.id}`;
          const menuOpen = openMenuId === menuKey;

          return (
            <div
              key={file.id}
              role="button"
              tabIndex={0}
              draggable={!trashMode && !!onMove && isOwnerFile(file)}
              onDragStart={(e) => startDriveItemDrag(e, { type: 'file', id: file.id })}
              onClick={() => {
                setOpenMenuId(null);
                if (!trashMode) onDownload(file);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenMenuId(null);
                  if (!trashMode) onDownload(file);
                }
              }}
              className={rowClass}
            >
              <DriveMimeIcon mimeType={file.mimeType} fileName={file.name} className="h-8 w-8" />
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {file.name}
                </span>
                {file.starred && !trashMode && (
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                )}
              </div>
              <OwnerCell
                ownerId={file.ownerId}
                ownerName={file.ownerName}
                ownerPhotoUrl={file.ownerPhotoUrl}
                currentUserId={currentUserId}
              />
              <span className="text-center text-xs text-gray-400 dark:text-gray-500">
                {formatDate(file.updatedAt)}
              </span>
              <span className="text-right text-xs tabular-nums text-gray-400 dark:text-gray-500">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                data-drive-menu
                onClick={(e) => {
                  e.stopPropagation();
                  alternarMenu(menuKey, menuOpen, e.currentTarget);
                }}
                className={`mx-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200 ${
                  menuOpen ? 'bg-gray-200 text-gray-700 dark:bg-gray-600' : ''
                }`}
                aria-label={`Opções de ${file.name}`}
                data-drive-menu-btn
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen && menuAncora && (
                <MenuFlutuante ancora={menuAncora}>
                  {trashMode ? (
                    <>
                      <MenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          onRestore?.('file', file.id);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> Restaurar
                      </MenuItem>
                      <MenuItem
                        danger
                        onClick={() => {
                          setOpenMenuId(null);
                          onDelete('file', file.id, file.name);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir permanentemente
                      </MenuItem>
                    </>
                  ) : (
                    <>
                      <MenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          onDownload(file);
                        }}
                      >
                        <Download className="h-4 w-4" /> Baixar
                      </MenuItem>
                      {isOwnerFile(file) && onToggleStar && (
                        <MenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            onToggleStar('file', file.id, !file.starred);
                          }}
                        >
                          <Star
                            className={`h-4 w-4 ${file.starred ? 'fill-amber-400 text-amber-500' : ''}`}
                          />
                          {file.starred ? 'Remover estrela' : 'Com estrela'}
                        </MenuItem>
                      )}
                      {onMove && isOwnerFile(file) && (
                        <MenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            onMove('file', file.id, file.name);
                          }}
                        >
                          <FolderInput className="h-4 w-4" /> Mover
                        </MenuItem>
                      )}
                      <MenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          onRename('file', file.id, file.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" /> Renomear
                      </MenuItem>
                      <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                      <MenuItem
                        danger
                        onClick={() => {
                          setOpenMenuId(null);
                          onDelete('file', file.id, file.name);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </MenuItem>
                    </>
                  )}
                </MenuFlutuante>
              )}
            </div>
          );
        })}
          </div>
        </div>
      </Card>
    </div>
  );
}
