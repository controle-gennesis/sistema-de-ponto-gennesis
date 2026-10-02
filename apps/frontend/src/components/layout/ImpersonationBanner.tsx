'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/lib/auth';

const POS_STORAGE_KEY = 'impersonationBannerPos';
const DRAG_THRESHOLD_PX = 4;

type BannerPos = { x: number; y: number };

function defaultPos(): BannerPos {
  if (typeof window === 'undefined') return { x: 16, y: 72 };
  const width = Math.min(720, window.innerWidth - 32);
  return {
    x: Math.max(16, Math.round((window.innerWidth - width) / 2)),
    y: 72,
  };
}

function readStoredPos(): BannerPos | null {
  try {
    const raw = sessionStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BannerPos>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function clampPos(pos: BannerPos, el: HTMLElement | null): BannerPos {
  if (typeof window === 'undefined') return pos;
  const w = el?.offsetWidth ?? 320;
  const h = el?.offsetHeight ?? 64;
  const maxX = Math.max(8, window.innerWidth - w - 8);
  const maxY = Math.max(8, window.innerHeight - h - 8);
  return {
    x: Math.min(maxX, Math.max(8, pos.x)),
    y: Math.min(maxY, Math.max(8, pos.y)),
  };
}

export function ImpersonationBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [targetName, setTargetName] = useState('outro usuário');
  const [pos, setPos] = useState<BannerPos>(() => defaultPos());
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = readStoredPos();
    setPos(clampPos(stored ?? defaultPos(), panelRef.current));
  }, []);

  useEffect(() => {
    const sync = () => {
      setActive(authService.isImpersonating());
      setTargetName(authService.getImpersonationTargetName() || 'outro usuário');
    };
    sync();
    window.addEventListener('impersonation-changed', sync);
    return () => window.removeEventListener('impersonation-changed', sync);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      setPos((prev) => clampPos(prev, panelRef.current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active]);

  const handleStop = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const returnTo = authService.getImpersonationReturnPath() || '/ponto/funcionarios';
      await authService.stopImpersonation();
      await queryClient.clear();
      toast.success('Você voltou à sua conta de administrador');
      router.replace(returnTo);
      router.refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao encerrar impersonação';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, queryClient, router]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;

    setPos(clampPos({ x: drag.originX + dx, y: drag.originY + dy }, panelRef.current));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    setPos((prev) => {
      const next = clampPos(prev, panelRef.current);
      try {
        sessionStorage.setItem(POS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (!active || !mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="status"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ left: pos.x, top: pos.y }}
      className={`fixed z-[1200] flex w-[min(42rem,calc(100vw-2rem))] touch-none select-none items-center justify-between gap-3 rounded-lg border border-amber-300/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-3.5 py-2.5 shadow-[0_8px_24px_-12px_rgba(180,83,9,0.45)] dark:border-amber-500/30 dark:from-amber-950/80 dark:via-orange-950/70 dark:to-amber-950/80 ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm shadow-amber-600/30">
          <ShieldAlert className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
            Conta de {targetName}
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
            Você está navegando com a visão e as permissões desta pessoa.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleStop()}
        disabled={busy}
        aria-label={busy ? 'Voltando à sua conta' : 'Sair da conta'}
        title={busy ? 'Voltando…' : 'Sair da conta'}
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-amber-800 transition hover:bg-amber-200/60 hover:text-amber-950 disabled:opacity-60 dark:text-amber-100 dark:hover:bg-amber-900/50 dark:hover:text-amber-50"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>,
    document.body
  );
}
