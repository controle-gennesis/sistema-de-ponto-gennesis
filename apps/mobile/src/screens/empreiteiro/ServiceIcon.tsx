import React from 'react';
import { View } from 'react-native';
import {
  Building2,
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
} from 'lucide-react-native';

type IconCmp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Mesmos nomes do cadastro na web (o ícone/cor são escolhidos ao criar ou editar o serviço). */
const ICONS: Record<string, IconCmp> = {
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

const DEFAULT_COLOR = '#ce3736';

export function ServiceIcon({ name, color, size = 42 }: { name?: string | null; color?: string | null; size?: number }) {
  const Icon = (name && ICONS[name]) || FileText;
  const c = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        backgroundColor: `${c}24`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.48)} color={c} strokeWidth={2.1} />
    </View>
  );
}
