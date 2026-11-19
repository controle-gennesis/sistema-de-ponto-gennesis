'use client';

import React from 'react';

/** Intervalo entre o início da animação de uma barra e a seguinte (ms). */
export const BAR_STAGGER_MS = 110;
/** Duração do crescimento de cada barra e da subida do valor (ms). */
export const BAR_GROW_MS = 850;

/** Quem configurou o computador para reduzir movimento não vê animações. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Número que sobe (ou desce) suavemente até o valor novo.
 * Na primeira vez começa em zero; quando o valor muda (ex.: trocou o filtro), parte do que já estava na tela.
 */
export function useAnimatedNumber(target: number, delayMs = 0, durationMs = BAR_GROW_MS): number {
  const [shown, setShown] = React.useState(0);
  const shownRef = React.useRef(0);
  React.useEffect(() => {
    if (prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, Math.max(0, (now - start - delayMs) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delayMs, durationMs]);
  return shown;
}

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  fill?: string;
  payload?: Record<string, unknown>;
};

/** Barra horizontal que cresce da esquerda para a direita, uma depois da outra (CSS em globals.css). */
export function growingBarShape(valueKey: string) {
  return function GrowingBar(props: unknown) {
    const p = props as BarShapeProps;
    const x = Number(p.x ?? 0);
    const y = Number(p.y ?? 0);
    const width = Math.max(0, Number(p.width ?? 0));
    const height = Math.max(0, Number(p.height ?? 0));
    const index = Number(p.index ?? 0);
    const radius = Math.min(6, height / 2, width);
    const value = String(p.payload?.[valueKey] ?? width);
    return (
      <g
        key={`${index}-${value}`}
        className="chart-bar-grow"
        style={{ animationDelay: `${index * BAR_STAGGER_MS}ms`, animationDuration: `${BAR_GROW_MS}ms` }}
      >
        <path
          d={`M${x},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height - radius} Q${x + width},${y + height} ${x + width - radius},${y + height} H${x} Z`}
          fill={p.fill}
        />
      </g>
    );
  };
}

/** Coluna vertical que cresce de baixo para cima, uma depois da outra. `topRadius` 0 = canto reto (segmentos de pilha). */
export function growingColumnShape(valueKey: string, topRadius = 6) {
  return function GrowingColumn(props: unknown) {
    const p = props as BarShapeProps;
    const x = Number(p.x ?? 0);
    const y = Number(p.y ?? 0);
    const width = Math.max(0, Number(p.width ?? 0));
    const height = Math.max(0, Number(p.height ?? 0));
    const index = Number(p.index ?? 0);
    if (width <= 0 || height <= 0) return <g />;
    const radius = Math.min(topRadius, width / 2, height);
    const value = String(p.payload?.[valueKey] ?? height);
    return (
      <g
        key={`${index}-${value}`}
        className="chart-col-grow"
        style={{ animationDelay: `${index * BAR_STAGGER_MS}ms`, animationDuration: `${BAR_GROW_MS}ms` }}
      >
        <path
          d={`M${x},${y + height} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height} Z`}
          fill={p.fill}
        />
      </g>
    );
  };
}

export type ChartLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string | null;
  index?: number;
};

/** Valor ao lado de uma barra horizontal que sobe de zero até o total, no mesmo ritmo da barra. */
export function CountUpLabel({
  x,
  y,
  width,
  height,
  value,
  index = 0,
  color,
  format,
}: ChartLabelProps & { color: string; format: (v: number) => string }) {
  const shown = useAnimatedNumber(Number(value ?? 0), index * BAR_STAGGER_MS, BAR_GROW_MS);
  const left = Number(x ?? 0) + Number(width ?? 0) + 6;
  const middle = Number(y ?? 0) + Number(height ?? 0) / 2;
  return (
    <text x={left} y={middle} dy={4} fill={color} fontSize={11}>
      {format(shown)}
    </text>
  );
}

/** Valor em cima de uma coluna: aparece suavemente quando a coluna termina de crescer. */
export function FadeInTopLabel({
  x,
  y,
  width,
  value,
  index = 0,
  color,
  fontSize = 11,
  format,
}: ChartLabelProps & { color: string; fontSize?: number; format: (v: number) => string }) {
  const v = Number(value ?? 0);
  if (!(v > 0)) return null;
  const cx = Number(x ?? 0) + Number(width ?? 0) / 2;
  const top = Number(y ?? 0) - 6;
  return (
    <text
      className="chart-fade-in"
      style={{ animationDelay: `${index * BAR_STAGGER_MS + 450}ms` }}
      x={cx}
      y={top}
      textAnchor="middle"
      fill={color}
      fontSize={fontSize}
    >
      {format(v)}
    </text>
  );
}

/** Estilo para a linha de tabela aparecer em sequência (classe `chart-row-in`). */
export function rowInStyle(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 14) * 40}ms` };
}
