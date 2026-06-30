import { formatFluigCellValue, normalizeFluigColumnKey } from '@/lib/fluigCellValue';

export const FLUIG_WORKFLOW_APPROVAL_DATASET_G3 = 'Processos_Workflow_Aprovacao_G3';
export const FLUIG_WORKFLOW_APPROVAL_DATASET_G5 = 'Processos_Workflow_Aprovacao_G5';

export const FLUIG_PORTAL_BASE_URL =
  (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_FLUIG_BASE_URL : undefined)?.replace(
    /\/$/,
    ''
  ) || 'https://gennesisengenharia160516.fluig.cloudtotvs.com.br';

export function buildFluigWorkflowProcessViewUrl(processInstanceId: string): string {
  const id = processInstanceId.trim();
  return `${FLUIG_PORTAL_BASE_URL}/portal/p/1/pageworkflowview?app_ecm_workflowview_detailsProcessInstanceID=${encodeURIComponent(id)}`;
}

export const FLUIG_WORKFLOW_APPROVAL_DATASETS = [
  FLUIG_WORKFLOW_APPROVAL_DATASET_G3,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G5,
] as const;

export type WorkflowSector = 'compras' | 'tecnico' | 'diretoria';

export type WorkflowStepStatus = 'approved' | 'pending' | 'waiting' | 'rejected' | 'unknown';

export type WorkflowApprovalStep = {
  sector: WorkflowSector;
  label: string;
  status: WorkflowStepStatus;
  approver: string | null;
  approvedAt: string | null;
  pendingWith: string | null;
  detail: string | null;
};

export type ParsedWorkflowRow = {
  rowKey: string;
  processId: string;
  title: string;
  filial: string | null;
  currentStage: string | null;
  currentPendingWith: string | null;
  currentPendingSector: WorkflowSector | null;
  fullyApproved: boolean;
  steps: WorkflowApprovalStep[];
  raw: Record<string, unknown>;
  datasetId?: string;
  /** G5: nome do setor do gestor (ex.: Projetos). */
  gestorSetorName?: string | null;
  /** G5: papel/grupo pendente (ex.: dpo gestor de projetos). */
  gestorPendingLabel?: string | null;
};

const SECTOR_ORDER: WorkflowSector[] = ['compras', 'tecnico', 'diretoria'];

export const WORKFLOW_SECTORS_BY_DATASET: Record<string, readonly WorkflowSector[]> = {
  [FLUIG_WORKFLOW_APPROVAL_DATASET_G3]: ['compras', 'tecnico', 'diretoria'],
  [FLUIG_WORKFLOW_APPROVAL_DATASET_G5]: ['tecnico', 'diretoria'],
};

export function getWorkflowSectorsForDataset(datasetId: string): WorkflowSector[] {
  return [...(WORKFLOW_SECTORS_BY_DATASET[datasetId] ?? SECTOR_ORDER)];
}

export const SECTOR_TABLE_HEADERS: Record<WorkflowSector, string> = {
  compras: 'Compras',
  tecnico: 'Gestor',
  diretoria: 'Diretoria',
};

const SECTOR_LABELS: Record<WorkflowSector, string> = {
  compras: 'Compras',
  tecnico: 'Gestor',
  diretoria: 'Diretoria',
};

export function formatPendingWithSectorLabel(
  sector: WorkflowSector | null,
  rawLabel: string | null | undefined,
  datasetId?: string
): string {
  if (isG5WorkflowDataset(datasetId) && sector === 'tecnico') {
    return formatG5GestorPendingHeader(null, rawLabel);
  }
  if (sector === 'tecnico') return 'Gestor de Engenharia';
  if (rawLabel && isTecnicoSectorLabel(rawLabel)) return 'Gestor de Engenharia';
  return rawLabel?.trim() || '—';
}

function isGenericGestorPlaceholder(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return /^(verificar setor|gestor|—|-)$/i.test(value.trim());
}

function isG5CompletedPendingText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const normalized = normalizeFluigColumnKey(text);
  return /finalizada|aprovado por todos|encerrada|concluida/.test(normalized);
}

export function formatG5GestorPendingHeader(
  setorName: string | null | undefined,
  rawLabel?: string | null
): string {
  if (setorName?.trim()) return `Gestor ${setorName.trim()}`;
  const label = rawLabel?.trim();
  if (!label || isGenericGestorPlaceholder(label)) return 'Gestor';
  if (/^gestor\b/i.test(label)) return label;
  return `Gestor ${label}`;
}

function extractSectorAndPerson(raw: string | null | undefined): {
  sector: string | null;
  person: string | null;
} {
  if (!raw?.trim()) return { sector: null, person: null };
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return {
      sector: match[1]?.trim() || null,
      person: match[2]?.trim() || null,
    };
  }
  return { sector: trimmed, person: null };
}

