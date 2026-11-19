import type React from 'react';
import {
  BarChart3,
  Briefcase,
  CheckCircle2,
  Coffee,
  MapPin,
  Phone,
  Plane,
  Star,
  Users,
  Wrench,
} from 'lucide-react-native';

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Ícones que um evento da agenda pode ter (mesmo conjunto do sistema web). */
export const PLANNER_ICON_OPTIONS: Array<{ id: string; label: string; Icon: IconComponent }> = [
  { id: 'meeting', label: 'Reunião', Icon: Users },
  { id: 'phone', label: 'Ligação', Icon: Phone },
  { id: 'chart', label: 'Vendas', Icon: BarChart3 },
  { id: 'star', label: 'Destaque', Icon: Star },
  { id: 'check', label: 'Tarefa', Icon: CheckCircle2 },
  { id: 'plane', label: 'Viagem', Icon: Plane },
  { id: 'coffee', label: 'Café', Icon: Coffee },
  { id: 'users', label: 'Equipe', Icon: Users },
  { id: 'map-pin', label: 'Local', Icon: MapPin },
  { id: 'briefcase', label: 'Trabalho', Icon: Briefcase },
  { id: 'wrench', label: 'Manutenção', Icon: Wrench },
];

export const PLANNER_ICON_MAP: Record<string, IconComponent> = Object.fromEntries(
  PLANNER_ICON_OPTIONS.map((o) => [o.id, o.Icon]),
);
