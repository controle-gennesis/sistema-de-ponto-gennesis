import { prisma } from '../lib/prisma';
import { KanbanService } from './KanbanService';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 8;
const DUE_SOON_DAYS = 7;
const OVERDUE_LIST_LIMIT = 20;
const ASSIGNEE_LIMIT = 15;
const LABEL_LIMIT = 15;
const AGING_BUCKETS = [
  { label: 'Até 7 dias', max: 7 },
  { label: '8 a 30 dias', max: 30 },
  { label: '31 a 90 dias', max: 90 },
  { label: 'Mais de 90 dias', max: Infinity },
];

export type KanbanDashboardGroup = 'total' | 'open' | 'completed' | 'overdue' | 'dueSoon';
export const KANBAN_DASHBOARD_GROUPS: KanbanDashboardGroup[] = ['total', 'open', 'completed', 'overdue', 'dueSoon'];
const CARD_LIST_LIMIT = 200;

export type KanbanDashboardFilters = {
  boardId?: string;
  assigneeUserId?: string;
};

type PersonRow = { userId: string | null; name: string; open: number; completed: number; overdue: number };

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // semana começa na segunda-feira
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Números do dashboard de Tasks. Só considera os quadros que o usuário já pode ver. */
export class KanbanDashboardService {
  private kanban = new KanbanService();

  async getDashboard(userId: string, filters: KanbanDashboardFilters) {
    const accessible = await this.kanban.listBoardsForUser(userId);
    const boards = accessible.map((b) => ({ id: b.id, name: b.name, department: b.department }));
    const boardIds =
      filters.boardId && boards.some((b) => b.id === filters.boardId)
        ? [filters.boardId]
        : boards.map((b) => b.id);

    if (boardIds.length === 0) return this.empty(boards);

    const cards = await prisma.kanbanCard.findMany({
      where: { archivedAt: null, column: { boardId: { in: boardIds } } },
      select: {
        id: true,
        title: true,
        priority: true,
        endDate: true,
        completedAt: true,
        createdAt: true,
        assigneeUserId: true,
        assigneeName: true,
        labels: true,
        column: { select: { title: true, color: true, position: true, boardId: true, board: { select: { name: true, departmentLabel: true } } } },
        members: { select: { userId: true, user: { select: { name: true } } } },
      },
    });

    const now = new Date();
    const soonLimit = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);

    const peopleOf = (c: (typeof cards)[number]): Array<{ id: string | null; name: string }> => {
      const out = new Map<string, { id: string | null; name: string }>();
      if (c.assigneeUserId || c.assigneeName) {
        const key = c.assigneeUserId ?? `n:${c.assigneeName}`;
        out.set(key, { id: c.assigneeUserId, name: c.assigneeName?.trim() || 'Sem nome' });
      }
      for (const m of c.members) out.set(m.userId, { id: m.userId, name: m.user?.name?.trim() || 'Sem nome' });
      return [...out.values()];
    };

    const scoped = filters.assigneeUserId
      ? cards.filter((c) => peopleOf(c).some((p) => p.id === filters.assigneeUserId))
      : cards;

    const isOverdue = (c: (typeof cards)[number]) => !c.completedAt && !!c.endDate && c.endDate < now;

    const summary = { total: scoped.length, open: 0, completed: 0, overdue: 0, dueSoon: 0, noDueDate: 0 };
    const columnMap = new Map<string, { title: string; color: string; position: number; count: number }>();
    const priorityMap = new Map<string, number>();
    const peopleMap = new Map<string, PersonRow>();
    const weekStart = startOfWeek(now);
    const weekly = Array.from({ length: WEEKS }, (_, i) => {
      const start = new Date(weekStart.getTime() - (WEEKS - 1 - i) * 7 * DAY_MS);
      return { weekStart: start.toISOString().slice(0, 10), created: 0, completed: 0, _t: start.getTime() };
    });
    const bumpWeek = (d: Date, key: 'created' | 'completed') => {
      const t = startOfWeek(d).getTime();
      const w = weekly.find((x) => x._t === t);
      if (w) w[key] += 1;
    };
    const labelMap = new Map<string, { text: string; color: string; count: number }>();
    const boardMap = new Map<string, { name: string; onTime: number; overdue: number; completed: number }>();
    const aging = AGING_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    const doneDays = new Map<number, { sum: number; n: number }>();
    const overdueList: Array<{
      id: string;
      title: string;
      board: string;
      column: string;
      dueDate: string;
      daysLate: number;
      priority: string;
      assignees: string[];
    }> = [];

