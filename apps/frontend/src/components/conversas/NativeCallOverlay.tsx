'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, Minimize2, Maximize2, MessageSquare, Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeCallHook } from '@/hooks/useNativeWebRTCCall';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import api from '@/lib/api';

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
    isScreenSharing,
    activeChatId,
    callDurationSec,
    callQuality,
    callLatencyMs,
    packetLossPct,
    wsConnectionState,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMic,
    toggleCam,
    toggleScreenShare
  } = call;

  const localPipRef = useRef<HTMLVideoElement>(null);
  const localMainRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remotePipRef = useRef<HTMLVideoElement>(null);
  const dragStateRef = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });
  const [primaryView, setPrimaryView] = useState<'remote' | 'local'>('remote');
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCallChatOpen, setIsCallChatOpen] = useState(false);
  const [callMessage, setCallMessage] = useState('');
  const queryClient = useQueryClient();

  const remoteHasLiveVideo = useMemo(() => {
    if (!remoteStream) return false;
    return remoteStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  }, [remoteStream]);

  const showRemoteVideo = callIsVideo && remoteHasLiveVideo;

  useEffect(() => {
    [localPipRef.current, localMainRef.current].forEach((el) => {
      if (!el) return;
      el.srcObject = localStream;
      void el.play().catch(() => {});
    });
  }, [localStream]);

  useEffect(() => {
    [remoteRef.current, remotePipRef.current].forEach((el) => {
      if (!el) return;
      el.srcObject = remoteStream;
      void el.play().catch(() => {});
    });
  }, [remoteStream]);

  useEffect(() => {
    if (phase === 'idle') {
      setPrimaryView('remote');
      setPipPos(null);
      setIsMinimized(false);
      setIsCallChatOpen(false);
      setCallMessage('');
    }
  }, [phase]);

  useEffect(() => {
    if (primaryView === 'local' && (!localStream || !callIsVideo)) {
      setPrimaryView('remote');
    }
  }, [primaryView, localStream, callIsVideo]);

  if (typeof document === 'undefined') return null;

  const showMain = phase === 'calling' || phase === 'connected';
  const showIncoming = phase === 'ringing' && incoming;

  if (!showMain && !showIncoming) return null;

  const peerLabel = peerName || incoming?.from.name || 'Contato';
  const peerPhoto = peerAvatarUrl ?? null;
  const peerSeed = incoming?.from.id || peerLabel;
  const localLabel = localDisplayName || 'Você';
  const showLocalAsMain = primaryView === 'local' && callIsVideo && !!localStream;
  const canUseCallChat = !!activeChatId && phase === 'connected';

  const { data: callChatData } = useQuery({
    queryKey: ['native-call-chat', activeChatId],
    queryFn: async () => {
      if (!activeChatId) return null;
      const res = await api.get(`/chats/direct/${activeChatId}`);
      return res.data?.data ?? null;
    },
    enabled: canUseCallChat,
    refetchInterval: canUseCallChat ? 3000 : false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!activeChatId || !callMessage.trim()) return;
      const fd = new FormData();
      fd.append('chatId', activeChatId);
      fd.append('content', callMessage.trim());
      await api.post('/chats/direct/messages', fd);
    },
    onSuccess: async () => {
      setCallMessage('');
      await queryClient.invalidateQueries({ queryKey: ['native-call-chat', activeChatId] });
      await queryClient.invalidateQueries({ queryKey: ['directChat', activeChatId] });
      await queryClient.invalidateQueries({ queryKey: ['directChats'] });
    }
  });

  const callMessages = useMemo(() => {
    const raw = (callChatData?.messages ?? []) as Array<{ id: string; content?: string; senderId?: string }>;
    return raw.filter((m) => !!m?.content?.trim()).slice(-30);
  }, [callChatData]);

  const durationLabel = useMemo(() => {
    const mm = Math.floor(callDurationSec / 60).toString().padStart(2, '0');
    const ss = (callDurationSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [callDurationSec]);

  const qualityLabel =
    callQuality === 'good' ? 'Boa' : callQuality === 'medium' ? 'Média' : callQuality === 'poor' ? 'Ruim' : 'Sem dados';
  const qualityColor =
    callQuality === 'good'
      ? 'bg-emerald-600/85'
      : callQuality === 'medium'
        ? 'bg-amber-600/85'
        : callQuality === 'poor'
          ? 'bg-red-600/85'
          : 'bg-slate-700/85';

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!callIsVideo) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const rect = target.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top
    };
    if (!pipPos) {
      setPipPos({ x: rect.left, y: rect.top });
    }
  };

  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const pipWidth = event.currentTarget.offsetWidth;
    const pipHeight = event.currentTarget.offsetHeight;
    const x = Math.min(Math.max(8, event.clientX - dragStateRef.current.dx), window.innerWidth - pipWidth - 8);
    const y = Math.min(Math.max(8, event.clientY - dragStateRef.current.dy), window.innerHeight - pipHeight - 96);
    setPipPos({ x, y });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (showMain && isMinimized) {
    return createPortal(
      <div className="fixed bottom-4 right-4 z-[210] w-[min(90vw,340px)] rounded-2xl border border-white/20 bg-gray-900/95 p-3 text-white shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CallAvatar name={peerLabel} photoUrl={peerPhoto} seed={peerSeed} sizeClass="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{peerLabel}</p>
              <p className="text-xs text-white/60">{phase === 'connected' ? `Em chamada - ${durationLabel}` : 'Conectando...'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="rounded-md bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Abrir chamada"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={toggleMic} className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label={micMuted ? 'Ligar microfone' : 'Silenciar'}>
            {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          {callIsVideo && (
            <button type="button" onClick={toggleCam} className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label={camOff ? 'Ligar câmera' : 'Desligar câmera'}>
              {camOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
          )}
          <button type="button" onClick={endCall} className="flex size-11 items-center justify-center rounded-full bg-red-600 hover:bg-red-700" aria-label="Encerrar chamada">
            <PhoneOff size={20} />
          </button>
        </div>
      </div>,
      document.body
    );
  }

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
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {phase === 'connected' && (
                <>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${qualityColor}`}>
                    Qualidade: {qualityLabel}
                  </span>
                  <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold">
                    {durationLabel}
                  </span>
                </>
              )}
              {canUseCallChat && (
                <button
                  type="button"
                  onClick={() => setIsCallChatOpen((v) => !v)}
                  className={`rounded-md p-2 ${isCallChatOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-black/50 hover:bg-black/65'}`}
                  aria-label="Abrir chat da ligação"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              )}
              <span className="rounded-md bg-black/50 px-2 py-1 text-[10px] font-semibold text-white/80">
                {wsConnectionState === 'connected'
                  ? 'Sinalização online'
                  : wsConnectionState === 'reconnecting'
                    ? 'Reconectando...'
                    : 'Sinalização offline'}
              </span>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="rounded-md bg-black/50 p-2 hover:bg-black/65"
                aria-label="Minimizar chamada"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
            {phase === 'calling' && (
              <p className="pointer-events-none absolute left-0 right-0 top-4 z-20 text-center text-sm text-white/80">
                {peerLabel ? `Chamando ${peerLabel}…` : 'Conectando…'}
              </p>
            )}
            {phase === 'connected' && (
              <p className="pointer-events-none absolute left-0 right-0 top-11 z-20 text-center text-xs text-white/70">
                RTT {callLatencyMs !== null ? `${Math.round(callLatencyMs)}ms` : '--'} | Perda {packetLossPct !== null ? `${packetLossPct.toFixed(1)}%` : '--'}
              </p>
            )}

            {/* Áudio continua saindo do &lt;video&gt; mesmo quando mostramos avatar (vídeo invisível). */}
            {showLocalAsMain ? (
              <video
                ref={localMainRef}
                playsInline
                autoPlay
                muted
                className="absolute inset-0 z-0 h-full w-full object-cover"
              />
            ) : (
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
            )}

            {((!showRemoteVideo && !showLocalAsMain) || (showLocalAsMain && camOff)) && (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-4 pt-16">
                <CallAvatar
                  name={showLocalAsMain ? localLabel : peerLabel}
                  photoUrl={showLocalAsMain ? localAvatarUrl : peerPhoto}
                  seed={showLocalAsMain ? localLabel : peerSeed}
                  sizeClass="h-36 w-36 text-4xl sm:h-44 sm:w-44 sm:text-5xl"
                  ringClass="ring-4 ring-white/15"
                />
                <div className="text-center">
                  <p className="text-xl font-semibold sm:text-2xl">{showLocalAsMain ? localLabel : peerLabel}</p>
                  {!callIsVideo && <p className="mt-1 text-sm text-white/55">Chamada de voz</p>}
                  {!showLocalAsMain && callIsVideo && !remoteStream && (
                    <p className="mt-1 text-sm text-white/55">{phase === 'calling' ? 'Aguardando…' : 'Sem vídeo do outro participante'}</p>
                  )}
                  {!showLocalAsMain && callIsVideo && remoteStream && !remoteHasLiveVideo && (
                    <p className="mt-1 text-sm text-white/55">Câmera desligada no outro lado</p>
                  )}
                  {showLocalAsMain && camOff && (
                    <p className="mt-1 text-sm text-white/55">Sua câmera está desligada</p>
                  )}
                </div>
              </div>
            )}

            {callIsVideo && localStream && localStream.getVideoTracks().length > 0 && (
              <div
                className="absolute z-20 h-28 w-40 cursor-grab touch-none overflow-hidden rounded-xl border border-white/25 bg-black shadow-2xl active:cursor-grabbing sm:h-36 sm:w-52"
                style={pipPos ? { left: pipPos.x, top: pipPos.y } : { right: 16, bottom: 96 }}
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
              >
                {showLocalAsMain ? (
                  <>
                    <video ref={remotePipRef} playsInline autoPlay className="h-full w-full object-cover" />
                    {!showRemoteVideo && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-800/95 px-2 text-center text-xs text-white/90">
                        <CallAvatar name={peerLabel} photoUrl={peerPhoto} seed={peerSeed} sizeClass="h-12 w-12 text-sm" />
                        Câmera do contato desligada
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <video ref={localPipRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                    {camOff && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-800/95 px-2 text-center text-xs text-white/90">
                        <CallAvatar name={localLabel} photoUrl={localAvatarUrl} seed={localLabel} sizeClass="h-12 w-12 text-sm" />
                        Câmera desligada
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPrimaryView((v) => (v === 'remote' ? 'local' : 'remote'))}
                  className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 hover:bg-black/75"
                  aria-label={showLocalAsMain ? 'Voltar foco para contato' : 'Focar na sua câmera'}
                >
                  {showLocalAsMain ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
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
            {isCallChatOpen && (
              <div className="absolute bottom-24 right-4 top-16 z-30 flex w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-black/75 backdrop-blur-md">
                <div className="border-b border-white/15 px-3 py-2 text-sm font-semibold">Chat da ligação</div>
                <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {callMessages.length === 0 ? (
                    <p className="text-xs text-white/60">Sem mensagens nessa conversa ainda.</p>
                  ) : (
                    callMessages.map((m) => (
                      <div key={m.id} className="rounded-lg bg-white/10 px-2 py-1.5 text-xs">
                        {m.content}
                      </div>
                    ))
                  )}
                </div>
                <form
                  className="flex items-center gap-2 border-t border-white/15 p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!callMessage.trim() || sendMessageMutation.isPending) return;
                    sendMessageMutation.mutate();
                  }}
                >
                  <input
                    value={callMessage}
                    onChange={(e) => setCallMessage(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="h-9 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/30"
                  />
                  <button
                    type="submit"
                    disabled={!callMessage.trim() || sendMessageMutation.isPending}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50"
                    aria-label="Enviar mensagem"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
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
            {callIsVideo && (
              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                className={`flex size-12 items-center justify-center rounded-full ${
                  isScreenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white/10 hover:bg-white/20'
                }`}
                aria-label={isScreenSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
              >
                <MonitorUp size={22} />
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
