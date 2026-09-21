import { ocDeliveryStatusBadgeClass, type OcDeliveryStatusBadgeKey } from '@/components/oc/ocStatusLabels';

export interface StockMovementForOcTag {
  id: string;
  type: 'IN' | 'OUT';
  notes?: string | null;
  createdAt: string;
}

export type OcMovementTag = {
  label: string;
  badgeKey: OcDeliveryStatusBadgeKey;
  title?: string;
};

function movementNotesText(notes: unknown): string | null {
  if (notes == null) return null;
  if (typeof notes === 'string') return notes;
  return String(notes);
}

export function parseOcMovementInfoFromNotes(
  notes?: string | null
): { ocNumber: string; split: 'TOTAL' | 'PARCIAL' | '' } | null {
  const text = movementNotesText(notes);
  if (!text) return null;
  const ocMatch = text.match(/Nº OC:\s*([^\n|]+)/i);
  if (!ocMatch?.[1]) return null;

  const rawSplit = text.match(/Tipo:\s*(TOTAL|PARCIAL)/i)?.[1]?.toUpperCase() ?? '';
  const split = rawSplit === 'TOTAL' || rawSplit === 'PARCIAL' ? rawSplit : '';

  return {
    ocNumber: ocMatch[1].trim(),
    split
  };
}

export function normalizeOcNumberKey(orderNumber: string): string {
  return orderNumber.trim().toLowerCase();
}

/** Prefer TOTAL sobre PARCIAL (mesmo tipo IN/OUT); desempate pela data mais recente. */
export function pickRepresentativeOcMovement(
  movs: StockMovementForOcTag[]
): StockMovementForOcTag | null {
  if (!movs.length) return null;

  const sorted = [...movs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latest = sorted[0];

  const pickBestForType = (type: 'IN' | 'OUT') => {
    const typed = sorted.filter((m) => m.type === type);
    if (!typed.length) return null;
    const totalMov = typed.find((m) => parseOcMovementInfoFromNotes(m.notes)?.split === 'TOTAL');
    return totalMov ?? typed[0];
  };

  return pickBestForType(latest.type) ?? latest;
}

export function buildOcListDeliveryStatusFromMovement(mov: StockMovementForOcTag): OcMovementTag {
  const split = parseOcMovementInfoFromNotes(mov.notes)?.split || 'TOTAL';
  const isPartial = split === 'PARCIAL';

  if (mov.type === 'IN') {
    return {
      label: isPartial ? 'Recebido parcial' : 'Recebido',
      title: isPartial ? 'Recebida parcialmente no estoque' : 'Recebida totalmente no estoque',
      badgeKey: isPartial ? 'received_partial' : 'received'
    };
  }

  return {
    label: isPartial ? 'Obra parcial' : 'Na obra',
    title: isPartial ? 'Enviado parcialmente para a obra' : 'Enviado totalmente para a obra',
    badgeKey: isPartial ? 'site_partial' : 'site'
  };
}

/** Agrupa os movimentos por Nº OC e escolhe o mais representativo de cada um. */
export function buildLatestOcMovementByOrderNumber(
  movements: StockMovementForOcTag[]
): Map<string, StockMovementForOcTag> {
  const grouped = new Map<string, StockMovementForOcTag[]>();

  movements.forEach((mov) => {
    const parsed = parseOcMovementInfoFromNotes(mov.notes);
    if (!parsed?.ocNumber) return;

    const key = normalizeOcNumberKey(parsed.ocNumber);
    const list = grouped.get(key) || [];
    list.push(mov);
    grouped.set(key, list);
  });

  const latestByOc = new Map<string, StockMovementForOcTag>();
  grouped.forEach((movs, key) => {
    const picked = pickRepresentativeOcMovement(movs);
    if (picked) latestByOc.set(key, picked);
  });

  return latestByOc;
}

export function OcListDeliveryStatusCellContent({
  movement,
  orderStatus
}: {
  movement: StockMovementForOcTag | null | undefined;
  orderStatus?: string;
}) {
  if (orderStatus === 'REJECTED' || orderStatus === 'CANCELLED') {
    return <span className={ocDeliveryStatusBadgeClass('cancelled')}>Cancelado</span>;
  }

  if (!movement) {
    return <span className={ocDeliveryStatusBadgeClass('pending')}>Pendente</span>;
  }

  const tag = buildOcListDeliveryStatusFromMovement(movement);
  return (
    <span className={ocDeliveryStatusBadgeClass(tag.badgeKey)} title={tag.title}>
      {tag.label}
    </span>
  );
}
