import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BarChart3,
  Calculator,
  ClipboardList,
  Database,
  DraftingCompass,
  FolderClock,
  Home,
  Landmark,
  Scale,
  ScrollText,
  Settings,
  Users,
  Warehouse,
} from 'lucide-react';

/** Ícones dos módulos do rail (categoria), alinhados à Sidebar. */
export const MODULE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  Principal: Home,
  'Departamento Pessoal': Users,
  Administração: ClipboardList,
  Financeiro: Landmark,
  Contabilidade: Calculator,
  Métricas: BarChart3,
  Engenharia: DraftingCompass,
  'Contratos e Licitações': ScrollText,
  'Controle CREA': BadgeCheck,
  Controle: Settings,
  Jurídico: Scale,
  Suprimentos: Warehouse,
  Cadastros: Database,
  'Registros de Ponto': FolderClock,
};

export function resolveModuleCategoryIcon(category: string | null | undefined): LucideIcon | null {
  if (!category) return null;
  return MODULE_CATEGORY_ICONS[category] ?? null;
}
