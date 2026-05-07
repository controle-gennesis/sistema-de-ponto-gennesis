'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import type { NativeCallHook } from '@/hooks/useNativeWebRTCCall';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

const AVATAR_COLORS = [
  'bg-red-600',
  'bg-amber-600',
  'bg-emerald-600',
  'bg-cyan-600',
  'bg-indigo-600',
  'bg-violet-600',
];

function colorFromSeed(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[n];
}

function initialsFromName(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function CallAvatar({
  name,
  photoUrl,
  seed,
  sizeClass,
  ringClass = ''
}: {
  name: string;
  photoUrl?: string | null;
  seed: string;
  sizeClass: string;
  ringClass?: string;
}) {
  const resolved = resolveApiMediaUrl(photoUrl ?? null);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-lg ${sizeClass} ${ringClass} ${
        resolved ? '' : colorFromSeed(seed)
      }`}
    >
      {resolved ? (
        <img src={resolved} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initialsFromName(name || '?')
      )}
    </div>
  );
}

export function NativeCallOverlay({
  call,
  peerAvatarUrl,
  localAvatarUrl,
  localDisplayName
}: {
  call: NativeCallHook;
  peerAvatarUrl?: string | null;
  localAvatarUrl?: string | null;
  localDisplayName?: string | null;
}) {
  const {
    phase,
    incoming,
    localStream,
    remoteStream,
    micMuted,
    camOff,
    peerName,
    callIsVideo,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMic,
    toggleCam
  } = call;

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  const remoteHasLiveVideo = useMemo(() => {
    if (!remoteStream) return false;
    return remoteStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  }, [remoteStream]);

  const showRemoteVideo = callIsVideo && remoteHasLiveVideo;

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.srcObject = localStream;
    void el.play().catch(() => {});
  }, [localStream]);

  useEffect(() => {
    const el = remoteRef.current;
    if (!el) return;
    el.srcObject = remoteStream;
    void el.play().catch(() => {});
  }, [remoteStream]);

  if (typeof document === 'undefined') return null;

  const showMain = phase === 'calling' || phase === 'connected';
  const showIncoming = phase === 'ringing' && incoming;

  if (!showMain && !showIncoming) return null;

  const peerLabel = peerName || incoming?.from.name || 'Contato';
  const peerPhoto = peerAvatarUrl ?? null;
  const peerSeed = incoming?.from.id || peerLabel;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex min-h-0 flex-col bg-gray-950 text-white">
      {showIncoming && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <p className="text-lg font-semibold">Chamada recebida</p>
          <CallAvatar name={incoming!.from.name} photoUrl={peerPhoto} seed={peerSeed} sizeClass="h-28 w-28 text-3xl" ringClass="ring-4 ring-white/20" />
          <p className="text-2xl font-medium">{incoming!.from.name}</p>
          <p className="text-sm text-white/60">{incoming!.video ? 'Videochamada' : 'Somente áudio'}</p>
          <div className="mt-4 flex gap-4">
            <button
              type="button"
              onClick={() => void acceptIncoming()}
              className="rounded-full bg-green-600 px-8 py-3 font-medium hover:bg-green-700"
            >
              Atender
            </button>
            <button
              type="button"
              onClick={rejectIncoming}
              className="rounded-full bg-red-600 px-8 py-3 font-medium hover:bg-red-700"
            >
              Recusar
            </button>
          </div>
        </div>
      )}

      {showMain && (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-gray-900 to-black">
            {phase === 'calling' && (
              <p className="pointer-events-none absolute left-0 right-0 top-4 z-20 text-center text-sm text-white/80">
                {peerLabel ? `Chamando ${peerLabel}…` : 'Conectando…'}
              </p>
            )}

            {/* Áudio continua saindo do &lt;video&gt; mesmo quando mostramos avatar (vídeo invisível). */}
            <video
              ref={remoteRef}
              playsInline
              autoPlay
              className={
                showRemoteVideo
                  ? 'absolute inset-0 z-0 h-full w-full object-cover'
                  : 'pointer-events-none absolute left-0 top-0 z-0 h-px w-px opacity-0'
              }
              aria-hidden={!showRemoteVideo}
            />

            {!showRemoteVideo && (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-4 pt-16">
                <CallAvatar
                  name={peerLabel}
                  photoUrl={peerPhoto}
                  seed={peerSeed}
                  sizeClass="h-36 w-36 text-4xl sm:h-44 sm:w-44 sm:text-5xl"
                  ringClass="ring-4 ring-white/15"
                />
                <div className="text-center">
                  <p className="text-xl font-semibold sm:text-2xl">{peerLabel}</p>
                  {!callIsVideo && <p className="mt-1 text-sm text-white/55">Chamada de voz</p>}
                  {callIsVideo && !remoteStream && (
                    <p className="mt-1 text-sm text-white/55">{phase === 'calling' ? 'Aguardando…' : 'Sem vídeo do outro participante'}</p>
                  )}
                  {callIsVideo && remoteStream && !remoteHasLiveVideo && (
                    <p className="mt-1 text-sm text-white/55">Câmera desligada no outro lado</p>
                  )}
                </div>
              </div>
            )}

            {/* Pré-visualização local — vídeo: PiP acima da barra de controles; áudio: canto superior. */}
            {callIsVideo && localStream && localStream.getVideoTracks().length > 0 && (
              <div className="absolute bottom-24 right-4 z-20 h-28 w-40 overflow-hidden rounded-xl border border-white/25 bg-black shadow-2xl sm:bottom-28 sm:h-36 sm:w-52">
                <video ref={localRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                {camOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-800/95 px-2 text-center text-xs text-white/90">
                    <VideoOff className="h-6 w-6 opacity-80" />
                    Câmera desligada
                  </div>
                )}
              </div>
            )}

            {!callIsVideo && (
              <div className="absolute right-4 top-16 z-20 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/50 px-3 py-2 backdrop-blur-sm">
                <CallAvatar
                  name={localDisplayName || 'Você'}
                  photoUrl={localAvatarUrl}
                  seed={localDisplayName || 'local'}
                  sizeClass="h-11 w-11 text-sm"
                />
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-medium">{localDisplayName || 'Você'}</p>
                  <p className="text-xs text-white/55">Você</p>
                </div>
              </div>
            )}
          </div>

          <div className="relative z-40 flex shrink-0 items-center justify-center gap-4 border-t border-white/10 bg-gray-900/95 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
            <button
              type="button"
              onClick={toggleMic}
              className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label={micMuted ? 'Ligar microfone' : 'Silenciar'}
            >
              {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {callIsVideo && (
              <button
                type="button"
                onClick={toggleCam}
                disabled={!localStream || localStream.getVideoTracks().length === 0}
                className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={camOff ? 'Ligar câmera' : 'Desligar câmera'}
              >
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}
            <button
              type="button"
              onClick={endCall}
              className="flex size-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-700"
              aria-label="Encerrar chamada"
            >
              <PhoneOff size={26} />
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
