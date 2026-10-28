import jsPDF from 'jspdf';
import { EXPORT_COMPANY, loadPdfGennesisLogoStrip } from '@/lib/exportBrandingLogos';
import type { CronogramaExcelAparencia, CronogramaExcelLinha } from '@/lib/exportCronogramaExcel';

type RGB = [number, number, number];

const MARGIN = 10;
const TEXTO: RGB = [17, 24, 39];
const MUTED: RGB = [100, 116, 139];
const BORDA: RGB = [226, 232, 240];
const BORDA_FORTE: RGB = [203, 213, 225];
const HOJE: RGB = [220, 38, 38];
const PLANEJADO: RGB = [203, 213, 225];

const STATUS: Record<CronogramaExcelLinha['status'], { bg: RGB; fg: RGB; barra: RGB }> = {
  pendente: { bg: [243, 244, 246], fg: [75, 85, 99], barra: [156, 163, 175] },
  em_andamento: { bg: [224, 242, 254], fg: [3, 105, 161], barra: [14, 165, 233] },
  concluido: { bg: [220, 252, 231], fg: [21, 128, 61], barra: [34, 197, 94] },
  atrasado: { bg: [254, 226, 226], fg: [185, 28, 28], barra: [239, 68, 68] },
};

const DIA_MS = 24 * 60 * 60 * 1000;
const NOMES_MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function hex(h: string | undefined, fallback: RGB): RGB {
  if (!h) return fallback;
  const s = h.replace('#', '').trim();
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function paraMs(iso?: string): number | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function formatData(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function formatNumero(n: number | undefined, casas = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 });
}

