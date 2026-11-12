import { randomUUID } from 'crypto';
import path from 'path';
import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';
import { prisma } from '../lib/prisma';
import { findEmployeeByCpf, isValidCpf, onlyDigits } from '../lib/employeeCpfLookup';
import { getLiberadoContractAccessForUser } from '../lib/contractAccess';
import { isWhatsAppSavedMediaReady } from '../lib/flowMedia';
import { readPersistentUpload, savePersistentUpload } from '../lib/persistentUpload';
import type { SendAction } from './WhatsAppBotService';

/**
 * Diário de Obra (RDO) pelo WhatsApp da Gennecy.
 * Fluxo: CPF → obra → dia → menu de lançamentos (atividade+fotos, mão de obra, equipamento,
 * material, ocorrência, observação, clima, resumo, finalizar).
 * Cada lançamento é gravado na hora no mesmo `DiarioObra` que o site usa (nada se perde se a pessoa sair).
 */

export type WhatsAppDiarioObraFlowStatus =
  | 'RDO_ASK_CPF'
  | 'RDO_SELECT_OBRA'
  | 'RDO_ASK_DATE'
  | 'RDO_HUB'
  | 'RDO_ACT_TITLE'
  | 'RDO_ACT_PHOTOS'
  | 'RDO_PHOTO_SELECT'
  | 'RDO_LABOR_TYPE'
  | 'RDO_LABOR_TEXT'
  | 'RDO_EQUIP_TEXT'
  | 'RDO_MAT_TEXT'
  | 'RDO_OCC_TEXT'
  | 'RDO_NOTE_TEXT'
  | 'RDO_WEATHER_SKY'
  | 'RDO_WEATHER_PRACT'
  | 'RDO_FINALIZE_CONFIRM'
  | 'RDO_COMPLETE';

type Result = {
  sendAction: SendAction;
  newStatus: WhatsAppDiarioObraFlowStatus | 'MENU';
  newPayload: Record<string, unknown>;
  newConversationStatus?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  clearPayload?: boolean;
};

type SavedMedia = { fileUrl: string; fileName: string; fileKey?: string } | null;
type Photo = { url: string; key: string; name: string };

const FLOW = 'DIARIO_OBRA';
const MODULE_KEY = pathToModuleKey('/ponto/diario-obra');
const TZ = 'America/Sao_Paulo';
const OBRA_PAGE_SIZE = 8;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;

// Ids de botões/linhas (sempre minúsculos: o webhook entrega o id em minúsculas).
const ID = {
  hoje: 'rdo_hoje',
  ontem: 'rdo_ontem',
  hub: 'rdo_hub',
  act: 'rdo_act',
  labor: 'rdo_labor',
  equip: 'rdo_equip',
  mat: 'rdo_mat',
  occ: 'rdo_occ',
  note: 'rdo_note',
  weather: 'rdo_weather',
  summary: 'rdo_summary',
  finalize: 'rdo_finalize',
  done: 'rdo_done',
  newAct: 'rdo_new_act',
  moreObras: 'rdo_more_obras',
  otherDate: 'rdo_other_date',
  direct: 'rdo_direct',
  indirect: 'rdo_indirect',
  sunny: 'rdo_sky_sun',
  partly: 'rdo_sky_partly',
  rain: 'rdo_sky_rain',
  practYes: 'rdo_pract_yes',
  practNo: 'rdo_pract_no',
  obraPrefix: 'rdo_obra_',
  actPrefix: 'rdo_actid_',
} as const;

function waButtons(body: string, buttons?: Array<{ id: string; title: string }>): SendAction {
  return {
    type: 'buttons',
    body,
    buttons: buttons ?? [
      { id: 'MENU', title: 'Menu' },
      { id: 'END', title: 'Encerrar' },
    ],
  };
}