function readCellFromMatchingColumns(
  row: Record<string, unknown>,
  columns: string[],
  matches: (col: string, norm: string) => boolean
): string {
  for (const col of columns) {
    if (!matches(col, normalizeFluigColumnKey(col))) continue;
    const val = readCell(row, col);
    if (val?.trim()) return val.trim();
  }
  return '';
}

function readG5GestorSetorName(row: Record<string, unknown>, columns: string[]): string | null {
  const val = readCellFromMatchingColumns(row, columns, (_col, norm) => {
    const compact = norm.replace(/\s/g, '');
    if (/solicitante|compras|diretoria|tecnico/.test(compact)) return false;
    return (
      compact === 'setor' ||
      compact === 'nomesetor' ||
      compact === 'setornome' ||
      compact === 'setorgestor' ||
      compact === 'gestorsetor' ||
      compact === 'areasetor' ||
      compact === 'setorarea' ||
      compact === 'descricaosetor'
    );
  });
  if (val && !isGenericGestorPlaceholder(val) && !/^gestor\b/i.test(val)) return val;
  return null;
}

function readG5GestorPendingLabel(row: Record<string, unknown>, columns: string[]): string | null {
  const val = readCellFromMatchingColumns(row, columns, (_col, norm) => {
    const compact = norm.replace(/\s/g, '');
    return (
      compact === 'pendentegestor' ||
      compact === 'gestorpendente' ||
      compact === 'grupogestor' ||
      compact === 'poolgestor' ||
      compact === 'nomegrupo' ||
      compact === 'grupo' ||
      compact === 'pool' ||
      compact === 'grupoaprovacao' ||
      compact === 'papelgestor' ||
      compact === 'funcaogestor' ||
      compact === 'atividadegestor' ||
      /^dpo/.test(compact) ||
      /dpo/.test(norm) ||
      (/gestor/.test(norm) && /(grupo|pool|papel|funcao|perfil|atividade)/.test(norm))
    );
  });
  if (val && !isGenericGestorPlaceholder(val)) return val;
  return null;
}

export function resolvePendingWithDisplay(row: ParsedWorkflowRow): {
  status: string;
  person: string | null;
  statusClassName: string;
} {
  const green = 'text-green-600 dark:text-green-400';
  const amber = 'text-amber-600 dark:text-amber-400';

  if (
    row.fullyApproved ||
    isG5CompletedPendingText(row.currentStage) ||
    isG5CompletedPendingText(row.currentPendingWith)
  ) {
    return { status: 'Concluído', person: null, statusClassName: green };
  }

  const pendingStep = row.currentPendingSector
    ? row.steps.find((s) => s.sector === row.currentPendingSector)
    : null;
  const sectorFallback = pendingStep?.label ?? null;
  const personFallback = pendingStep?.pendingWith
    ? extractPersonFromCellValue(pendingStep.pendingWith)
    : null;

  if (isG5WorkflowDataset(row.datasetId) && row.currentPendingSector === 'tecnico') {
    const { sector, person } = extractSectorAndPerson(row.currentPendingWith);
    const statusLine = formatG5GestorPendingHeader(
      row.gestorSetorName ?? readG5GestorSetorName(row.raw, Object.keys(row.raw)),
      sector ?? sectorFallback
    );
    const personLine =
      row.gestorPendingLabel ??
      (person && !isGenericGestorPlaceholder(person) ? person : null) ??
      personFallback ??
      null;

    return { status: statusLine, person: personLine, statusClassName: amber };
  }

  if (row.currentPendingWith) {
    const { sector, person } = extractSectorAndPerson(row.currentPendingWith);

    if (person) {
      return {
        status: formatPendingWithSectorLabel(row.currentPendingSector, sector ?? sectorFallback, row.datasetId),
        person,
        statusClassName: amber,
      };
    }

    return {
      status: formatPendingWithSectorLabel(row.currentPendingSector, sectorFallback ?? sector, row.datasetId),
      person: isGenericGestorPlaceholder(row.currentPendingWith) ? null : row.currentPendingWith.trim(),
      statusClassName: amber,
    };
  }

  if (sectorFallback) {
    return {
      status: formatPendingWithSectorLabel(row.currentPendingSector, sectorFallback, row.datasetId),
      person: personFallback,
      statusClassName: amber,
    };
  }

  return { status: '—', person: null, statusClassName: 'text-gray-700 dark:text-gray-300' };
}

function isTecnicoSectorLabel(label: string): boolean {
  const normalized = normalizeFluigColumnKey(label);
  return /tecnico|setor tec|aprovacao setor tec|gestor de engenharia|validacao tec/.test(normalized);
}