function formatMoeda(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Coluna = { titulo: string; w: number; align: 'left' | 'center' | 'right' };

/**
 * PDF do cronograma em A4 paisagem: tabela (Item, Serviço, Unidade, Quantidade, Custo, Início, Fim,
 * Dias, % exec., Status) e, ao lado, a linha do tempo com as barras de planejado e realizado.
 */
export async function exportCronogramaPdf(
  linhasEntrada: CronogramaExcelLinha[],
  opts: {
    filename: string;
    titulo?: string;
    contrato?: string;
    aparencia?: CronogramaExcelAparencia;
    hoje?: Date;
  }
): Promise<void> {
  const ap = opts.aparencia ?? {};
  const linhas = linhasEntrada.filter((l) => !(ap.ocultarTitulos && l.cabecalhoServico));
  if (linhas.length === 0) throw new Error('Nenhum serviço para exportar');

  const tituloBg = hex(ap.tituloFundo, [220, 38, 38]);
  const tituloFg = hex(ap.tituloTexto, [255, 255, 255]);
  const compBg = hex(ap.composicaoFundo, [255, 255, 255]);
  const compFg = hex(ap.composicaoTexto, TEXTO);
  const compBgAlt = hex(ap.composicaoFundoAlt, [241, 245, 249]);
  const compFgAlt = hex(ap.composicaoTextoAlt, TEXTO);
  const headerBg = hex(ap.headerFundo, [249, 250, 251]);
  const headerFg = hex(ap.headerTexto, [75, 85, 99]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const geradoEm = new Date();
  const hoje = opts.hoje ?? new Date();
  const hojeMs = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0);

  const colunas: Coluna[] = [
    { titulo: 'ITEM', w: 11, align: 'center' },
    { titulo: 'SERVIÇO', w: 62, align: 'left' },
    { titulo: 'UN.', w: 9, align: 'center' },
    { titulo: 'QTD.', w: 14, align: 'center' },
    { titulo: 'CUSTO C/ BDI', w: 23, align: 'right' },
    { titulo: 'INÍCIO', w: 17, align: 'center' },
    { titulo: 'FIM', w: 17, align: 'center' },
    { titulo: 'DIAS', w: 9, align: 'center' },
    { titulo: '% EXEC.', w: 12, align: 'center' },
    { titulo: 'STATUS', w: 19, align: 'center' },
  ];
  const larguraTabela = colunas.reduce((s, c) => s + c.w, 0);

  // ---- linha do tempo
  const marcos: number[] = [];
  for (const l of linhas) {
    for (const iso of [l.inicio, l.fim, l.inicioReal, l.fimReal]) {
      const ms = paraMs(iso);
      if (ms != null) marcos.push(ms);
    }
  }
  const temTimeline = marcos.length > 0;
  const iniMs = temTimeline ? Math.min(...marcos) : 0;
  const fimMs = temTimeline ? Math.max(...marcos) : 0;
  const totalDias = temTimeline ? Math.round((fimMs - iniMs) / DIA_MS) + 1 : 0;
  const passo = Math.max(1, Math.ceil(totalDias / 70));
  const nCols = temTimeline ? Math.ceil(totalDias / passo) : 0;
  const xTimeline = MARGIN + larguraTabela;
  const larguraTimeline = temTimeline ? pageW - MARGIN - xTimeline : 0;
  const larguraCol = nCols > 0 ? larguraTimeline / nCols : 0;
  const xDeMs = (ms: number) => xTimeline + ((ms - iniMs) / DIA_MS / passo) * larguraCol;

  // ---- cabeçalho da página
  const logo = await loadPdfGennesisLogoStrip(12).catch(() => null);
  const titulo = opts.titulo || 'Cronograma da obra';

  const desenharTopo = (): number => {
    const alturaTopo = 20;
    doc.setFillColor(248, 249, 250);
    doc.rect(0, 0, pageW, alturaTopo, 'F');
    doc.setFillColor(185, 28, 28);
    doc.rect(0, alturaTopo - 1, pageW, 1, 'F');
    let x = MARGIN;
    if (logo) {
      doc.addImage(logo.dataUrl, 'PNG', MARGIN, 3, logo.wMm, logo.hMm);
      x = MARGIN + logo.wMm + 5;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TEXTO);
    doc.text(titulo, x, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    if (opts.contrato) doc.text(opts.contrato, x, 14);
    doc.text(
      `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} às ${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      pageW - MARGIN,
      9,
      { align: 'right' }
    );
    doc.text('Cinza = planejado · colorido = realizado', pageW - MARGIN, 14, { align: 'right' });
    return alturaTopo + 4;
  };

  const ALT_CAB_1 = 5;
  const ALT_CAB_2 = 6;

  const desenharCabecalhoTabela = (y: number): number => {
    const altura = ALT_CAB_1 + ALT_CAB_2;
    doc.setFillColor(...headerBg);
    doc.setDrawColor(...BORDA_FORTE);
    doc.setLineWidth(0.15);
    let x = MARGIN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...headerFg);
    for (const c of colunas) {
      doc.rect(x, y, c.w, altura, 'FD');
      const tx = c.align === 'left' ? x + 2 : c.align === 'right' ? x + c.w - 2 : x + c.w / 2;
      doc.text(c.titulo, tx, y + altura / 2 + 1.1, { align: c.align });
      x += c.w;
    }

    if (temTimeline) {
      // meses (linha de cima) e dias/semanas (linha de baixo)
      doc.setFillColor(...headerBg);
      doc.rect(xTimeline, y, larguraTimeline, altura, 'FD');
      let mesAtual = -1;
      let xMes = xTimeline;
      const fecharMes = (xFim: number, ms: number) => {
        if (mesAtual < 0) return;
        const d = new Date(ms);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(...headerFg);
        const larg = xFim - xMes;
        if (larg > 6) {
          doc.text(`${NOMES_MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, xMes + 1, y + 3.4);
        }
        doc.setDrawColor(...BORDA_FORTE);
        doc.line(xMes, y, xMes, y + ALT_CAB_1);
      };
      let msInicioMes = iniMs;
      for (let k = 0; k < nCols; k++) {
        const ms = iniMs + k * passo * DIA_MS;
        const d = new Date(ms);
        const chave = d.getUTCFullYear() * 12 + d.getUTCMonth();
        const xCol = xTimeline + k * larguraCol;
        if (chave !== mesAtual) {
          fecharMes(xCol, msInicioMes);
          mesAtual = chave;
          xMes = xCol;
          msInicioMes = ms;
        }
        const ehHoje = hojeMs >= ms && hojeMs < ms + passo * DIA_MS;
        if (ehHoje) {
          doc.setFillColor(...HOJE);
          doc.rect(xCol, y + ALT_CAB_1, larguraCol, ALT_CAB_2, 'F');
        }
        doc.setFont('helvetica', ehHoje ? 'bold' : 'normal');
        doc.setFontSize(larguraCol >= 3 ? 5.5 : 4.5);
        doc.setTextColor(...(ehHoje ? ([255, 255, 255] as RGB) : headerFg));
        const mostrar = larguraCol >= 3 ? true : k % 2 === 0;
        if (mostrar) {
          const rotulo = passo === 1 ? String(d.getUTCDate()) : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (larguraCol >= 6 || passo === 1) {
            doc.text(rotulo, xCol + larguraCol / 2, y + ALT_CAB_1 + 3.9, { align: 'center' });
          } else {
            doc.text(rotulo, xCol + larguraCol / 2 + 0.8, y + ALT_CAB_1 + 5.2, { align: 'center', angle: 90 });
          }
        }
      }
      fecharMes(xTimeline + larguraTimeline, msInicioMes);
      doc.setDrawColor(...BORDA_FORTE);
      doc.line(xTimeline, y + ALT_CAB_1, xTimeline + larguraTimeline, y + ALT_CAB_1);
    }
    return y + altura;
  };

  const desenharRodape = (pagina: number, total: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${EXPORT_COMPANY} — ${titulo}`, MARGIN, pageH - 5);
    doc.text(`Página ${pagina} de ${total}`, pageW - MARGIN, pageH - 5, { align: 'right' });
  };

  // ---- linhas
  const limiteY = pageH - 12;
  let y = desenharTopo();
  y = desenharCabecalhoTabela(y);
  let primeiraLinhaDaPagina = y;
  let listra = 0;

  const desenharLinhaDoTempoHoje = (yIni: number, yFim: number) => {
    if (!temTimeline || hojeMs < iniMs || hojeMs > fimMs + DIA_MS) return;
    const x = xDeMs(hojeMs) + larguraCol / 2;
    doc.setDrawColor(...HOJE);
    doc.setLineWidth(0.25);
    doc.line(x, yIni, x, yFim);
    doc.setLineWidth(0.15);
  };

  for (const l of linhas) {
    const ehServico = l.nivel === 0 && !ap.ocultarTitulos;
    let bg = compBg;
    let fg = compFg;
    if (ehServico) {
      bg = tituloBg;
      fg = tituloFg;
    } else if (l.nivel > 0 || ap.ocultarTitulos) {
      listra += 1;
      if (listra % 2 === 0) {
        bg = compBgAlt;
        fg = compFgAlt;
      }
    }

    doc.setFont('helvetica', ehServico ? 'bold' : 'normal');
    doc.setFontSize(7);
    const recuo = l.nivel > 0 ? 3 : 0;
    const textoServico = doc.splitTextToSize(l.label || '', colunas[1].w - 4 - recuo) as string[];
    const altura = Math.max(6.5, textoServico.length * 3.1 + 2.4);

    if (y + altura > limiteY) {
      desenharLinhaDoTempoHoje(primeiraLinhaDaPagina, y);
      doc.addPage();
      y = desenharTopo();
      y = desenharCabecalhoTabela(y);
      primeiraLinhaDaPagina = y;
    }

    // fundo da linha (tabela + timeline)
    doc.setFillColor(...bg);
    doc.rect(MARGIN, y, larguraTabela + larguraTimeline, altura, 'F');
    doc.setDrawColor(...BORDA);
    doc.setLineWidth(0.1);
    doc.line(MARGIN, y + altura, MARGIN + larguraTabela + larguraTimeline, y + altura);

    const iniP = paraMs(l.inicio);
    const fimP = paraMs(l.fim);
    const dias = iniP != null && fimP != null && fimP >= iniP ? Math.round((fimP - iniP) / DIA_MS) + 1 : null;
    const celulas: string[] = [
      l.item,
      '',
      l.nivel === 0 ? '' : l.unidade?.trim() || '—',
      l.nivel === 0 ? '' : formatNumero(l.quantidade),
      l.custo != null ? formatMoeda(l.custo) : '—',
      formatData(iniP),
      formatData(fimP),
      dias != null ? String(dias) : '—',
      `${formatNumero(l.pct, l.pct % 1 === 0 ? 0 : 2)}%`,
      '',
    ];

    doc.setTextColor(...fg);
    let x = MARGIN;
    colunas.forEach((c, i) => {
      if (i === 1) {
        doc.setFont('helvetica', ehServico ? 'bold' : 'normal');
        doc.setFontSize(7);
        textoServico.forEach((linha, k) => {
          doc.text(linha, x + 2 + recuo, y + 4 + k * 3.1);
        });
      } else if (i === 9) {
        const tom = STATUS[l.status];
        doc.setFillColor(...tom.bg);
        doc.roundedRect(x + 1.5, y + altura / 2 - 2.2, c.w - 3, 4.4, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...tom.fg);
        doc.text(l.statusLabel, x + c.w / 2, y + altura / 2 + 0.9, { align: 'center' });
        doc.setTextColor(...fg);
      } else {
        doc.setFont('helvetica', ehServico ? 'bold' : 'normal');
        doc.setFontSize(7);
        const tx = c.align === 'left' ? x + 2 : c.align === 'right' ? x + c.w - 2 : x + c.w / 2;
        doc.text(celulas[i], tx, y + altura / 2 + 1, { align: c.align });
      }
      x += c.w;
    });

    // barras (só nas linhas sem composições: o serviço-título não tem barra)
    if (temTimeline && !l.cabecalhoServico) {
      const tom = STATUS[l.status];
      const iniR = paraMs(l.inicioReal);
      const fimR = paraMs(l.fimReal);
      const yBarra = y + 1.2;
      const hTotal = altura - 2.4;
      if (iniP != null && fimP != null && fimP >= iniP) {
        const x1 = xDeMs(iniP);
        const w = Math.max(0.8, xDeMs(fimP + DIA_MS) - x1);
        doc.setFillColor(...PLANEJADO);
        const temReal = iniR != null && fimR != null;
        doc.rect(x1, temReal ? y + altura - 2.6 : yBarra, w, temReal ? 1.4 : hTotal, 'F');
      }
      if (iniR != null && fimR != null && fimR >= iniR) {
        const x1 = xDeMs(iniR);
        const w = Math.max(0.8, xDeMs(fimR + DIA_MS) - x1);
        const hReal = Math.max(2.2, hTotal - 2);
        doc.setFillColor(
          Math.round(tom.barra[0] + (255 - tom.barra[0]) * 0.75),
          Math.round(tom.barra[1] + (255 - tom.barra[1]) * 0.75),
          Math.round(tom.barra[2] + (255 - tom.barra[2]) * 0.75)
        );
        doc.rect(x1, yBarra, w, hReal, 'F');
        const pct = Math.max(0, Math.min(100, l.pct || 0)) / 100;
        if (pct > 0) {
          doc.setFillColor(...tom.barra);
          doc.rect(x1, yBarra, Math.max(0.5, w * pct), hReal, 'F');
        }
      }
    }

    y += altura;
  }
  desenharLinhaDoTempoHoje(primeiraLinhaDaPagina, y);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    desenharRodape(p, total);
  }
  doc.save(opts.filename);
}