function waList(
  body: string,
  rows: Array<{ id: string; title: string; description?: string }>,
  buttonText = 'Escolher',
): SendAction {
  return {
    type: 'list',
    body,
    buttonText,
    sections: [{ title: 'Opções', rows: rows.slice(0, 10) }],
  };
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** Dia de hoje (AAAA-MM-DD) no fuso de Brasília. */
function todayIso(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isoToBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Aceita DD/MM, DD/MM/AAAA, DD-MM-AAAA e AAAA-MM-DD. */
function parseDateToIso(input: string): string | null {
  const v = input.trim();
  let y: number;
  let m: number;
  let d: number;
  const br = v.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    y = br[3] ? Number(br[3]) : Number(todayIso().slice(0, 4));
    if (y < 100) y += 2000;
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "5 pedreiros", "pedreiro 5", "3x servente" ou só "eletricista" (quantidade 1). */
function parseQtyName(line: string): { quantity: number; name: string } | null {
  const t = line.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const lead = t.match(/^(\d{1,4}(?:[.,]\d+)?)\s*(?:x|un\.?|unidades?)?\s+(.+)$/i);
  if (lead) return { quantity: Number(lead[1].replace(',', '.')), name: lead[2].trim().slice(0, 200) };
  const trail = t.match(/^(.+?)\s+(\d{1,4}(?:[.,]\d+)?)$/);
  if (trail) return { quantity: Number(trail[2].replace(',', '.')), name: trail[1].trim().slice(0, 200) };
  if (/^\d+$/.test(t)) return null;
  return { quantity: 1, name: t.slice(0, 200) };
}

const UNIT_ALIASES: Record<string, string> = {
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg',
  m: 'm', metro: 'm', metros: 'm',
  m2: 'm²', 'm²': 'm²', m3: 'm³', 'm³': 'm³',
  l: 'L', lt: 'L', litro: 'L', litros: 'L',
  sc: 'sc', saco: 'sc', sacos: 'sc',
  cx: 'cx', caixa: 'cx', caixas: 'cx',
  pc: 'pç', pç: 'pç', peca: 'pç', peça: 'pç', pecas: 'pç', peças: 'pç',
  lata: 'lata', latas: 'lata', t: 't', ton: 't', tonelada: 't', toneladas: 't',
  br: 'br', barra: 'br', barras: 'br', rolo: 'rolo', rolos: 'rolo',
};

/** "10 sacos cimento", "50 kg areia" ou "20 tijolos" (unidade padrão: un). */
function parseMaterial(line: string): { quantity: number; unit: string; name: string } | null {
  const base = parseQtyName(line);
  if (!base) return null;
  const m = line.trim().match(/^(\d{1,4}(?:[.,]\d+)?)\s*([^\s\d]+)\s+(?:de\s+)?(.+)$/i);
  if (m) {
    const unit = UNIT_ALIASES[m[2].toLowerCase()];
    if (unit) return { quantity: Number(m[1].replace(',', '.')), unit, name: m[3].trim().slice(0, 200) };
  }
  return { quantity: base.quantity, unit: 'un', name: base.name };
}

function photoFromSaved(saved: NonNullable<SavedMedia>): { ext: string; mime: string } | null {
  const ext = path.extname(saved.fileName || saved.fileKey || saved.fileUrl || '').toLowerCase();
  if (!IMAGE_EXT.test(ext)) return null;
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext.startsWith('.hei') ? 'image/heic' : 'image/jpeg';
  return { ext, mime };
}

/** Copia a foto recebida no WhatsApp para a pasta do RDO (mesmo lugar das fotos enviadas pelo site). */
async function storeRdoPhoto(saved: NonNullable<SavedMedia>, obraId: string, date: string): Promise<Photo | null> {
  const info = photoFromSaved(saved);
  if (!info) return null;
  const source = saved.fileKey || saved.fileUrl;
  const buffer = source ? await readPersistentUpload(source) : null;
  if (!buffer) {
    // Não deu para reler o arquivo: aponta para o original (o servidor serve /uploads/<key> também do S3).
    const key = saved.fileKey || '';
    const url = saved.fileUrl || (key ? `/uploads/${key}` : '');
    return url ? { url, key, name: saved.fileName || 'foto' } : null;
  }
  const out = await savePersistentUpload({
    folder: `diario-obra/${obraId}/${date}`,
    buffer,
    originalName: `foto${info.ext}`,
    mimeType: info.mime,
    fileNamePrefix: 'foto-',
  });
  return { url: out.url, key: out.key, name: out.originalName };
}

// ---------- Conteúdo do RDO ----------

type Content = {
  noActivityNote: string;
  weather: {
    morning: { sky: string | null; practicable: boolean | null };
    afternoon: { sky: string | null; practicable: boolean | null };
  };
  activities: Array<{ id: string; title: string; description: string; start: string; end: string; photos: Photo[] }>;
  labor: { direct: any[]; indirect: any[] };
  equipment: any[];
  materials: any[];
  occurrences: any[];
  notes: Array<{ id: string; text: string }>;
};

function normalizeStored(raw: any): Content {
  const c = raw && typeof raw === 'object' ? raw : {};
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const period = (p: any) => ({ sky: p?.sky ?? null, practicable: p?.practicable ?? null });
  return {
    noActivityNote: String(c.noActivityNote ?? ''),
    weather: { morning: period(c.weather?.morning), afternoon: period(c.weather?.afternoon) },
    activities: arr(c.activities).map((a: any) => ({ ...a, photos: arr(a?.photos) })),
    labor: { direct: arr(c.labor?.direct), indirect: arr(c.labor?.indirect) },
    equipment: arr(c.equipment),
    materials: arr(c.materials),
    occurrences: arr(c.occurrences),
    notes: arr(c.notes),
  };
}

async function loadRdo(obraId: string, date: string) {
  const row = await prisma.diarioObra.findUnique({ where: { obraId_date: { obraId, date } } });
  return { row, content: normalizeStored(row?.content) };
}

class RdoFinalizedError extends Error {}

/** Lê o RDO, aplica a alteração e grava (cria o RDO do dia se ainda não existir). */
async function mutateRdo(
  obraId: string,
  date: string,
  userId: string,
  fn: (c: Content) => void,
): Promise<Content> {
  const { row, content } = await loadRdo(obraId, date);
  if (row?.finalizedAt) throw new RdoFinalizedError('RDO finalizado');
  fn(content);
  await prisma.diarioObra.upsert({
    where: { obraId_date: { obraId, date } },
    create: { obraId, date, noActivity: false, content: content as any, createdById: userId, updatedById: userId },
    update: { noActivity: false, noActivityReason: null, content: content as any, updatedById: userId },
  });
  return content;
}

const FINALIZED_TEXT =
  'Este RDO já foi *finalizado* e não aceita mais lançamentos pelo WhatsApp.\nPara alterar, reabra o RDO no sistema (Diários de Obra).';

// ---------- Obras e acesso ----------

async function userCanUseDiario(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findUnique({
    where: { userId_module_action: { userId, module: MODULE_KEY, action: PERMISSION_ACCESS_ACTION } },
    select: { allowed: true },
  });
  return Boolean(perm?.allowed);
}

async function obraScopeWhere(userId: string, isAdmin: boolean) {
  const access = await getLiberadoContractAccessForUser(userId, isAdmin);
  if (access.filter === 'none') return null;
  return {
    isActive: true,
    ...(access.filter === 'ids' ? { contratoId: { in: access.ids } } : {}),
  };
}

async function listObras(userId: string, isAdmin: boolean, query: string, page: number) {
  const scope = await obraScopeWhere(userId, isAdmin);
  if (!scope) return { rows: [], total: 0 };
  const where = {
    ...scope,
    ...(query ? { name: { contains: query, mode: 'insensitive' as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.obra.count({ where }),
    prisma.obra.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: page * OBRA_PAGE_SIZE,
      take: OBRA_PAGE_SIZE,
      select: { id: true, name: true, contrato: { select: { name: true } } },
    }),
  ]);
  return { rows, total };
}

async function obraListAction(
  userId: string,
  isAdmin: boolean,
  query: string,
  page: number,
  intro?: string,
): Promise<{ action: SendAction; empty: boolean }> {
  const { rows, total } = await listObras(userId, isAdmin, query, page);
  if (rows.length === 0) {
    return {
      empty: true,
      action: waButtons(
        query
          ? `Não achei obra com «${query}». Digite outra parte do nome ou toque em Menu.`
          : 'Não encontrei obras liberadas para o seu usuário. Fale com o responsável para liberar o contrato.',
      ),
    };
  }
  const items = rows.map((o) => ({
    id: `${ID.obraPrefix}${o.id}`,
    title: clip(o.name, 24),
    description: clip(o.contrato?.name ?? '', 72),
  }));
  const hasMore = (page + 1) * OBRA_PAGE_SIZE < total;
  if (hasMore) items.push({ id: ID.moreObras, title: 'Mais obras…', description: 'Ou digite parte do nome' });
  const head = intro ?? 'Em qual *obra* você vai lançar o diário?';
  return {
    empty: false,
    action: waList(`${head}\n\n(Dica: digite parte do nome da obra para buscar.)`, items, 'Ver obras'),
  };
}

// ---------- Textos / ações recorrentes ----------

function hubAction(p: Record<string, unknown>, content: Content | null, intro?: string): SendAction {
  const date = isoToBr(String(p.date));
  const counts = content
    ? `\n📋 ${content.activities.length} atividade(s) · 👷 ${content.labor.direct.length + content.labor.indirect.length} mão de obra · ⚠️ ${content.occurrences.length} ocorrência(s)`
    : '';
  return waList(
    `${intro ? `${intro}\n\n` : ''}*RDO ${date}* — ${p.obraName}${counts}\n\nO que você quer lançar?\n_Atalho: mande “5 pedreiros” para lançar mão de obra, ou envie uma foto._`,
    [
      { id: ID.act, title: 'Atividade (com fotos)' },
      { id: ID.labor, title: 'Mão de obra' },
      { id: ID.equip, title: 'Equipamentos' },
      { id: ID.mat, title: 'Materiais' },
      { id: ID.occ, title: 'Ocorrência' },
      { id: ID.note, title: 'Observação' },
      { id: ID.weather, title: 'Clima' },
      { id: ID.summary, title: 'Ver resumo do dia' },
      { id: ID.finalize, title: 'Finalizar RDO' },
    ],
    'Lançar no RDO',
  );
}

const backToHub = (): Array<{ id: string; title: string }> => [{ id: ID.hub, title: 'Voltar ao RDO' }];

function buildSummary(p: Record<string, unknown>, c: Content): string {
  const sky: Record<string, string> = { SUN: '☀️ Sol', PARTLY: '⛅ Parcialmente nublado', RAIN: '🌧️ Chuva' };
  const w = c.weather.morning.sky ? `${sky[c.weather.morning.sky] ?? ''}${c.weather.morning.practicable === false ? ' (não praticável)' : ''}` : '—';
  const lines: string[] = [`*RDO ${isoToBr(String(p.date))}* — ${p.obraName}`, '', `Clima: ${w}`];
  lines.push('', `*Atividades (${c.activities.length})*`);
  c.activities.forEach((a) => lines.push(`• ${a.title}${a.photos.length ? ` — 📷 ${a.photos.length}` : ''}`));
  if (!c.activities.length) lines.push('—');
  const labor = [...c.labor.direct.map((l) => ({ ...l, t: 'direta' })), ...c.labor.indirect.map((l) => ({ ...l, t: 'indireta' }))];
  lines.push('', `*Mão de obra (${labor.length})*`);
  labor.forEach((l) => lines.push(`• ${l.quantity ?? 1} ${l.role} (${l.t})`));
  if (!labor.length) lines.push('—');
  if (c.equipment.length) {
    lines.push('', `*Equipamentos (${c.equipment.length})*`);
    c.equipment.forEach((e) => lines.push(`• ${e.quantity ?? 1} ${e.name}`));
  }
  if (c.materials.length) {
    lines.push('', `*Materiais (${c.materials.length})*`);
    c.materials.forEach((m) => lines.push(`• ${m.quantity ?? 1} ${m.unit ?? 'un'} ${m.name}`));
  }
  if (c.occurrences.length) {
    lines.push('', `*Ocorrências (${c.occurrences.length})*`);
    c.occurrences.forEach((o) => lines.push(`• ${clip(String(o.description), 100)}`));
  }
  if (c.notes.length) {
    lines.push('', `*Observações (${c.notes.length})*`);
    c.notes.forEach((n) => lines.push(`• ${clip(String(n.text), 100)}`));
  }
  // Corpo de mensagem interativa do WhatsApp aceita no máximo 1024 caracteres.
  return clip(lines.join('\n'), 1000);
}

// ---------- Entrada do fluxo ----------

export function isWhatsAppDiarioObraFlowStatus(status: string): boolean {
  return status.startsWith('RDO_');
}

export function isWhatsAppDiarioObraMenuSelection(content: string): boolean {
  return (
    content === 'diario_obra' ||
    content === 'rdo' ||
    content.includes('diário de obra') ||
    content.includes('diario de obra') ||
    content.includes('diario da obra') ||
    content.includes('diário da obra')
  );
}

export async function processWhatsAppDiarioObraFlow(params: {
  phone: string;
  textRaw: string;
  content: string;
  flowStatus: string;
  payload: Record<string, unknown>;
  hasMedia?: boolean;
  savedMedia?: SavedMedia;
  isMenuRequest: () => boolean;
  isEndRequest: () => boolean;
  resetToMenu: () => SendAction;
  endConversation: () => SendAction;
}): Promise<Result | null> {
  const {
    textRaw,
    content,
    flowStatus,
    payload,
    hasMedia = false,
    savedMedia = null,
    isMenuRequest,
    isEndRequest,
    resetToMenu,
    endConversation,
  } = params;

  const startingFromMenu = flowStatus === 'MENU' && isWhatsAppDiarioObraMenuSelection(content);
  if (!isWhatsAppDiarioObraFlowStatus(flowStatus) && !startingFromMenu) return null;

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  const p: Record<string, unknown> = startingFromMenu ? { flow: FLOW } : { ...payload, flow: FLOW };
  const status = (startingFromMenu ? 'RDO_ASK_CPF' : flowStatus) as WhatsAppDiarioObraFlowStatus;

  if (startingFromMenu) {
    return {
      sendAction: waButtons(
        '📋 *Diário de Obra*\n\nVamos lançar o RDO pelo WhatsApp. Para começar, me informe o seu *CPF* (somente números).',
      ),
      newStatus: 'RDO_ASK_CPF',
      newPayload: p,
      newConversationStatus: 'PENDING',
    };
  }

  const userId = String(p.userId || '');
  const isAdmin = p.isAdmin === true;
  const stay = (sendAction: SendAction, np = p): Result => ({ sendAction, newStatus: status, newPayload: np });
  const go = (sendAction: SendAction, newStatus: WhatsAppDiarioObraFlowStatus, np = p): Result => ({
    sendAction,
    newStatus,
    newPayload: np,
  });
  const fail = (text: string): Result => ({
    sendAction: waButtons(text),
    newStatus: 'MENU',
    newPayload: {},
    clearPayload: true,
  });

  // Daqui em diante já precisamos de obra/dia definidos (exceto nas etapas iniciais).
  const early = status === 'RDO_ASK_CPF' || status === 'RDO_SELECT_OBRA' || status === 'RDO_ASK_DATE';
  if (!early && (!p.obraId || !p.date || !userId)) {
    return fail('Perdi o fio do RDO. Abra o menu e escolha «Diário de obra» para recomeçar.');
  }
  const obraId = String(p.obraId || '');
  const date = String(p.date || '');

  const hubWith = async (intro?: string): Promise<Result> => {
    const { content: c } = await loadRdo(obraId, date);
    delete p.actId;
    delete p.laborType;
    delete p.pendingPhotos;
    return go(hubAction(p, c, intro), 'RDO_HUB');
  };

  const guard = async <T>(fn: () => Promise<T>): Promise<T | Result> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RdoFinalizedError) return go(waButtons(FINALIZED_TEXT, [{ id: ID.otherDate, title: 'Outro dia' }, { id: 'MENU', title: 'Menu' }]), 'RDO_ASK_DATE');
      console.error('[WhatsApp RDO] erro:', err);
      return fail('Não consegui salvar agora. Tente novamente em instantes.');
    }
  };
  const isResult = (v: unknown): v is Result => !!v && typeof v === 'object' && 'sendAction' in (v as object);

  /** Anexa fotos pendentes (ou a foto atual) à atividade. */
  const attachPhotos = async (actId: string, photos: Photo[]) =>
    guard(async () => {
      let title = '';
      let total = 0;
      await mutateRdo(obraId, date, userId, (c) => {
        const a = c.activities.find((x) => x.id === actId);
        if (!a) return;
        a.photos.push(...photos);
        title = a.title;
        total = a.photos.length;
      });
      return { title, total };
    });

  /** Foto recebida agora (se houver), já copiada para a pasta do RDO. */
  const incomingPhoto = async (): Promise<Photo | null | 'invalid'> => {
    if (!hasMedia) return null;
    // Chegou mídia mas o download falhou: pede para reenviar em vez de cair em "não entendi".
    if (!isWhatsAppSavedMediaReady(hasMedia, savedMedia)) return 'invalid';
    const stored = await storeRdoPhoto(savedMedia!, obraId, date);
    return stored ?? 'invalid';
  };

  const pendingList = (): Photo[] => (Array.isArray(p.pendingPhotos) ? (p.pendingPhotos as Photo[]) : []);

  const photoSelectAction = async (): Promise<SendAction> => {
    const { content: c } = await loadRdo(obraId, date);
    const rows = c.activities.slice(-8).map((a) => ({ id: `${ID.actPrefix}${a.id}`, title: clip(a.title || 'Atividade', 24) }));
    rows.push({ id: ID.newAct, title: 'Outra atividade' });
    const n = pendingList().length;
    return waList(`Recebi ${n > 1 ? `suas ${n} fotos` : 'sua foto'}. Em qual atividade ${n > 1 ? 'elas entram' : 'ela entra'}?`, rows, 'Ver atividades');
  };

  switch (status) {
    case 'RDO_ASK_CPF': {
      const digits = onlyDigits(textRaw);
      if (!digits || !isValidCpf(digits)) {
        return stay(waButtons('CPF inválido. Envie o seu CPF (com ou sem pontuação).'));
      }
      const employee = await findEmployeeByCpf(digits);
      if (!employee) {
        return stay(waButtons('Não encontrei colaborador ativo com esse CPF. Confira o número e envie novamente.'));
      }
      const admin = (employee.position || '').trim().toLowerCase() === 'administrador';
      if (!(await userCanUseDiario(employee.userId, admin))) {
        return fail('Seu usuário ainda não tem acesso aos Diários de Obra. Peça a liberação ao responsável e tente de novo.');
      }
      p.userId = employee.userId;
      p.userName = employee.name;
      p.isAdmin = admin;
      p.obraQuery = '';
      p.obraPage = 0;
      const { action, empty } = await obraListAction(employee.userId, admin, '', 0, `Olá, ${employee.name.split(' ')[0]}! Em qual *obra* você vai lançar o diário?`);
      if (empty) return fail('Não encontrei obras liberadas para o seu usuário. Fale com o responsável para liberar o contrato.');
      return go(action, 'RDO_SELECT_OBRA');
    }

    case 'RDO_SELECT_OBRA': {
      if (content === ID.moreObras) {
        const total = (await listObras(userId, isAdmin, String(p.obraQuery || ''), 0)).total;
        const nextPage = Number(p.obraPage || 0) + 1;
        p.obraPage = nextPage * OBRA_PAGE_SIZE >= total ? 0 : nextPage;
        const { action } = await obraListAction(userId, isAdmin, String(p.obraQuery || ''), Number(p.obraPage));
        return stay(action);
      }
      let chosenId = content.startsWith(ID.obraPrefix) ? textRaw.trim().slice(ID.obraPrefix.length) : '';
      if (!chosenId) {
        // Texto livre: busca por nome; se achar só uma, já escolhe.
        const q = textRaw.trim().slice(0, 80);
        if (q.length < 2) return stay((await obraListAction(userId, isAdmin, String(p.obraQuery || ''), Number(p.obraPage || 0))).action);
        const found = await listObras(userId, isAdmin, q, 0);
        if (found.total === 1) chosenId = found.rows[0].id;
        else {
          p.obraQuery = found.total ? q : '';
          p.obraPage = 0;
          const { action } = await obraListAction(userId, isAdmin, found.total ? q : '', 0);
          return stay(found.total ? action : waButtons(`Não achei obra com «${q}». Digite outra parte do nome ou toque em Menu.`));
        }
      }
      const scope = await obraScopeWhere(userId, isAdmin);
      const obra = scope
        ? await prisma.obra.findFirst({ where: { ...scope, id: chosenId }, select: { id: true, name: true } })
        : null;
      if (!obra) return stay((await obraListAction(userId, isAdmin, '', 0, 'Obra não encontrada. Escolha na lista:')).action);
      p.obraId = obra.id;
      p.obraName = obra.name;
      return go(
        waButtons(`Obra: *${obra.name}*.\n\nDe qual *dia* é o RDO? Toque em uma opção ou digite a data (ex.: *11/11*).`, [
          { id: ID.hoje, title: `Hoje (${isoToBr(todayIso()).slice(0, 5)})` },
          { id: ID.ontem, title: `Ontem (${isoToBr(todayIso(-1)).slice(0, 5)})` },
          { id: 'MENU', title: 'Menu' },
        ]),
        'RDO_ASK_DATE',
      );
    }

    case 'RDO_ASK_DATE': {
      if (content === ID.otherDate) {
        return stay(waButtons('Digite a data do RDO (ex.: *11/11* ou *11/11/2026*).'));
      }
      const iso = content === ID.hoje ? todayIso() : content === ID.ontem ? todayIso(-1) : parseDateToIso(textRaw);
      if (!iso) return stay(waButtons('Data inválida. Toque em Hoje/Ontem ou digite no formato *DD/MM* (ex.: 11/11).'));
      if (iso > todayIso()) return stay(waButtons('Não dá para lançar RDO de dia futuro. Informe uma data de hoje ou anterior.'));
      const { row } = await loadRdo(obraId, iso);
      p.date = iso;
      if (row?.finalizedAt) {
        return stay(waButtons(FINALIZED_TEXT, [{ id: ID.otherDate, title: 'Outro dia' }, { id: 'MENU', title: 'Menu' }]));
      }
      return hubWith(row ? 'Esse dia já tem RDO em andamento — vou somar ao que já existe.' : 'RDO aberto para esse dia. 👷');
    }

    case 'RDO_HUB': {
      // Foto direto no menu → pergunta a atividade.
      if (hasMedia) {
        const photo = await incomingPhoto();
        if (photo === 'invalid') return stay(waButtons('Não consegui receber essa foto. Envie como *imagem* (não como documento) e tente de novo.', backToHub()));
        if (photo) {
          p.pendingPhotos = [photo];
          const { content: c } = await loadRdo(obraId, date);
          if (!c.activities.length) {
            return go(waButtons('Recebi sua foto. Qual o *nome da atividade* em que ela entra? (ex.: “Alvenaria no subsolo”)', backToHub()), 'RDO_ACT_TITLE');
          }
          return go(await photoSelectAction(), 'RDO_PHOTO_SELECT');
        }
      }
      switch (content) {
        case ID.act:
          return go(waButtons('Qual a *atividade* realizada? (ex.: “Alvenaria no subsolo”)', backToHub()), 'RDO_ACT_TITLE');
        case ID.labor:
          return go(
            waButtons('A mão de obra é *direta* (própria da obra) ou *indireta* (apoio/administração)?', [
              { id: ID.direct, title: 'Direta' },
              { id: ID.indirect, title: 'Indireta' },
              { id: ID.hub, title: 'Voltar ao RDO' },
            ]),
            'RDO_LABOR_TYPE',
          );
        case ID.equip:
          return go(
            waButtons('Quais *equipamentos* foram usados? Mande no formato “2 retroescavadeira”. Pode mandar vários, um por linha.', backToHub()),
            'RDO_EQUIP_TEXT',
          );
        case ID.mat:
          return go(
            waButtons('Quais *materiais* chegaram/foram usados? Ex.: “10 sacos cimento”, “50 kg areia”. Um por linha.', backToHub()),
            'RDO_MAT_TEXT',
          );
        case ID.occ:
          return go(waButtons('Descreva a *ocorrência* (o que aconteceu):', backToHub()), 'RDO_OCC_TEXT');
        case ID.note:
          return go(waButtons('Escreva a *observação* do dia:', backToHub()), 'RDO_NOTE_TEXT');
        case ID.weather:
          return go(
            waButtons('Como foi o *clima* no dia?', [
              { id: ID.sunny, title: '☀️ Sol' },
              { id: ID.partly, title: '⛅ Nublado' },
              { id: ID.rain, title: '🌧️ Chuva' },
            ]),
            'RDO_WEATHER_SKY',
          );
        case ID.summary: {
          const { content: c } = await loadRdo(obraId, date);
          return go(waButtons(buildSummary(p, c), [{ id: ID.hub, title: 'Voltar ao RDO' }, { id: ID.finalize, title: 'Finalizar RDO' }]), 'RDO_HUB');
        }
        case ID.finalize: {
          const { content: c } = await loadRdo(obraId, date);
          const warn = c.activities.length ? '' : '\n⚠️ Ainda não há nenhuma atividade lançada.';
          return go(
            waButtons(`Finalizar o RDO de *${isoToBr(date)}* — ${p.obraName}?${warn}\n\nDepois de finalizado, só dá para alterar reabrindo no sistema.`, [
              { id: 'SIM', title: 'Sim, finalizar' },
              { id: ID.hub, title: 'Voltar ao RDO' },
            ]),
            'RDO_FINALIZE_CONFIRM',
          );
        }
        case ID.hub:
          return hubWith();
      }
      // Atalho: "5 pedreiros" lança mão de obra direta.
      const quick = textRaw.match(/^\s*(\d{1,3})\s+([A-Za-zÀ-ÿ][^\n]{1,80})$/);
      if (quick) {
        const parsed = parseQtyName(textRaw);
        if (parsed) {
          const r = await guard(() =>
            mutateRdo(obraId, date, userId, (c) => {
              c.labor.direct.push({ id: randomUUID().slice(0, 8), role: parsed.name, quantity: parsed.quantity, hours: null, notes: '' });
            }),
          );
          if (isResult(r)) return r;
          return hubWith(`✅ ${parsed.quantity} ${parsed.name} lançado(s) na mão de obra *direta*. Se forem de empreiteira/indiretos, use «Mão de obra».`);
        }
      }
      return stay(hubAction(p, (await loadRdo(obraId, date)).content, 'Não entendi 😅 Escolha uma opção da lista.'));
    }

    case 'RDO_ACT_TITLE': {
      if (content === ID.hub) return hubWith();
      if (hasMedia) {
        const photo = await incomingPhoto();
        if (photo && photo !== 'invalid') p.pendingPhotos = [...pendingList(), photo];
        return stay(waButtons('Foto recebida 📷. Agora me diga o *nome da atividade* em que ela entra.', backToHub()));
      }
      const title = textRaw.trim().slice(0, 300);
      if (title.length < 3) return stay(waButtons('Descreva a atividade com pelo menos 3 letras.', backToHub()));
      const actId = randomUUID().slice(0, 8);
      const pending = pendingList();
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          c.activities.push({ id: actId, title, description: '', start: '', end: '', photos: pending });
        }),
      );
      if (isResult(r)) return r;
      p.actId = actId;
      delete p.pendingPhotos;
      return go(
        waButtons(
          `✅ Atividade «${title}» registrada${pending.length ? ` com ${pending.length} foto(s)` : ''}.\n\nEnvie as *fotos* dela (pode mandar várias) ou, se quiser, uma *descrição* em texto. Quando terminar, toque em «Pronto».`,
          [{ id: ID.done, title: 'Pronto' }, { id: ID.newAct, title: 'Outra atividade' }],
        ),
        'RDO_ACT_PHOTOS',
      );
    }

    case 'RDO_ACT_PHOTOS': {
      const actId = String(p.actId || '');
      if (content === ID.done || content === ID.hub) return hubWith('Atividade salva ✅');
      if (content === ID.newAct) {
        return go(waButtons('Qual o nome da *próxima atividade*?', backToHub()), 'RDO_ACT_TITLE');
      }
      if (hasMedia) {
        const photo = await incomingPhoto();
        if (photo === 'invalid') return stay(waButtons('Não consegui receber essa foto. Envie como *imagem* e tente de novo.', [{ id: ID.done, title: 'Pronto' }]));
        if (photo) {
          const r = await attachPhotos(actId, [photo]);
          if (isResult(r)) return r;
          return stay(
            waButtons(`📷 Foto salva em «${r.title}» (${r.total} no total). Mande mais ou toque em «Pronto».`, [
              { id: ID.done, title: 'Pronto' },
              { id: ID.newAct, title: 'Outra atividade' },
            ]),
          );
        }
      }
      const description = textRaw.trim().slice(0, 2000);
      if (description) {
        const r = await guard(() =>
          mutateRdo(obraId, date, userId, (c) => {
            const a = c.activities.find((x) => x.id === actId);
            if (a) a.description = a.description ? `${a.description}\n${description}` : description;
          }),
        );
        if (isResult(r)) return r;
        return stay(waButtons('📝 Descrição anexada à atividade. Mande mais fotos ou toque em «Pronto».', [{ id: ID.done, title: 'Pronto' }]));
      }
      return stay(waButtons('Envie as fotos da atividade ou toque em «Pronto».', [{ id: ID.done, title: 'Pronto' }]));
    }

    case 'RDO_PHOTO_SELECT': {
      if (hasMedia) {
        const photo = await incomingPhoto();
        if (photo && photo !== 'invalid') p.pendingPhotos = [...pendingList(), photo];
        return stay(await photoSelectAction());
      }
      if (content === ID.newAct) {
        return go(waButtons('Qual o *nome da nova atividade*? (ex.: “Reboco da laje 3”)', backToHub()), 'RDO_ACT_TITLE');
      }
      if (content === ID.hub) return hubWith();
      if (!content.startsWith(ID.actPrefix)) {
        return stay(await photoSelectAction());
      }
      const actId = textRaw.trim().slice(ID.actPrefix.length);
      const pending = pendingList();
      const { content: c } = await loadRdo(obraId, date);
      if (!c.activities.some((a) => a.id === actId)) {
        return stay(waButtons('Essa lista não é mais a atual. Toque em «Voltar ao RDO» e envie a foto de novo.', backToHub()));
      }
      const r = await attachPhotos(actId, pending);
      if (isResult(r)) return r;
      p.actId = actId;
      delete p.pendingPhotos;
      return go(
        waButtons(`📷 ${pending.length} foto(s) salva(s) em «${r.title}». Mande mais fotos ou toque em «Pronto».`, [
          { id: ID.done, title: 'Pronto' },
          { id: ID.newAct, title: 'Outra atividade' },
        ]),
        'RDO_ACT_PHOTOS',
      );
    }

    case 'RDO_LABOR_TYPE': {
      if (content === ID.hub) return hubWith();
      if (content !== ID.direct && content !== ID.indirect) {
        return stay(
          waButtons('Toque em *Direta* ou *Indireta*.', [
            { id: ID.direct, title: 'Direta' },
            { id: ID.indirect, title: 'Indireta' },
            { id: ID.hub, title: 'Voltar ao RDO' },
          ]),
        );
      }
      p.laborType = content === ID.indirect ? 'indirect' : 'direct';
      return go(
        waButtons('Mande a *quantidade e a função*, ex.: “5 pedreiros”. Pode mandar vários, um por linha (“2 serventes”, “1 mestre”).', backToHub()),
        'RDO_LABOR_TEXT',
      );
    }

    case 'RDO_LABOR_TEXT': {
      if (content === ID.hub) return hubWith();
      const items = textRaw.split(/\n+/).map(parseQtyName).filter((x): x is { quantity: number; name: string } => !!x);
      if (!items.length) return stay(waButtons('Não entendi. Mande assim: “5 pedreiros”.', backToHub()));
      const type = p.laborType === 'indirect' ? 'indirect' : 'direct';
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          for (const it of items) {
            c.labor[type].push({ id: randomUUID().slice(0, 8), role: it.name, quantity: it.quantity, hours: null, notes: '' });
          }
        }),
      );
      if (isResult(r)) return r;
      return stay(waButtons(`✅ Lançado (${type === 'direct' ? 'direta' : 'indireta'}):\n${items.map((i) => `• ${i.quantity} ${i.name}`).join('\n')}\n\nMande mais ou toque em «Voltar ao RDO».`, backToHub()));
    }

    case 'RDO_EQUIP_TEXT': {
      if (content === ID.hub) return hubWith();
      const items = textRaw.split(/\n+/).map(parseQtyName).filter((x): x is { quantity: number; name: string } => !!x);
      if (!items.length) return stay(waButtons('Não entendi. Mande assim: “2 retroescavadeira”.', backToHub()));
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          for (const it of items) {
            c.equipment.push({ id: randomUUID().slice(0, 8), name: it.name, quantity: it.quantity, hours: null, notes: '' });
          }
        }),
      );
      if (isResult(r)) return r;
      return stay(waButtons(`✅ Equipamento(s) lançado(s):\n${items.map((i) => `• ${i.quantity} ${i.name}`).join('\n')}\n\nMande mais ou toque em «Voltar ao RDO».`, backToHub()));
    }

    case 'RDO_MAT_TEXT': {
      if (content === ID.hub) return hubWith();
      const items = textRaw.split(/\n+/).map(parseMaterial).filter((x): x is { quantity: number; unit: string; name: string } => !!x);
      if (!items.length) return stay(waButtons('Não entendi. Mande assim: “10 sacos cimento”.', backToHub()));
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          for (const it of items) {
            c.materials.push({ id: randomUUID().slice(0, 8), name: it.name, quantity: it.quantity, unit: it.unit, notes: '' });
          }
        }),
      );
      if (isResult(r)) return r;
      return stay(waButtons(`✅ Material(is) lançado(s):\n${items.map((i) => `• ${i.quantity} ${i.unit} ${i.name}`).join('\n')}\n\nMande mais ou toque em «Voltar ao RDO».`, backToHub()));
    }

    case 'RDO_OCC_TEXT': {
      if (content === ID.hub) return hubWith();
      const description = textRaw.trim().slice(0, 2000);
      if (description.length < 3) return stay(waButtons('Descreva a ocorrência com um pouco mais de detalhe.', backToHub()));
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          c.occurrences.push({ id: randomUUID().slice(0, 8), description, severity: 'LOW', start: '', end: '', actions: '' });
        }),
      );
      if (isResult(r)) return r;
      return hubWith('✅ Ocorrência registrada (gravidade baixa — ajuste no sistema se precisar).');
    }

    case 'RDO_NOTE_TEXT': {
      if (content === ID.hub) return hubWith();
      const text = textRaw.trim().slice(0, 2000);
      if (text.length < 2) return stay(waButtons('Escreva a observação do dia.', backToHub()));
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          c.notes.push({ id: randomUUID().slice(0, 8), text });
        }),
      );
      if (isResult(r)) return r;
      return hubWith('✅ Observação registrada.');
    }

    case 'RDO_WEATHER_SKY': {
      const sky = content === ID.sunny ? 'SUN' : content === ID.partly ? 'PARTLY' : content === ID.rain ? 'RAIN' : '';
      if (!sky) return hubWith();
      p.sky = sky;
      return go(
        waButtons('O tempo permitiu trabalhar normalmente (*praticável*)?', [
          { id: ID.practYes, title: 'Praticável' },
          { id: ID.practNo, title: 'Não praticável' },
        ]),
        'RDO_WEATHER_PRACT',
      );
    }

    case 'RDO_WEATHER_PRACT': {
      const practicable = content === ID.practYes ? true : content === ID.practNo ? false : null;
      if (practicable === null) return hubWith();
      const sky = String(p.sky || '');
      const r = await guard(() =>
        mutateRdo(obraId, date, userId, (c) => {
          c.weather.morning = { sky, practicable };
          c.weather.afternoon = { sky, practicable };
        }),
      );
      if (isResult(r)) return r;
      delete p.sky;
      return hubWith('✅ Clima registrado (manhã e tarde). Se foi diferente, ajuste no sistema.');
    }

    case 'RDO_FINALIZE_CONFIRM': {
      if (content === ID.hub || NO_WORDS.test(textRaw)) return hubWith();
      if (!YES_WORDS.test(textRaw) && content !== 'sim') {
        return stay(
          waButtons('Confirma finalizar o RDO?', [
            { id: 'SIM', title: 'Sim, finalizar' },
            { id: ID.hub, title: 'Voltar ao RDO' },
          ]),
        );
      }
      const r = await guard(async () => {
        const { row } = await loadRdo(obraId, date);
        if (!row) throw new Error('RDO não encontrado');
        if (!row.finalizedAt) {
          await prisma.diarioObra.update({
            where: { id: row.id },
            data: { finalizedAt: new Date(), finalizedById: userId, updatedById: userId },
          });
        }
      });
      if (isResult(r)) return r;
      return {
        sendAction: waButtons(`✅ RDO de *${isoToBr(date)}* — ${p.obraName} finalizado!\nEle já aparece no sistema em Diários de Obra.`, [
          { id: 'DIARIO_OBRA', title: 'Outro RDO' },
          { id: 'MENU', title: 'Menu principal' },
          { id: 'END', title: 'Encerrar' },
        ]),
        newStatus: 'RDO_COMPLETE',
        newPayload: { flow: FLOW },
        newConversationStatus: 'COMPLETED',
      };
    }

    case 'RDO_COMPLETE':
      if (isWhatsAppDiarioObraMenuSelection(content)) {
        return {
          sendAction: waButtons('📋 *Diário de Obra*\n\nMe informe o seu *CPF* (somente números) para começar outro RDO.'),
          newStatus: 'RDO_ASK_CPF',
          newPayload: { flow: FLOW },
          newConversationStatus: 'PENDING',
        };
      }
      return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
    default:
      return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
}