const SECTOR_KEYWORDS: Record<WorkflowSector, RegExp[]> = {
  compras: [/compras/, /gestor de compras/, /gestor compras/, /suprimentos/],
  tecnico: [
    /tecnico/,
    /setor tecnico/,
    /setor tecn/,
    /area tecnica/,
    /aprovacao setor tec/,
    /aprovacao tec/,
    /validacao tec/,
    /aprov setor tec/,
    /engenharia/,
  ],
  diretoria: [/diretoria/, /diretor/],
};

type SectorColumnMap = Partial<
  Record<WorkflowSector, { status?: string; approver?: string; date?: string; pending?: string }>
>;

export type WorkflowColumnMapping = {
  idCol: string | null;
  titleCol: string | null;
  filialCol: string | null;
  stageCol: string | null;
  globalPendingCol: string | null;
  sectorCols: SectorColumnMap;
};

type ExplicitSectorColumn = {
  sector: WorkflowSector;
  role: 'approver' | 'pending' | 'status';
};

function getExplicitSectorColumn(col: string): ExplicitSectorColumn | null {
  const norm = normalizeFluigColumnKey(col);
  const compact = norm.replace(/\s/g, '');

  if (compact === 'aprovadogestor') return { sector: 'tecnico', role: 'approver' };
  if (compact === 'aprovadocompras') return { sector: 'compras', role: 'approver' };
  if (compact === 'aprovadodiretoria') return { sector: 'diretoria', role: 'approver' };

  if (compact === 'pendentegestor') return { sector: 'tecnico', role: 'pending' };
  if (compact === 'pendentecompras') return { sector: 'compras', role: 'pending' };
  if (compact === 'pendentediretoria') return { sector: 'diretoria', role: 'pending' };

  return null;
}

function columnMatchesSector(norm: string, sector: WorkflowSector): boolean {
  return SECTOR_KEYWORDS[sector].some((re) => re.test(norm));
}

function columnBelongsToSector(col: string, sector: WorkflowSector): boolean {
  const explicit = getExplicitSectorColumn(col);
  if (explicit?.sector === sector) return true;
  return columnMatchesSector(normalizeFluigColumnKey(col), sector);
}

function classifySectorColumnRole(norm: string, col?: string): 'status' | 'approver' | 'date' | 'pending' | null {
  if (col) {
    const explicit = getExplicitSectorColumn(col);
    if (explicit && explicit.role !== 'status') return explicit.role;
  }
  if (/pendente|aguard|pool|atual|com quem|fila|destinat|responsavel atual|usuario atual/.test(norm)) {
    return 'pending';
  }
  if (/data|dt_|_dt\b| quando | em \d|aprovado em|data aprov/.test(norm)) return 'date';
  if (
    /aprovador|aprovou|usuario|responsavel|gestor|nome|por quem|login|colaborador|analista|matricula|assignee|colleague|wkuser|wk user/.test(
      norm
    )
  ) {
    return 'approver';
  }
  if (/status|situacao|estado|resultado|decisao|parecer/.test(norm)) return 'status';
  if (/aprovad|aprovacao/.test(norm)) return 'status';
  return null;
}

function getSectorColumns(columns: string[], sector: WorkflowSector): string[] {
  return columns.filter((col) => columnBelongsToSector(col, sector));
}

function readFirstNonEmpty(row: Record<string, unknown>, cols: string[]): string {
  for (const col of cols) {
    const val = readCell(row, col);
    if (val) return val;
  }
  return '';
}