    for (const c of scoped) {
      const done = !!c.completedAt;
      const late = isOverdue(c);
      if (done) summary.completed += 1;
      else summary.open += 1;
      if (late) summary.overdue += 1;
      if (!done && c.endDate && c.endDate >= now && c.endDate <= soonLimit) summary.dueSoon += 1;
      if (!c.endDate) summary.noDueDate += 1;

      const colKey = `${boardIds.length === 1 ? c.column.position : 0}:${c.column.title}`;
      const col = columnMap.get(colKey) ?? { title: c.column.title, color: c.column.color, position: c.column.position, count: 0 };
      col.count += 1;
      columnMap.set(colKey, col);

      if (!done) priorityMap.set(c.priority, (priorityMap.get(c.priority) ?? 0) + 1);

      for (const p of peopleOf(c)) {
        const key = p.id ?? `n:${p.name}`;
        const row = peopleMap.get(key) ?? { userId: p.id, name: p.name, open: 0, completed: 0, overdue: 0 };
        if (done) row.completed += 1;
        else row.open += 1;
        if (late) row.overdue += 1;
        peopleMap.set(key, row);
      }

      bumpWeek(c.createdAt, 'created');
      if (c.completedAt) {
        bumpWeek(c.completedAt, 'completed');
        const wk = startOfWeek(c.completedAt).getTime();
        const acc = doneDays.get(wk) ?? { sum: 0, n: 0 };
        acc.sum += Math.max(0, (c.completedAt.getTime() - c.createdAt.getTime()) / DAY_MS);
        acc.n += 1;
        doneDays.set(wk, acc);
      }

      if (Array.isArray(c.labels)) {
        for (const l of c.labels as Array<{ color?: unknown; text?: unknown }>) {
          if (!l || typeof l.color !== 'string') continue;
          const text = String(l.text ?? '').trim();
          const key = `${l.color}|${text}`;
          const cur = labelMap.get(key) ?? { text: text || 'Sem texto', color: l.color, count: 0 };
          cur.count += 1;
          labelMap.set(key, cur);
        }
      }

      const bRow = boardMap.get(c.column.boardId) ?? { name: `${c.column.board.name} · ${c.column.board.departmentLabel}`, onTime: 0, overdue: 0, completed: 0 };
      if (done) bRow.completed += 1;
      else if (late) bRow.overdue += 1;
      else bRow.onTime += 1;
      boardMap.set(c.column.boardId, bRow);

      if (!done) {
        const ageDays = (now.getTime() - c.createdAt.getTime()) / DAY_MS;
        const idx = AGING_BUCKETS.findIndex((b) => ageDays <= b.max);
        aging[idx === -1 ? aging.length - 1 : idx].count += 1;
      }

      if (late && c.endDate) {
        overdueList.push({
          id: c.id,
          title: c.title,
          board: c.column.board.name,
          column: c.column.title,
          dueDate: c.endDate.toISOString(),
          daysLate: Math.max(1, Math.floor((now.getTime() - c.endDate.getTime()) / DAY_MS)),
          priority: c.priority,
          assignees: peopleOf(c).map((p) => p.name),
        });
      }
    }

