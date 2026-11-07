'use client';

import React from 'react';
import {
  Building2,
  Check,
  Droplets,
  FileText,
  Hammer,
  HardHat,
  Home,
  Layers,
  PaintRoller,
  Ruler,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Ícones disponíveis para identificar um serviço (mesmos nomes no app mobile). */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  FileText,
  Hammer,
  Wrench,
  PaintRoller,
  Zap,
  Droplets,
  Building2,
  HardHat,
  Ruler,
  Truck,
  Layers,
  Home,
};

export const SERVICE_COLORS = [
  '#ce3736',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#475569',
];

export const DEFAULT_SERVICE_ICON = 'FileText';
export const DEFAULT_SERVICE_COLOR = '#ce3736';

/** Ícone do serviço em quadrado suave (cor escolhida com fundo translúcido). */
export function ServiceIcon({
  name,
  color,
  size = 'md',
}: {
  name?: string | null;
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const Icon = (name && SERVICE_ICONS[name]) || SERVICE_ICONS[DEFAULT_SERVICE_ICON];
  const c = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_SERVICE_COLOR;
  // lg = destaque no título da página do serviço.
  const box =
    size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-xl sm:h-16 sm:w-16' : 'h-10 w-10 rounded-xl';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${box}`}
      style={{ backgroundColor: `${c}1f`, color: c }}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-5 w-5'} />
    </span>
  );
}

/** Escolha de ícone e cor no formulário do serviço. */
export function ServiceIconPicker({
  iconName,
  iconColor,
  onChange,
  labelClass,
}: {
  iconName: string;
  iconColor: string;
  onChange: (next: { iconName: string; iconColor: string }) => void;
  labelClass: string;
}) {
  return (
    <div>
      <label className={labelClass}>Ícone e cor</label>
      <div className="flex flex-wrap items-center gap-4">
        <ServiceIcon name={iconName} color={iconColor} />
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(SERVICE_ICONS).map(([key, Icon]) => {
            const ativo = key === iconName;
            return (
              <button
                key={key}
                type="button"
                title={key}
                onClick={() => onChange({ iconName: key, iconColor })}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  ativo
                    ? 'border-transparent'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
                style={ativo ? { backgroundColor: `${iconColor}1f`, color: iconColor, borderColor: iconColor } : undefined}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SERVICE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            onClick={() => onChange({ iconName, iconColor: c })}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow ring-1 ring-gray-200 dark:border-gray-900 dark:ring-gray-700"
            style={{ backgroundColor: c }}
          >
            {c === iconColor ? <Check className="h-3.5 w-3.5 text-white" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