export function buildWorkflowColumnMapping(columns: string[]): WorkflowColumnMapping {
  const mapping: WorkflowColumnMapping = {
    idCol: null,
    titleCol: null,
    filialCol: null,
    stageCol: null,
    globalPendingCol: null,
    sectorCols: {},
  };

  for (const col of columns) {
    const norm = normalizeFluigColumnKey(col);
    const explicit = getExplicitSectorColumn(col);

    if (explicit) {
      if (!mapping.sectorCols[explicit.sector]) mapping.sectorCols[explicit.sector] = {};
      const bucket = mapping.sectorCols[explicit.sector]!;
      if (!bucket[explicit.role]) bucket[explicit.role] = col;
    }

    if (!mapping.idCol && /^(num_proces|idmov|numero processo|codigo processo|identificador|num_solicitacao|numero_solicitacao)$/.test(norm.replace(/\s/g, '_'))) {
      mapping.idCol = col;
    }
    if (!mapping.idCol && /^num_proces$|^idmov$/i.test(col.trim())) mapping.idCol = col;

    if (!mapping.titleCol && /historico|titulo|descricao|titulo_solicitacao|assunto|solicitacao/.test(norm)) {
      mapping.titleCol = col;
    }
    if (!mapping.filialCol && /^filial$/.test(norm)) mapping.filialCol = col;
    if (!mapping.stageCol && /^(etapa_atual|etapa atual|fase_atual|fase atual|status_etapa|etapa workflow)$/.test(norm.replace(/\s/g, '_'))) {
      mapping.stageCol = col;
    }
    if (!mapping.stageCol && norm === 'etapa atual') mapping.stageCol = col;
    if (!mapping.stageCol && norm === 'fase atual') mapping.stageCol = col;

    if (
      !mapping.globalPendingCol &&
      /pendente com|com quem|responsavel atual|usuario pendente|usuario atual|pool|destinatario|atual responsavel/.test(norm)
    ) {
      mapping.globalPendingCol = col;
    }

    for (const sector of SECTOR_ORDER) {
      if (!columnBelongsToSector(col, sector)) continue;
      const role = classifySectorColumnRole(norm, col);
      if (!role) continue;
      if (!mapping.sectorCols[sector]) mapping.sectorCols[sector] = {};
      const bucket = mapping.sectorCols[sector]!;
      if (!bucket[role]) bucket[role] = col;
    }
  }

  if (!mapping.idCol) {
    mapping.idCol =
      columns.find((c) => /^NUM_PROCES$/i.test(c)) ??
      columns.find((c) => /^IdMov$/i.test(c)) ??
      columns.find((c) => /num.*proces/i.test(c)) ??
      null;
  }

  if (!mapping.stageCol) {
    mapping.stageCol =
      columns.find((c) => /^Etapa_Atual$/i.test(c)) ??
      columns.find((c) => /^EtapaAtual$/i.test(c)) ??
      columns.find((c) => /^fase_Atual$/i.test(c)) ??
      columns.find((c) => /etapa.*atual/i.test(c)) ??
      null;
  }

  if (!mapping.titleCol) {
    mapping.titleCol =
      columns.find((c) => /historico/i.test(c)) ??
      columns.find((c) => /^titulo/i.test(c)) ??
      columns.find((c) => /^descricao$/i.test(c)) ??
      null;
  }

  return mapping;
}

function isG5WorkflowDataset(datasetId?: string): boolean {
  return datasetId === FLUIG_WORKFLOW_APPROVAL_DATASET_G5;
}

function resolveCurrentStage(
  row: Record<string, unknown>,
  columns: string[],
  mapping: WorkflowColumnMapping
): string | null {
  const primary = readCell(row, mapping.stageCol);

  for (const col of columns) {
    const norm = normalizeFluigColumnKey(col);
    if (!/etapa|fase|status.*workflow|status.*etapa/.test(norm)) continue;
    if (/^etapaatual$|^etapa_atual$|^numeroseqestado$|^codetapa$|^codigoetapa$/.test(norm.replace(/\s/g, ''))) {
      continue;
    }
    const val = readCell(row, col);
    if (val && val.trim() && !/^\d+$/.test(val.trim())) return val.trim();
  }

  return primary?.trim() || null;
}

function parseStatusText(raw: string): WorkflowStepStatus {
  const s = normalizeFluigColumnKey(raw);
  if (!s) return 'unknown';
  if (/rejeit|recus|cancel|negad|reprov/.test(s)) return 'rejected';
  if (/aprovad|conclu|finaliz|liberad|ok\b|sim\b|autoriz|validad|deferid/.test(s)) return 'approved';
  if (/pendente|aguard|analise|validacao|em aprov|fila|pool|atribuid/.test(s)) return 'pending';
  return 'unknown';
}

export function sectorFromStageText(stage: string, datasetId?: string): WorkflowSector | null {
  const s = normalizeFluigColumnKey(stage);
  if (!s) return null;
  if (/finaliz|conclu|encerr|complet|pago|liquid/.test(s)) return null;

  if (isG5WorkflowDataset(datasetId)) {
    if (/^\s*117\s*$/.test(stage.trim()) || /etapa\s*117/.test(s)) return null;
    if (/\bgestor\b/.test(s) && !/compras/.test(s)) return 'tecnico';
  }

  if (/compras|suprimentos|gestor de compras|gestor compras/.test(s)) return 'compras';
  if (/tecnico|setor tecn/.test(s)) return 'tecnico';
  if (/diretoria|diretor/.test(s)) return 'diretoria';
  return null;
}

function sectorOrderIndex(sector: WorkflowSector): number {
  return SECTOR_ORDER.indexOf(sector);
}

function isStageFullyApproved(stage: string, datasetId?: string): boolean {
  const trimmed = stage.trim();
  const s = normalizeFluigColumnKey(stage);

  if (isG5WorkflowDataset(datasetId)) {
    if (trimmed === '117' || /etapa\s*117/i.test(stage)) return true;
    if (/\bfinalizada\b/i.test(stage)) return true;
    if (
      /\b(finalizad[oa]|encerrad[oa]|conclu[íi]d[oa])\b/i.test(stage) &&
      !/\b(não|nao)\s+(finaliz|encerr|conclu)/i.test(stage)
    ) {
      return true;
    }
  }

  return /finaliz|conclu|encerr|complet|aprovad.*total|processo conclu/.test(s);
}

