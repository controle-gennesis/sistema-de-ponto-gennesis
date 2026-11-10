'use client';

import React from 'react';
import {
  Archive,
  Briefcase,
  BookOpen,
  Building2,
  Calculator,
  Camera,
  ClipboardList,
  FileText,
  Folder,
  FolderOpen,
  Hammer,
  HardHat,
  Heart,
  House,
  Image as ImageIcon,
  Landmark,
  MapPin,
  Package,
  Shield,
  Star,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ícones que o dono pode escolher para a pasta. As chaves são gravadas no banco e validadas no servidor
 * (DriveService.DRIVE_FOLDER_ICON_KEYS): ao incluir um ícone aqui, inclua a chave lá também.
 */
export const FOLDER_ICONS: Array<{ key: string; label: string; Icon: LucideIcon }> = [
  { key: 'folder', label: 'Pasta', Icon: Folder },
  { key: 'folder-open', label: 'Pasta aberta', Icon: FolderOpen },
  { key: 'briefcase', label: 'Maleta', Icon: Briefcase },
  { key: 'building', label: 'Prédio', Icon: Building2 },
  { key: 'hammer', label: 'Martelo', Icon: Hammer },
  { key: 'wrench', label: 'Chave', Icon: Wrench },
  { key: 'hard-hat', label: 'Capacete', Icon: HardHat },
  { key: 'file-text', label: 'Documento', Icon: FileText },
  { key: 'clipboard-list', label: 'Lista', Icon: ClipboardList },
  { key: 'calculator', label: 'Calculadora', Icon: Calculator },
  { key: 'users', label: 'Pessoas', Icon: Users },
  { key: 'shield', label: 'Escudo', Icon: Shield },
  { key: 'star', label: 'Estrela', Icon: Star },
  { key: 'heart', label: 'Coração', Icon: Heart },
  { key: 'home', label: 'Casa', Icon: House },
  { key: 'camera', label: 'Câmera', Icon: Camera },
  { key: 'image', label: 'Imagem', Icon: ImageIcon },
  { key: 'book', label: 'Livro', Icon: BookOpen },
  { key: 'truck', label: 'Caminhão', Icon: Truck },
  { key: 'package', label: 'Pacote', Icon: Package },
  { key: 'map-pin', label: 'Local', Icon: MapPin },
  { key: 'landmark', label: 'Instituição', Icon: Landmark },
  { key: 'wallet', label: 'Carteira', Icon: Wallet },
  { key: 'archive', label: 'Arquivo morto', Icon: Archive },
];

export const FOLDER_COLORS: Array<{ hex: string; label: string }> = [
  { hex: '#ef4444', label: 'Vermelho' },
  { hex: '#f97316', label: 'Laranja' },
  { hex: '#eab308', label: 'Amarelo' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#14b8a6', label: 'Turquesa' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#6366f1', label: 'Índigo' },
  { hex: '#a855f7', label: 'Roxo' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#6b7280', label: 'Cinza' },
];

const ICON_BY_KEY = new Map(FOLDER_ICONS.map((i) => [i.key, i.Icon]));

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Quadradinho com o ícone da pasta. Sem personalização, mantém o visual de sempre (vermelho claro);
 * com cor, o fundo é a própria cor bem clara e o ícone leva a cor cheia.
 */
export function FolderIconTile({
  iconKey,
  color,
  shared,
  className = 'h-8 w-8 rounded-lg',
  iconClassName = 'h-4 w-4',
}: {
  iconKey?: string | null;
  color?: string | null;
  /** Pasta de outra pessoa (sem ícone escolhido): mostra o ícone de pessoas, como antes. */
  shared?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const custom = isHexColor(color) ? color : null;
  const Icon = (iconKey ? ICON_BY_KEY.get(iconKey) : undefined) ?? (shared ? Users : Folder);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        custom ? '' : 'bg-red-50 dark:bg-red-950/40'
      } ${className}`}
      style={custom ? { backgroundColor: `${custom}24` } : undefined}
    >
      <Icon
        className={`${iconClassName} ${custom ? '' : 'text-red-500 dark:text-red-400'}`}
        style={custom ? { color: custom } : undefined}
        strokeWidth={1.75}
      />
    </span>
  );
}
