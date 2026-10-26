import type { KanbanCardActivity, KanbanLabelPreset } from '../services/kanban';

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

function day(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const [y, m, d] = raw.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/** Texto (sem o nome de quem fez) de cada tipo de atividade registrada no card. */
export function describeCardActivity(
  a: KanbanCardActivity,
  labelPresets?: KanbanLabelPreset[],
): string {
  const d = a.data ?? {};
  const str = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : '');
  const isSelf = !!a.user && str('userId') === a.user.id;

  switch (a.type) {
    case 'MOVED':
      return `moveu este cartão de ${str('fromColumn') || '—'} para ${str('toColumn') || '—'}`;
    case 'COMPLETED':
      return 'marcou este cartão como concluído';
    case 'REOPENED':
      return 'reabriu este cartão';
    case 'ARCHIVED':
      return 'arquivou este cartão';
    case 'RESTORED':
      return 'restaurou este cartão';
    case 'TITLE_CHANGED':
      return `alterou o título de “${str('from')}” para “${str('to')}”`;
    case 'DESCRIPTION_CHANGED':
      return 'alterou a descrição deste cartão';
    case 'PRIORITY_CHANGED':
      return `alterou a prioridade de ${PRIORITY_LABEL[str('from')] ?? str('from')} para ${
        PRIORITY_LABEL[str('to')] ?? str('to')
      }`;
    case 'DATES_CHANGED': {
      const parts: string[] = [];
      if ('startTo' in d) {
        const v = day(d.startTo);
        parts.push(v ? `definiu a data de início para ${v}` : 'removeu a data de início');
      }
      if ('dueTo' in d) {
        const v = day(d.dueTo);
        parts.push(v ? `definiu o prazo para ${v}` : 'removeu o prazo');
      }
      return parts.join(' e ') || 'alterou as datas do cartão';
    }
    case 'LABELS_CHANGED': {
      // Registros antigos guardaram a cor (#RRGGBB) no lugar do nome.
      const labelName = (n: string) => {
        if (!/^#[0-9a-f]{6}$/i.test(n.trim())) return n;
        const preset = (labelPresets ?? []).find(
          (p) => p.color.toLowerCase() === n.trim().toLowerCase(),
        );
        return preset?.name ?? 'Etiqueta sem nome';
      };
      const added = (Array.isArray(d.added) ? (d.added as string[]) : []).map(labelName);
      const removed = (Array.isArray(d.removed) ? (d.removed as string[]) : []).map(labelName);
      const parts: string[] = [];
      if (added.length) {
        parts.push(
          `adicionou ${added.length > 1 ? 'as etiquetas' : 'a etiqueta'} ${added.map((n) => `“${n}”`).join(', ')}`,
        );
      }
      if (removed.length) {
        parts.push(
          `removeu ${removed.length > 1 ? 'as etiquetas' : 'a etiqueta'} ${removed.map((n) => `“${n}”`).join(', ')}`,
        );
      }
      return parts.join(' e ') || 'alterou as etiquetas';
    }
    case 'MEMBER_ADDED':
      return isSelf ? 'entrou neste cartão' : `adicionou ${str('name') || 'alguém'} a este cartão`;
    case 'MEMBER_REMOVED':
      return isSelf ? 'saiu deste cartão' : `removeu ${str('name') || 'alguém'} deste cartão`;
    case 'CHECKLIST_ADDED':
      return `adicionou a tarefa “${str('title')}”`;
    case 'CHECKLIST_DONE':
      return d.isDone
        ? `concluiu a tarefa “${str('title')}”`
        : `reabriu a tarefa “${str('title')}”`;
    case 'CHECKLIST_REMOVED':
      return `removeu a tarefa “${str('title')}”`;
    case 'ATTACHMENT_REMOVED':
      return d.isLink
        ? `removeu o link “${str('fileName')}”`
        : `excluiu o anexo “${str('fileName')}”`;
    case 'MATERIALS_CHANGED': {
      const names = Array.isArray(d.names) ? (d.names as string[]) : [];
      return `adicionou ${names.length > 1 ? 'os materiais' : 'o material'} ${names.join(', ')}`;
    }
    case 'MATERIAL_REMOVED':
      return `removeu o material “${str('name')}”`;
    default:
      return 'fez uma alteração neste cartão';
  }
}