function readCell(row: Record<string, unknown>, col: string | null | undefined): string {
  if (!col) return '';
  return formatFluigCellValue(row[col]);
}

function isGenericStatusWord(value: string): boolean {
  return /^(sim|nao|não|ok|aprovado|pendente|aguardando|rejeitado|concluido|concluído|finalizado)$/i.test(
    value.trim()
  );
}

export function extractPersonFromCellValue(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();

  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]?.trim()) {
    const inner = parenMatch[1].trim();
    if (!isGenericStatusWord(inner)) return inner;
  }

  const labeledMatch = trimmed.match(
    /(?:aprovad[oa]?|pendente|aguardando|rejeitad[oa]?|concluid[oa]?|finalizad[oa]?)\s*(?:por|com|:|-)\s*(.+)$/i
  );
  if (labeledMatch?.[1]?.trim()) {
    const inner = labeledMatch[1].trim();
    if (!isGenericStatusWord(inner)) return inner;
  }

  const splitParts = trimmed.split(/\s*[-–|]\s*/);
  if (splitParts.length > 1) {
    const tail = splitParts.slice(1).join(' ').trim();
    if (tail && !isGenericStatusWord(tail) && parseStatusText(tail) === 'unknown') return tail;
  }

  if (isGenericStatusWord(trimmed)) return null;
  if (parseStatusText(trimmed) === 'approved' && trimmed.length <= 12) return null;
  if (parseStatusText(trimmed) === 'pending' && !/[\s]/.test(trimmed)) return null;

  const withoutSectorPrefix = trimmed.replace(/^[^:]+:\s*/, '').trim();
  if (withoutSectorPrefix && withoutSectorPrefix !== trimmed && !isGenericStatusWord(withoutSectorPrefix)) {
    return withoutSectorPrefix;
  }

  if (/[\s]/.test(trimmed) && parseStatusText(trimmed) === 'unknown') {
    return trimmed;
  }

  if (parseStatusText(trimmed) !== 'unknown') return null;

  return trimmed;
}

function scanSectorPersonFromRow(
  row: Record<string, unknown>,
  columns: string[],
  sector: WorkflowSector
): string | null {
  const sectorColumns = getSectorColumns(columns, sector);
  const approverCols: string[] = [];
  const pendingCols: string[] = [];
  const statusCols: string[] = [];
  const otherCols: string[] = [];

  for (const col of sectorColumns) {
    const norm = normalizeFluigColumnKey(col);
    const role = classifySectorColumnRole(norm, col);
    if (role === 'approver') approverCols.push(col);
    else if (role === 'pending') pendingCols.push(col);
    else if (role === 'status') statusCols.push(col);
    else otherCols.push(col);
  }

  for (const col of [...approverCols, ...pendingCols, ...statusCols, ...otherCols]) {
    const val = readCell(row, col);
    if (!val || isGenericStatusWord(val)) continue;

    const person = extractPersonFromCellValue(val);
    if (person) return person;
  }

  return null;
}

function resolveSectorFieldValues(
  row: Record<string, unknown>,
  columns: string[],
  sector: WorkflowSector,
  mapping: WorkflowColumnMapping
) {
  const cols = mapping.sectorCols[sector] ?? {};
  const sectorColumns = getSectorColumns(columns, sector);
  const explicitApproverCols = sectorColumns.filter((col) => {
    const explicit = getExplicitSectorColumn(col);
    return explicit?.sector === sector && explicit.role === 'approver';
  });

  const approverCols = sectorColumns.filter((col) => classifySectorColumnRole(normalizeFluigColumnKey(col), col) === 'approver');
  const pendingCols = sectorColumns.filter((col) => classifySectorColumnRole(normalizeFluigColumnKey(col), col) === 'pending');
  const statusCols = sectorColumns.filter((col) => classifySectorColumnRole(normalizeFluigColumnKey(col), col) === 'status');
  const dateCols = sectorColumns.filter((col) => classifySectorColumnRole(normalizeFluigColumnKey(col), col) === 'date');

  return {
    statusRaw: readFirstNonEmpty(row, [
      ...(cols.status ? [cols.status] : []),
      ...statusCols,
    ]),
    approverRaw: readFirstNonEmpty(row, [
      ...explicitApproverCols,
      ...(cols.approver ? [cols.approver] : []),
      ...approverCols.filter((col) => !explicitApproverCols.includes(col)),
    ]),
    dateRaw: readFirstNonEmpty(row, [
      ...(cols.date ? [cols.date] : []),
      ...dateCols,
    ]),
    pendingRaw: readFirstNonEmpty(row, [
      ...(cols.pending ? [cols.pending] : []),
      ...pendingCols,
    ]),
  };
}

