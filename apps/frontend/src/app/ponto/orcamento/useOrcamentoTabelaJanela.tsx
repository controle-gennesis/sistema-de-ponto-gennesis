'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const LIMITE_JANELA = 80;
const RANGE_FOLGA = 8;

function acharScrollParent(el: HTMLElement | null): HTMLElement | Window {
  const page = el?.closest?.('.app-page-scroll');
  if (page instanceof HTMLElement) return page;

  let node = el?.parentElement ?? null;
  while (node) {
    if (node.classList.contains('table-scroll')) {
      node = node.parentElement;
      continue;
    }
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function viewMetrics(scroller: HTMLElement | Window) {
  if (scroller === window) {
    return { top: 0, height: window.innerHeight };
  }
  const box = (scroller as HTMLElement).getBoundingClientRect();
  return { top: box.top, height: (scroller as HTMLElement).clientHeight };
}

export function TabelaJanelaSpacer({
  height,
  colSpan,
}: {
  height: number;
  colSpan: number;
}) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden className="pointer-events-none">
      <td
        colSpan={colSpan}
        style={{ height, padding: 0, border: 0, lineHeight: 0, fontSize: 0 }}
      >
        <div style={{ height, overflow: 'hidden' }} />
      </td>
    </tr>
  );
}

/** Só monta as linhas da viewport — tabelas grandes (analítico / FD) deixam de travar o scroll. */
export function useOrcamentoTabelaJanela(
  count: number,
  opts: { rowHeight?: number; overscan?: number; enabled?: boolean } = {}
) {
  const rowHeight = Math.max(28, opts.rowHeight ?? 44);
  const overscan = opts.overscan ?? 24;
  const enabled = (opts.enabled ?? true) && count > LIMITE_JANELA;
  const tbodyNodeRef = useRef<HTMLTableSectionElement | null>(null);
  const rangeRef = useRef({ start: 0, end: Math.min(count, LIMITE_JANELA + overscan) });
  const [range, setRange] = useState(rangeRef.current);
  const [semPadFim, setSemPadFim] = useState(false);

  const applyRange = useCallback((next: { start: number; end: number }) => {
    const prev = rangeRef.current;
    if (prev.start === next.start && prev.end === next.end) return;
    rangeRef.current = next;
    setRange(next);
  }, []);

  const measure = useCallback(() => {
    if (!enabled) {
      setSemPadFim((prev) => (prev ? false : prev));
      applyRange({ start: 0, end: count });
      return;
    }
    const el = tbodyNodeRef.current;
    if (!el || count <= 0) return;

    const scroller = acharScrollParent(el);
    const { top: viewTop, height: viewH } = viewMetrics(scroller);
    const viewBottom = viewTop + viewH;
    const thead = el.previousElementSibling;
    const stickyH =
      thead instanceof HTMLElement ? thead.getBoundingClientRect().height : 0;
    const anchorTop = viewTop + stickyH;
    const visible = Math.max(LIMITE_JANELA, Math.ceil(viewH / rowHeight) + overscan * 2);

    const offset = anchorTop - el.getBoundingClientRect().top;
    let start = offset <= 0 ? 0 : Math.max(0, Math.floor(offset / rowHeight) - overscan);
    let end = Math.min(count, start + visible);

    const dataRows = el.querySelectorAll('tr:not([aria-hidden])');
    const firstRow = dataRows[0] as HTMLElement | undefined;
    const lastRow = dataRows[dataRows.length - 1] as HTMLElement | undefined;

    if (firstRow) {
      const gapAbove = firstRow.getBoundingClientRect().top - anchorTop;
      if (gapAbove > 72) {
        start = Math.max(0, start - Math.ceil(gapAbove / rowHeight));
        end = Math.min(count, start + visible);
      }
    }

    let lastInView = false;
    if (lastRow) {
      const gapBelow = viewBottom - lastRow.getBoundingClientRect().bottom;
      lastInView = gapBelow > 8;
      if (gapBelow > 40 && end < count) {
        end = Math.min(count, end + Math.ceil(gapBelow / rowHeight) + overscan);
      }
    }
    setSemPadFim((prev) => (prev === lastInView ? prev : lastInView));

    start = Math.max(0, Math.min(start, Math.max(0, count - 1)));
    end = Math.min(count, Math.max(end, start + 1));

    const prev = rangeRef.current;
    if (
      Math.abs(start - prev.start) < RANGE_FOLGA &&
      Math.abs(end - prev.end) < RANGE_FOLGA &&
      start !== 0 &&
      end !== count &&
      prev.end !== count
    ) {
      return;
    }

    applyRange({ start, end });
  }, [applyRange, count, enabled, overscan, rowHeight]);

  const tbodyRef = useCallback(
    (node: HTMLTableSectionElement | null) => {
      tbodyNodeRef.current = node;
      if (node) measure();
    },
    [measure]
  );

  useLayoutEffect(() => {
    measure();
    if (!enabled) return;
    const el = tbodyNodeRef.current;
    const scroller = acharScrollParent(el);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [enabled, measure]);

  const start = enabled ? Math.min(range.start, Math.max(0, count - 1)) : 0;
  const end = enabled ? Math.min(count, Math.max(range.end, start + 1)) : count;
  const noFim = !enabled || end >= count;

  return {
    tbodyRef,
    start,
    end,
    topPad: enabled ? start * rowHeight : 0,
    bottomPad: enabled && !noFim && !semPadFim ? (count - end) * rowHeight : 0,
  };
}
