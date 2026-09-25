'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const LIMITE_JANELA = 80;

function acharScrollParent(el: HTMLElement | null): HTMLElement | Window {
  const page = el?.closest?.('.app-page-scroll');
  if (page instanceof HTMLElement) return page;

  let node = el?.parentElement ?? null;
  while (node) {
    // overflow-x:auto vira overflow-y:auto no CSS — não é o scroll da página.
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
  const rowHeightHint = opts.rowHeight ?? 44;
  const overscan = opts.overscan ?? 24;
  const enabled = (opts.enabled ?? true) && count > LIMITE_JANELA;
  const tbodyNodeRef = useRef<HTMLTableSectionElement | null>(null);
  const rangeRef = useRef({ start: 0, end: Math.min(count, LIMITE_JANELA + overscan) });
  const rowHRef = useRef(rowHeightHint);
  const [range, setRange] = useState(rangeRef.current);

  const applyRange = useCallback((next: { start: number; end: number }) => {
    const prev = rangeRef.current;
    if (prev.start === next.start && prev.end === next.end) return;
    rangeRef.current = next;
    setRange(next);
  }, []);

  const measure = useCallback(() => {
    if (!enabled) {
      applyRange({ start: 0, end: count });
      return;
    }
    const el = tbodyNodeRef.current;
    if (!el) return;

    const scroller = acharScrollParent(el);
    const { top: viewTop, height: viewH } = viewMetrics(scroller);
    const rowH = Math.max(28, rowHRef.current);
    const visible = Math.ceil(viewH / rowH) + overscan * 2;
    const thead = el.previousElementSibling;
    const stickyH =
      thead instanceof HTMLElement ? thead.getBoundingClientRect().height : 0;
    const anchorTop = viewTop + stickyH;
    const viewBottom = viewTop + viewH;

    const nearScrollerEnd = (() => {
      if (scroller === window) {
        const top = window.scrollY || document.documentElement.scrollTop;
        return top + window.innerHeight >= document.documentElement.scrollHeight - 160;
      }
      const box = scroller as HTMLElement;
      return box.scrollTop + box.clientHeight >= box.scrollHeight - 160;
    })();
    if (nearScrollerEnd) {
      applyRange({ start: Math.max(0, count - visible), end: count });
      return;
    }

    const tbodyTop = el.getBoundingClientRect().top;
    if (tbodyTop >= anchorTop - 4) {
      applyRange({ start: 0, end: Math.min(count, Math.max(visible, LIMITE_JANELA)) });
      return;
    }

    const dataRows = el.querySelectorAll('tr:not([aria-hidden])');
    const firstRow = dataRows[0] as HTMLElement | undefined;
    const lastRow = dataRows[dataRows.length - 1] as HTMLElement | undefined;
    if (lastRow && lastRow.getBoundingClientRect().bottom < viewBottom - 32) {
      applyRange({ start: Math.max(0, count - visible), end: count });
      return;
    }

    let rawStart: number;
    if (firstRow) {
      const measured = firstRow.getBoundingClientRect().height;
      if (measured > 16 && measured < 120) {
        rowHRef.current = rowHRef.current * 0.7 + measured * 0.3;
      }
      const idx = rangeRef.current.start;
      const rowTop = firstRow.getBoundingClientRect().top;
      const shift = Math.round((anchorTop - rowTop) / Math.max(28, rowHRef.current));
      rawStart = idx + shift;
    } else {
      rawStart = Math.floor((anchorTop - tbodyTop) / rowH);
    }

    const start = Math.max(0, Math.min(count - 1, rawStart - overscan));
    const end = Math.min(count, Math.max(start + 1, start + visible));
    applyRange({ start, end });
  }, [applyRange, count, enabled, overscan]);

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

  const start = enabled ? range.start : 0;
  const end = enabled ? Math.max(range.end, start + 1) : count;
  const rowH = Math.max(28, rowHRef.current);

  return {
    tbodyRef,
    start,
    end,
    topPad: enabled ? start * rowH : 0,
    bottomPad: enabled ? Math.max(0, (count - end) * rowH) : 0,
  };
}