export function parseWorkflowApprovalRow(
  row: Record<string, unknown>,
  columns: string[],
  mapping: WorkflowColumnMapping,
  rowIndex: number,
  datasetId?: string
): ParsedWorkflowRow {
  const processId =
    readCell(row, mapping.idCol) ||
    readCell(row, columns.find((c) => /^NUM_PROCES$/i.test(c)) ?? null) ||
    `linha-${rowIndex + 1}`;

  const title = readCell(row, mapping.titleCol) || processId;
  const filial = mapping.filialCol ? readCell(row, mapping.filialCol) || null : null;
  const currentStage = resolveCurrentStage(row, columns, mapping);
  const globalPending = readCell(row, mapping.globalPendingCol) || null;
  const pendingSector = currentStage ? sectorFromStageText(currentStage, datasetId) : null;
  const fullyApproved =
    (currentStage ? isStageFullyApproved(currentStage, datasetId) : false) ||
    (isG5WorkflowDataset(datasetId) && isG5CompletedPendingText(globalPending));

  const gestorSetorName = isG5WorkflowDataset(datasetId)
    ? readG5GestorSetorName(row, columns)
    : null;
  const gestorPendingLabel = isG5WorkflowDataset(datasetId)
    ? readG5GestorPendingLabel(row, columns)
    : null;

  const steps: WorkflowApprovalStep[] = SECTOR_ORDER.map((sector) => {
    const { statusRaw, approverRaw, dateRaw, pendingRaw } = resolveSectorFieldValues(
      row,
      columns,
      sector,
      mapping
    );

    let status: WorkflowStepStatus = statusRaw ? parseStatusText(statusRaw) : 'unknown';
    let approver = approverRaw ? extractPersonFromCellValue(approverRaw) ?? approverRaw : null;
    let approvedAt = dateRaw || null;
    let pendingWith = pendingRaw || null;
    let detail = statusRaw || null;

    if (status === 'unknown' && approver && !pendingWith) {
      status = 'approved';
    }

    if (pendingSector === sector) {
      status = 'pending';
      pendingWith = pendingWith || globalPending || approver || null;
      approver = null;
      detail = currentStage;
    } else if (pendingSector && sectorOrderIndex(sector) > sectorOrderIndex(pendingSector)) {
      status = 'waiting';
      approver = null;
      approvedAt = null;
      pendingWith = null;
    } else if (pendingSector && sectorOrderIndex(sector) < sectorOrderIndex(pendingSector)) {
      if (status === 'unknown' || status === 'waiting') {
        status = approver || statusRaw ? 'approved' : 'approved';
      }
    }

    if (fullyApproved && status !== 'rejected') {
      status = 'approved';
      pendingWith = null;
    }

    if (status === 'approved' && !approver && statusRaw) {
      const parsed = parseStatusText(statusRaw);
      if (parsed === 'approved' && statusRaw.length > 2 && !/^(sim|ok|aprovado)$/i.test(statusRaw.trim())) {
        approver = extractPersonFromCellValue(statusRaw) ?? statusRaw;
      }
    }

    if (status === 'approved' && !approver) {
      approver =
        scanSectorPersonFromRow(row, columns, sector) ??
        extractPersonFromCellValue(pendingRaw) ??
        extractPersonFromCellValue(approverRaw) ??
        null;
    }

    if (status === 'pending' && !pendingWith) {
      pendingWith =
        extractPersonFromCellValue(pendingRaw) ??
        extractPersonFromCellValue(approverRaw) ??
        scanSectorPersonFromRow(row, columns, sector);
    }

    return {
      sector,
      label: SECTOR_LABELS[sector],
      status,
      approver,
      approvedAt,
      pendingWith,
      detail,
    };
  });

  const currentPendingWith =
    globalPending ||
    (pendingSector ? steps.find((s) => s.sector === pendingSector)?.pendingWith ?? null : null);

  return {
    rowKey: `${processId}-${rowIndex}`,
    processId,
    title,
    filial,
    currentStage,
    currentPendingWith,
    currentPendingSector: fullyApproved ? null : pendingSector,
    fullyApproved,
    steps,
    raw: row,
    datasetId,
    gestorSetorName,
    gestorPendingLabel,
  };
}

export function parseWorkflowApprovalRows(
  values: Record<string, unknown>[],
  columns: string[],
  datasetId?: string
): { rows: ParsedWorkflowRow[]; mapping: WorkflowColumnMapping } {
  const mapping = buildWorkflowColumnMapping(columns);
  const rows = values.map((row, index) =>
    parseWorkflowApprovalRow(row, columns, mapping, index, datasetId)
  );
  return { rows, mapping };
}