    return {
      boards,
      summary,
      byColumn: [...columnMap.values()]
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
        .map(({ title, color, count }) => ({ title, color, count })),
      byPriority: [...priorityMap.entries()].map(([priority, count]) => ({ priority, count })),
      byAssignee: [...peopleMap.values()]
        .sort((a, b) => b.open - a.open || b.overdue - a.overdue)
        .slice(0, ASSIGNEE_LIMIT),
      weekly: weekly.map(({ _t, ...w }) => {
        const d = doneDays.get(_t);
        return { ...w, avgDays: d ? Math.round((d.sum / d.n) * 10) / 10 : null };
      }),
      byLabel: [...labelMap.values()].sort((a, b) => b.count - a.count).slice(0, LABEL_LIMIT),
      byBoard: [...boardMap.values()].sort((a, b) => b.onTime + b.overdue - (a.onTime + a.overdue)),
      aging,
      overdueList: overdueList.sort((a, b) => b.daysLate - a.daysLate).slice(0, OVERDUE_LIST_LIMIT),
    };
  }

  /** Lista as tasks de um grupo dos cartões do topo (Total, Em aberto, Concluídas, Atrasadas, Vencem em 7 dias). */
  async listCards(userId: string, group: KanbanDashboardGroup, filters: KanbanDashboardFilters) {
    const accessible = await this.kanban.listBoardsForUser(userId);
    const boardIds =
      filters.boardId && accessible.some((b) => b.id === filters.boardId)
        ? [filters.boardId]
        : accessible.map((b) => b.id);
    if (boardIds.length === 0) return { total: 0, cards: [] };

    const cards = await prisma.kanbanCard.findMany({
      where: { archivedAt: null, column: { boardId: { in: boardIds } } },
      select: {
        id: true,
        title: true,
        priority: true,
        endDate: true,
        completedAt: true,
        assigneeUserId: true,
        assigneeName: true,
        column: {
          select: {
            id: true,
            title: true,
            board: { select: { name: true, departmentKey: true, departmentLabel: true } },
          },
        },
        members: { select: { userId: true, user: { select: { name: true } } } },
      },
    });

    const now = new Date();
    const soonLimit = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
    const peopleOf = (c: (typeof cards)[number]) => {
      const out = new Map<string, { id: string | null; name: string }>();
      if (c.assigneeUserId || c.assigneeName) {
        out.set(c.assigneeUserId ?? `n:${c.assigneeName}`, { id: c.assigneeUserId, name: c.assigneeName?.trim() || 'Sem nome' });
      }
      for (const m of c.members) out.set(m.userId, { id: m.userId, name: m.user?.name?.trim() || 'Sem nome' });
      return [...out.values()];
    };

    const inGroup = (c: (typeof cards)[number]) => {
      const done = !!c.completedAt;
      switch (group) {
        case 'open':
          return !done;
        case 'completed':
          return done;
        case 'overdue':
          return !done && !!c.endDate && c.endDate < now;
        case 'dueSoon':
          return !done && !!c.endDate && c.endDate >= now && c.endDate <= soonLimit;
        default:
          return true;
      }
    };

    const picked = cards
      .filter((c) => (filters.assigneeUserId ? peopleOf(c).some((p) => p.id === filters.assigneeUserId) : true))
      .filter(inGroup)
      .sort((a, b) => {
        // prazo mais antigo primeiro; sem prazo por último
        const ta = a.endDate ? a.endDate.getTime() : Infinity;
        const tb = b.endDate ? b.endDate.getTime() : Infinity;
        return ta - tb || a.title.localeCompare(b.title);
      });

    return {
      total: picked.length,
      cards: picked.slice(0, CARD_LIST_LIMIT).map((c) => ({
        id: c.id,
        title: c.title,
        board: c.column.board.name,
        boardDepartment: c.column.board.departmentLabel,
        boardDepartmentKey: c.column.board.departmentKey,
        columnId: c.column.id,
        column: c.column.title,
        dueDate: c.endDate ? c.endDate.toISOString() : null,
        priority: c.priority,
        completed: !!c.completedAt,
        assignees: peopleOf(c).map((p) => p.name),
      })),
    };
  }

  private empty(boards: Array<{ id: string; name: string; department: string }>) {
    return {
      boards,
      summary: { total: 0, open: 0, completed: 0, overdue: 0, dueSoon: 0, noDueDate: 0 },
      byColumn: [],
      byPriority: [],
      byAssignee: [],
      weekly: [],
      byLabel: [],
      byBoard: [],
      aging: [],
      overdueList: [],
    };
  }
}
