import api from './api';

export type HolidayMap = Map<string, string>;

/** Chave do dia, a mesma usada pela Agenda: ano-mês(0..11)-dia. */
function dayKey(y: number, m0: number, d: number): string {
  return `${y}-${m0}-${d}`;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** Feriados nacionais do Brasil (e datas comemorativas comuns) calculados localmente para um ano. */
export function nationalHolidaysOfYear(year: number): HolidayMap {
  const map: HolidayMap = new Map();
  const add = (d: Date, name: string) => map.set(dayKey(d.getFullYear(), d.getMonth(), d.getDate()), name);
  const easter = easterSunday(year);

  add(new Date(year, 0, 1), 'Confraternização Universal');
  add(addDays(easter, -47), 'Carnaval');
  add(addDays(easter, -2), 'Sexta-feira Santa');
  add(easter, 'Páscoa');
  add(new Date(year, 3, 21), 'Tiradentes');
  add(new Date(year, 4, 1), 'Dia do Trabalho');
  add(addDays(easter, 60), 'Corpus Christi');
  add(new Date(year, 8, 7), 'Independência do Brasil');
  add(new Date(year, 9, 12), 'Nossa Sra. Aparecida');
  add(new Date(year, 10, 2), 'Finados');
  add(new Date(year, 10, 15), 'Proclamação da República');
  if (year >= 2024) add(new Date(year, 10, 20), 'Consciência Negra');
  add(new Date(year, 11, 25), 'Natal');
  return map;
}

/** Feriados cadastrados no sistema (tabela de feriados do ponto) dentro do período. */
async function fetchRegisteredHolidays(from: Date, to: Date): Promise<HolidayMap> {
  const map: HolidayMap = new Map();
  try {
    const qs = `?startDate=${encodeURIComponent(from.toISOString())}&endDate=${encodeURIComponent(to.toISOString())}`;
    const res = await api.get(`/api/holidays/period${qs}`);
    if (!res.ok) return map;
    const json = await res.json().catch(() => ({}));
    const list = (json?.data ?? []) as Array<{ name?: string; date?: string }>;
    for (const h of list) {
      const iso = String(h.date ?? '').slice(0, 10); // AAAA-MM-DD: evita deslocar o dia pelo fuso
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m || !h.name) continue;
      map.set(dayKey(Number(m[1]), Number(m[2]) - 1, Number(m[3])), h.name);
    }
  } catch {
    // sem rede: ficam só os feriados nacionais calculados
  }
  return map;
}

/**
 * Feriados do período: os nacionais (calculados) mais os cadastrados no sistema
 * (estaduais, municipais ou da empresa), que prevalecem quando caem no mesmo dia.
 */
export async function fetchHolidays(from: Date, to: Date): Promise<HolidayMap> {
  const merged: HolidayMap = new Map();
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    nationalHolidaysOfYear(y).forEach((name, key) => merged.set(key, name));
  }
  const registered = await fetchRegisteredHolidays(from, to);
  registered.forEach((name, key) => merged.set(key, name));
  return merged;
}