export function countWorkflowSummary(rows: ParsedWorkflowRow[]) {
  return {
    total: rows.length,
    fullyApproved: rows.filter((r) => r.fullyApproved).length,
    pendingCompras: rows.filter((r) => r.currentPendingSector === 'compras').length,
    pendingTecnico: rows.filter((r) => r.currentPendingSector === 'tecnico').length,
    pendingDiretoria: rows.filter((r) => r.currentPendingSector === 'diretoria').length,
    pendingOther: rows.filter((r) => !r.fullyApproved && !r.currentPendingSector).length,
  };
}

export type WorkflowApproverRequestRef = {
  rowKey: string;
  processId: string;
  title: string;
  filial: string | null;
  sector: WorkflowSector;
  sectorLabel: string;
  approvedAt: string | null;
};

export type WorkflowApproverBucket = {
  nameKey: string;
  name: string;
  approvedCount: number;
  approvedRequests: WorkflowApproverRequestRef[];
  pendingCount: number;
  pendingRequests: WorkflowApproverRequestRef[];
};

function normalizeApproverNameKey(name: string): string {
  return normalizeFluigColumnKey(name);
}

function isWorkflowApproverPerson(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  if (isGenericGestorPlaceholder(name)) return false;
  const normalized = normalizeFluigColumnKey(name);
  if (/^(compras|diretoria|gestor|dpo|verificar setor)$/.test(normalized)) return false;
  if (/^gestor\s+(de\s+)?/.test(normalized) && name.length < 28) return false;
  return true;
}

function resolveApprovedPersonFromStep(step: WorkflowApprovalStep): string | null {
  if (step.status !== 'approved') return null;
  const candidates = [
    step.approver,
    extractPersonFromCellValue(step.approver),
    extractPersonFromCellValue(step.detail),
    extractPersonFromCellValue(step.pendingWith),
  ];
  for (const candidate of candidates) {
    if (candidate && isWorkflowApproverPerson(candidate)) return candidate.trim();
  }
  return null;
}

function resolvePendingPersonFromRow(row: ParsedWorkflowRow): string | null {
  const display = resolvePendingWithDisplay(row);
  if (display.person && isWorkflowApproverPerson(display.person)) {
    return display.person.trim();
  }

  const pendingStep = row.currentPendingSector
    ? row.steps.find((step) => step.sector === row.currentPendingSector)
    : null;
  if (!pendingStep) return null;

  const candidates = [
    extractPersonFromCellValue(pendingStep.pendingWith),
    pendingStep.pendingWith,
    extractPersonFromCellValue(pendingStep.detail),
  ];
  for (const candidate of candidates) {
    if (candidate && isWorkflowApproverPerson(candidate)) return candidate.trim();
  }
  return null;
}

export type AggregateWorkflowByApproverOptions = {
  /** Só contadores — não monta listas de solicitações (uso na lista de aprovadores). */
  summariesOnly?: boolean;
  /** Restringe listas completas a um aprovador (uso na página de detalhe). */
  nameKeyFilter?: string;
};

export function aggregateWorkflowByApprover(
  rows: ParsedWorkflowRow[],
  options?: AggregateWorkflowByApproverOptions
): WorkflowApproverBucket[] {
  const map = new Map<string, WorkflowApproverBucket>();
  const approvedDedup = new Map<string, Set<string>>();
  const pendingDedup = new Map<string, Set<string>>();
  const summariesOnly = options?.summariesOnly ?? false;
  const nameKeyFilter = options?.nameKeyFilter
    ? resolveWorkflowApproverNameKey(options.nameKeyFilter)
    : null;

  const ensureBucket = (rawName: string): WorkflowApproverBucket | null => {
    const trimmed = rawName.trim();
    const nameKey = normalizeApproverNameKey(trimmed);
    if (nameKeyFilter && nameKey !== nameKeyFilter) return null;

    const existing = map.get(nameKey);
    if (existing) return existing;

    const bucket: WorkflowApproverBucket = {
      nameKey,
      name: trimmed,
      approvedCount: 0,
      approvedRequests: summariesOnly ? [] : [],
      pendingCount: 0,
      pendingRequests: summariesOnly ? [] : [],
    };
    map.set(nameKey, bucket);
    return bucket;
  };

  const getApprovedDedup = (nameKey: string): Set<string> => {
    let set = approvedDedup.get(nameKey);
    if (!set) {
      set = new Set();
      approvedDedup.set(nameKey, set);
    }
    return set;
  };

  const getPendingDedup = (nameKey: string): Set<string> => {
    let set = pendingDedup.get(nameKey);
    if (!set) {
      set = new Set();
      pendingDedup.set(nameKey, set);
    }
    return set;
  };

  for (const row of rows) {
    const visibleSectors = getWorkflowSectorsForDataset(row.datasetId ?? '');

    for (const step of row.steps) {
      if (!visibleSectors.includes(step.sector)) continue;
      const person = resolveApprovedPersonFromStep(step);
      if (!person) continue;

      const bucket = ensureBucket(person);
      if (!bucket) continue;

      const dedupKey = `${row.processId}:${step.sector}`;
      const seen = getApprovedDedup(bucket.nameKey);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      if (!summariesOnly) {
        bucket.approvedRequests.push({
          rowKey: row.rowKey,
          processId: row.processId,
          title: row.title,
          filial: row.filial,
          sector: step.sector,
          sectorLabel: SECTOR_LABELS[step.sector],
          approvedAt: step.approvedAt,
        });
      }
      bucket.approvedCount += 1;
    }

    if (row.fullyApproved || !row.currentPendingSector) continue;
    if (!visibleSectors.includes(row.currentPendingSector)) continue;

    const person = resolvePendingPersonFromRow(row);
    if (!person) continue;

    const bucket = ensureBucket(person);
    if (!bucket) continue;

    const seen = getPendingDedup(bucket.nameKey);
    if (seen.has(row.processId)) continue;
    seen.add(row.processId);

    if (!summariesOnly) {
      bucket.pendingRequests.push({
        rowKey: row.rowKey,
        processId: row.processId,
        title: row.title,
        filial: row.filial,
        sector: row.currentPendingSector,
        sectorLabel: SECTOR_LABELS[row.currentPendingSector],
        approvedAt: null,
      });
    }
    bucket.pendingCount += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
    if (b.approvedCount !== a.approvedCount) return b.approvedCount - a.approvedCount;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });
}

