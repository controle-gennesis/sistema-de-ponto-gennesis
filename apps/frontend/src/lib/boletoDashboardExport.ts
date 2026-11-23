/** Exportação do Dashboard de Boletos (com os filtros aplicados) para Excel e PDF. */

export type ExportBucket = {
  key: string;
  label: string;
  count: number;
  value: number;
  pago: number;
  aVencer: number;
  vencido: number;
};

export type ExportDashboard = {
  totals: Record<'all' | 'PAGO' | 'A_VENCER' | 'VENCIDO', { count: number; value: number }>;
  next30: { count: number; value: number };
  byPolo: ExportBucket[];
  byManager: ExportBucket[];
  byCostCenter: ExportBucket[];
  bySupplier: ExportBucket[];
  byMonth: ExportBucket[];
  byPaymentType: ExportBucket[];
  byCondition: ExportBucket[];
  byMonthPolo: Array<{ key: string; polos: Record<string, { value: number; count: number }> }>;
};

export type ExportFilterLine = { label: string; value: string };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthLabel(key: string): string {
  if (key === 'sem-data') return 'Sem data';
  const [y, m] = key.split('-');
  return `${MESES[Number(m) - 1] ?? m}/${(y ?? '').slice(2)}`;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nowLabel(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type Section = { title: string; first: string; rows: ExportBucket[]; month?: boolean };

function sections(data: ExportDashboard): Section[] {
  return [
    { title: 'Valor por mês de vencimento', first: 'Mês', rows: data.byMonth, month: true },
    { title: 'Valor por polo', first: 'Polo', rows: data.byPolo },
    { title: 'Valor por gestor', first: 'Gestor', rows: data.byManager },
    { title: 'Valor por centro de custo', first: 'Centro de custo', rows: data.byCostCenter },
    { title: 'Valor por fornecedor', first: 'Fornecedor', rows: data.bySupplier },
    { title: 'Total por tipo de pagamento', first: 'Tipo de pagamento', rows: data.byPaymentType },
    { title: 'Condições de pagamento', first: 'Condição', rows: data.byCondition },
  ];
}

function kpiLines(data: ExportDashboard): Array<[string, number, number | null]> {
  const media = data.totals.all.count ? data.totals.all.value / data.totals.all.count : 0;
  return [
    ['Total em boletos', data.totals.all.value, data.totals.all.count],
    ['Pagos', data.totals.PAGO.value, data.totals.PAGO.count],
    ['À vencer', data.totals.A_VENCER.value, data.totals.A_VENCER.count],
    ['Vencidos', data.totals.VENCIDO.value, data.totals.VENCIDO.count],
    ['Valor médio por boleto', media, null],
    ['Vencem em 30 dias', data.next30.value, data.next30.count],
  ];
}

export async function exportDashboardExcel(data: ExportDashboard, filters: ExportFilterLine[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const moeda = '"R$" #,##0.00';

  const addSheet = (name: string, aoa: unknown[][], widths: number[], moneyCols: number[] = [], pctCols: number[] = []) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    const ref = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let r = ref.s.r; r <= ref.e.r; r += 1) {
      for (const c of moneyCols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = moeda;
      }
      for (const c of pctCols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = '0.0"%"';
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  // Resumo + filtros usados
  const resumo: unknown[][] = [
    ['Dashboard de Boletos'],
    [`Gerado em ${nowLabel()}`],
    [],
    ['Filtros aplicados'],
    ...(filters.length ? filters.map((f) => [f.label, f.value]) : [['Nenhum', 'Todos os boletos']]),
    [],
    ['Indicador', 'Valor', 'Quantidade'],
    ...kpiLines(data).map(([nome, valor, qtd]) => [nome, valor, qtd ?? '']),
  ];
  addSheet('Resumo', resumo, [30, 22, 14], [1]);

  const header = (first: string) => [first, 'Qtd.', 'Valor total', 'Pago', 'À vencer', 'Vencido', '% do total'];
  const total = data.totals.all.value;
  for (const s of sections(data)) {
    const aoa = [
      header(s.first),
      ...s.rows.map((b) => [s.month ? monthLabel(b.key) : b.label, b.count, b.value, b.pago, b.aVencer, b.vencido, pct(b.value, total)]),
    ];
    addSheet(s.title.replace(/[\\/?*[\]:]/g, ' '), aoa, [44, 8, 18, 18, 18, 18, 11], [2, 3, 4, 5], [6]);
  }

  // Resumo mensal por polo (valor por mês em cada polo)
  const polos = data.byPolo.map((p) => p.label);
  if (data.byMonthPolo.length && polos.length) {
    const aoa: unknown[][] = [
      ['Mês', ...polos, 'Total'],
      ...data.byMonthPolo.map((m) => {
        const valores = polos.map((p) => m.polos[p]?.value ?? 0);
        return [monthLabel(m.key), ...valores, valores.reduce((s, v) => s + v, 0)];
      }),
    ];
    addSheet('Resumo mensal por polo', aoa, [14, ...polos.map(() => 18), 18], polos.map((_, i) => i + 1).concat([polos.length + 1]));
  }

  XLSX.writeFile(wb, `dashboard-boletos-${stamp()}.xlsx`);
}

export async function exportDashboardPdf(data: ExportDashboard, filters: ExportFilterLine[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = M;

  const font = (size: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const ensure = (h: number) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };
  const cut = (text: string, width: number) => {
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t) > width) t = t.slice(0, -2);
    return t === text ? text : `${t.trimEnd()}…`;
  };

  // Cabeçalho
  doc.setFillColor(185, 28, 28);
  doc.rect(0, 0, pageW, 16, 'F');
  doc.setTextColor(255, 255, 255);
  font(15, true);
  doc.text('Dashboard de Boletos', M, 10.5);
  font(9);
  doc.text(`Gerado em ${nowLabel()}`, pageW - M, 10.5, { align: 'right' });
  doc.setTextColor(30, 30, 30);
  y = 24;

  // Filtros
  font(10, true);
  doc.text('Filtros aplicados', M, y);
  y += 5;
  font(9);
  const filtroTexto = filters.length ? filters.map((f) => `${f.label}: ${f.value}`).join('   |   ') : 'Nenhum (todos os boletos)';
  const filtroLinhas = doc.splitTextToSize(filtroTexto, pageW - M * 2) as string[];
  for (const l of filtroLinhas) {
    doc.text(l, M, y);
    y += 4.5;
  }
  y += 3;

  // Indicadores
  const kpis = kpiLines(data);
  const kw = (pageW - M * 2 - 5 * 4) / 6;
  kpis.forEach(([nome, valor, qtd], i) => {
    const x = M + i * (kw + 4);
    doc.setDrawColor(210, 210, 210);
    doc.roundedRect(x, y, kw, 18, 2, 2);
    font(8);
    doc.setTextColor(100, 100, 100);
    doc.text(nome, x + 3, y + 5.5);
    font(11, true);
    doc.setTextColor(30, 30, 30);
    doc.text(cut(brl(valor), kw - 6), x + 3, y + 11.5);
    font(8);
    doc.setTextColor(100, 100, 100);
    doc.text(qtd === null ? 'média por boleto' : `${qtd.toLocaleString('pt-BR')} boletos`, x + 3, y + 16);
  });
  doc.setTextColor(30, 30, 30);
  y += 26;

  // Tabelas
  const cols = [
    { head: '', w: 0, align: 'left' as const },
    { head: 'Qtd.', w: 16, align: 'right' as const },
    { head: 'Valor total', w: 32, align: 'right' as const },
    { head: 'Pago', w: 32, align: 'right' as const },
    { head: 'À vencer', w: 32, align: 'right' as const },
    { head: 'Vencido', w: 32, align: 'right' as const },
    { head: '% total', w: 16, align: 'right' as const },
  ];
  const usable = pageW - M * 2;
  const fixed = cols.slice(1).reduce((s, c) => s + c.w, 0);
  cols[0]!.w = usable - fixed;
  const MAX_ROWS = 25;
  const total = data.totals.all.value;

  const drawHeader = (first: string) => {
    doc.setFillColor(243, 244, 246);
    doc.rect(M, y, usable, 6.5, 'F');
    font(8.5, true);
    let x = M;
    cols.forEach((c, i) => {
      const label = i === 0 ? first : c.head;
      if (c.align === 'right') doc.text(label, x + c.w - 2, y + 4.5, { align: 'right' });
      else doc.text(label, x + 2, y + 4.5);
      x += c.w;
    });
    y += 6.5;
  };

  for (const s of sections(data)) {
    if (!s.rows.length) continue;
    ensure(26);
    font(11, true);
    doc.setTextColor(185, 28, 28);
    doc.text(s.title, M, y + 3);
    doc.setTextColor(30, 30, 30);
    y += 7;
    drawHeader(s.first);
    const rows = s.rows.slice(0, MAX_ROWS);
    rows.forEach((b, idx) => {
      if (y + 6 > pageH - M) {
        doc.addPage();
        y = M;
        drawHeader(s.first);
      }
      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(M, y, usable, 6, 'F');
      }
      font(8.5);
      const cells = [
        s.month ? monthLabel(b.key) : b.label,
        b.count.toLocaleString('pt-BR'),
        brl(b.value),
        brl(b.pago),
        brl(b.aVencer),
        brl(b.vencido),
        `${pct(b.value, total).toLocaleString('pt-BR')}%`,
      ];
      let x = M;
      cols.forEach((c, i) => {
        const txt = i === 0 ? cut(cells[i]!, c.w - 4) : cells[i]!;
        if (c.align === 'right') doc.text(txt, x + c.w - 2, y + 4.2, { align: 'right' });
        else doc.text(txt, x + 2, y + 4.2);
        x += c.w;
      });
      y += 6;
    });
    if (s.rows.length > MAX_ROWS) {
      font(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Mostrando os ${MAX_ROWS} maiores de ${s.rows.length}. A lista completa está no Excel.`, M, y + 3.5);
      doc.setTextColor(30, 30, 30);
      y += 6;
    }
    y += 6;
  }

  // Rodapé com paginação
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    font(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`Gennesis Conecta · Controle de Boletos · Página ${p} de ${pages}`, pageW / 2, pageH - 5, { align: 'center' });
  }

  doc.save(`dashboard-boletos-${stamp()}.pdf`);
}