export type MergedWorkflowApproverSummary = {
  nameKey: string;
  name: string;
  approvedCount: number;
  pendingCount: number;
  totalCount: number;
  inG3: boolean;
  inG5: boolean;
};

export function mergeWorkflowApproverBuckets(
  g3Buckets: readonly WorkflowApproverBucket[],
  g5Buckets: readonly WorkflowApproverBucket[]
): MergedWorkflowApproverSummary[] {
  const map = new Map<string, MergedWorkflowApproverSummary>();

  const ingest = (bucket: WorkflowApproverBucket, source: 'g3' | 'g5') => {
    const current = map.get(bucket.nameKey);
    if (!current) {
      map.set(bucket.nameKey, {
        nameKey: bucket.nameKey,
        name: bucket.name,
        approvedCount: bucket.approvedCount,
        pendingCount: bucket.pendingCount,
        totalCount: bucket.approvedCount + bucket.pendingCount,
        inG3: source === 'g3',
        inG5: source === 'g5',
      });
      return;
    }

    current.approvedCount += bucket.approvedCount;
    current.pendingCount += bucket.pendingCount;
    current.totalCount = current.approvedCount + current.pendingCount;
    if (source === 'g3') current.inG3 = true;
    if (source === 'g5') current.inG5 = true;
    if (bucket.name.length > current.name.length) current.name = bucket.name;
  };

  for (const bucket of g3Buckets) ingest(bucket, 'g3');
  for (const bucket of g5Buckets) ingest(bucket, 'g5');

  return Array.from(map.values()).sort((a, b) => {
    if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });
}

export function resolveWorkflowApproverNameKey(nameOrKey: string): string {
  return normalizeApproverNameKey(nameOrKey);
}

/** Nome legível a partir da URL ou nameKey (ex.: paulo%20ananias → Paulo Ananias). */
export function formatWorkflowApproverDisplayName(nameOrKey: string): string {
  let decoded = nameOrKey;
  try {
    decoded = decodeURIComponent(nameOrKey);
  } catch {
    decoded = nameOrKey;
  }

  const trimmed = decoded.trim();
  if (!trimmed) return 'Aprovador';

  const lowercaseParticles = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);

  return trimmed
    .split(/\s+/)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index > 0 && lowercaseParticles.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function buildWorkflowRowKeyMap(rows: readonly ParsedWorkflowRow[]): Map<string, ParsedWorkflowRow> {
  const map = new Map<string, ParsedWorkflowRow>();
  for (const row of rows) {
    map.set(row.rowKey, row);
  }
  return map;
}

export function findWorkflowApproverBucketByKey(
  buckets: readonly WorkflowApproverBucket[],
  nameKey: string
): WorkflowApproverBucket | null {
  const key = resolveWorkflowApproverNameKey(nameKey);
  return buckets.find((bucket) => bucket.nameKey === key) ?? null;
}

export function findWorkflowRowByKey(
  rows: readonly ParsedWorkflowRow[],
  rowKey: string
): ParsedWorkflowRow | null {
  for (const row of rows) {
    if (row.rowKey === rowKey) return row;
  }
  return null;
}
