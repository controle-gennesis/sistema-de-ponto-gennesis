'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsCallsUrl } from '@/lib/wsCallUrl';
import { toast } from 'react-hot-toast';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type NativeCallPhase = 'idle' | 'calling' | 'ringing' | 'connected';
export type CallQualityLevel = 'good' | 'medium' | 'poor' | 'unknown';

export interface IncomingCallPayload {
  callId: string;
  chatId: string;
  video: boolean;
  from: { id: string; name: string };
}

interface CallCtx {
  callId: string;
  chatId: string;
  peerUserId: string;
  peerName: string;
  video: boolean;
  isCaller: boolean;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

export function waitWsOpen(ws: WebSocket, ms: number): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms);
    ws.addEventListener(
      'open',
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        window.clearTimeout(t);
        reject(new Error('ws'));
      },
      { once: true }
    );
  });
}

export function useNativeWebRTCCall(opts: { userId: string | undefined }) {
  const [phase, setPhase] = useState<NativeCallPhase>('idle');
  const [incoming, setIncoming] = useState<IncomingCallPayload | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [peerName, setPeerName] = useState('');
  /** Modo da chamada atual (para UI: botões de câmera e layout só áudio). */
  const [callIsVideo, setCallIsVideo] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [callQuality, setCallQuality] = useState<CallQualityLevel>('unknown');
  const [callLatencyMs, setCallLatencyMs] = useState<number | null>(null);
  const [packetLossPct, setPacketLossPct] = useState<number | null>(null);
  const [wsConnectionState, setWsConnectionState] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callCtxRef = useRef<CallCtx | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<NativeCallPhase>('idle');
  phaseRef.current = phase;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const disconnectToastShownRef = useRef(false);

  const stopAllMedia = useCallback(() => {
    try {
      localMediaRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    localMediaRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    try {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMicMuted(false);
    setCamOff(false);
    setCallIsVideo(false);
    setIsScreenSharing(false);
    setCallDurationSec(0);
    setCallQuality('unknown');
    setCallLatencyMs(null);
    setPacketLossPct(null);
  }, []);

  const closePeer = useCallback(() => {
    try {
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
  }, []);

  const endCallRef = useRef<() => void>(() => {});

  const endCall = useCallback(() => {
    const ctx = callCtxRef.current;
    if (ctx && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'call:end', callId: ctx.callId }));
    }
    callCtxRef.current = null;
    closePeer();
    stopAllMedia();
    setPhase('idle');
    setIncoming(null);
    setPeerName('');
    setCallIsVideo(false);
    setActiveChatId(null);
  }, [closePeer, stopAllMedia]);

  endCallRef.current = endCall;

  useEffect(() => {
    if (phase !== 'connected') {
      setCallDurationSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setCallDurationSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'connected' || !pcRef.current) {
      setCallQuality('unknown');
      setCallLatencyMs(null);
      setPacketLossPct(null);
      return;
    }
    const pc = pcRef.current;
    const poll = window.setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let rttMs: number | null = null;
        let packetsLost = 0;
        let packetsTotal = 0;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report as any).state === 'succeeded' && (report as any).currentRoundTripTime) {
            rttMs = ((report as any).currentRoundTripTime as number) * 1000;
          }
          if (report.type === 'inbound-rtp' && !report.isRemote) {
            packetsLost += Number((report as any).packetsLost || 0);
            packetsTotal += Number((report as any).packetsReceived || 0) + Number((report as any).packetsLost || 0);
          }
        });

        const lossPct = packetsTotal > 0 ? (packetsLost / packetsTotal) * 100 : null;
        setCallLatencyMs(rttMs);
        setPacketLossPct(lossPct);

        if (rttMs === null || lossPct === null) {
          setCallQuality('unknown');
        } else if (rttMs <= 180 && lossPct <= 2) {
          setCallQuality('good');
        } else if (rttMs <= 350 && lossPct <= 6) {
          setCallQuality('medium');
        } else {
          setCallQuality('poor');
        }
      } catch {
        setCallQuality('unknown');
      }
    }, 3000);
    return () => window.clearInterval(poll);
  }, [phase, remoteStream]);

  useEffect(() => {
    if (!opts.userId) return;

    const token = getAuthToken();
    if (!token) return;
    let disposed = false;

    async function ensureCallerOffer(ctx: CallCtx, stream: MediaStream | null) {
      if (pcRef.current || !stream) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => {
        const [r] = ev.streams;
        if (r) setRemoteStream(r);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'rtc:candidate',
              callId: ctx.callId,
              candidate: ev.candidate.toJSON(),
            })
          );
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(
        JSON.stringify({
          type: 'rtc:offer',
          callId: ctx.callId,
          sdp: pc.localDescription ?? offer,
        })
      );
    }

    async function ensureCalleeAnswer(ctx: CallCtx, stream: MediaStream | null, offerSdp: RTCSessionDescriptionInit) {
      if (pcRef.current || !stream) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => {
        const [r] = ev.streams;
        if (r) setRemoteStream(r);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'rtc:candidate',
              callId: ctx.callId,
              candidate: ev.candidate.toJSON(),
            })
          );
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current?.send(
        JSON.stringify({
          type: 'rtc:answer',
          callId: ctx.callId,
          sdp: pc.localDescription ?? answer,
        })
      );
    }

    const attachWsHandlers = (ws: WebSocket) => {
      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setWsConnectionState('connected');
        disconnectToastShownRef.current = false;
      };

      ws.onmessage = async (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = msg.type as string;

        if (type === 'call:incoming') {
          if (phaseRef.current === 'connected' || callCtxRef.current) return;
          setIncoming({
            callId: msg.callId as string,
            chatId: msg.chatId as string,
            video: Boolean(msg.video),
            from: msg.from as IncomingCallPayload['from'],
          });
          setActiveChatId((msg.chatId as string) || null);
          setPhase('ringing');
          return;
        }

        if (type === 'call:accepted') {
          const callId = msg.callId as string;
          const ctx = callCtxRef.current;
          if (!ctx || !ctx.isCaller || ctx.callId !== callId) return;
          try {
            await ensureCallerOffer(ctx, localMediaRef.current);
          } catch (e) {
            console.error(e);
            toast.error('Falha ao conectar a chamada');
            endCallRef.current();
          }
          return;
        }

        if (type === 'call:busy') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Usuário já está em chamada');
          endCallRef.current();
          return;
        }

        if (type === 'call:rejected') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Chamada recusada');
          endCallRef.current();
          return;
        }

        if (type === 'call:ended') {
          const callId = msg.callId as string;
          setIncoming((cur) => {
            if (cur?.callId === callId) {
              setPhase('idle');
              setActiveChatId(null);
              toast('Chamada encerrada');
              return null;
            }
            return cur;
          });
          if (callCtxRef.current?.callId === callId) {
            toast('Chamada encerrada');
            endCallRef.current();
          }
          return;
        }

        if (type === 'rtc:offer') {
          const ctx = callCtxRef.current;
          const callId = msg.callId as string;
          if (!ctx || ctx.isCaller || ctx.callId !== callId) return;
          const sdp = msg.sdp as RTCSessionDescriptionInit;
          try {
            await ensureCalleeAnswer(ctx, localMediaRef.current, sdp);
            setPhase('connected');
          } catch (e) {
            console.error(e);
            toast.error('Erro ao conectar o vídeo');
            endCallRef.current();
          }
          return;
        }

        if (type === 'rtc:answer') {
          const ctx = callCtxRef.current;
          const callId = msg.callId as string;
          if (!ctx || !ctx.isCaller || ctx.callId !== callId) return;
          const pc = pcRef.current;
          if (!pc) return;
          const sdp = msg.sdp as RTCSessionDescriptionInit;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            setPhase('connected');
          } catch (e) {
            console.error(e);
          }
          return;
        }

        if (type === 'rtc:candidate') {
          const ctx = callCtxRef.current;
          const callId = msg.callId as string;
          if (!ctx || ctx.callId !== callId) return;
          const pc = pcRef.current;
          if (!pc || !msg.candidate) return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate as RTCIceCandidateInit));
          } catch {
            /* ignore */
          }
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        const shouldReconnect = phaseRef.current !== 'ringing' || !!callCtxRef.current;
        if (!shouldReconnect && reconnectAttemptsRef.current > 4) {
          setWsConnectionState('disconnected');
          return;
        }
        setWsConnectionState('reconnecting');
        if (!disconnectToastShownRef.current) {
          toast('Reconectando sinalização de chamada...');
          disconnectToastShownRef.current = true;
        }
        reconnectAttemptsRef.current += 1;
        const wait = Math.min(1000 * 2 ** (reconnectAttemptsRef.current - 1), 10000);
        reconnectTimerRef.current = window.setTimeout(() => {
          if (disposed) return;
          connectWs();
        }, wait);
      };
    };

    const connectWs = () => {
      const url = `${getWsCallsUrl()}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      attachWsHandlers(ws);
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      callCtxRef.current = null;
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
      try {
        localMediaRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      localMediaRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      setPhase('idle');
      setIncoming(null);
      setPeerName('');
      setCallIsVideo(false);
      setWsConnectionState('disconnected');
    };
  }, [opts.userId]);

  const startOutgoing = useCallback(
    async (chatId: string, peerUserId: string, name: string, video: boolean) => {
      if (!opts.userId) return;
      let ws = wsRef.current;
      if (ws?.readyState === WebSocket.CONNECTING) {
        try {
          await waitWsOpen(ws, 5000);
        } catch {
          toast.error('Conexão de chamadas não está pronta. Aguarde e tente de novo.');
          return;
        }
      }
      ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast.error('Conexão de chamadas não está pronta. Aguarde um instante e tente de novo.');
        return;
      }

      const callId = crypto.randomUUID();
      callCtxRef.current = {
        callId,
        chatId,
        peerUserId,
        peerName: name,
        video,
        isCaller: true,
      };
      setPeerName(name);
      setActiveChatId(chatId);
      setPhase('calling');
      setRemoteStream(null);
      closePeer();
      setCallIsVideo(video);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { facingMode: 'user' } : false,
          audio: true,
        });
        localMediaRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setCamOff(!video);
        ws.send(
          JSON.stringify({
            type: 'call:invite',
            callId,
            chatId,
            video,
            targetUserId: peerUserId,
          })
        );
      } catch (e) {
        console.error(e);
        toast.error('Não foi possível acessar microfone ou câmera');
        callCtxRef.current = null;
        setPhase('idle');
        setPeerName('');
        setCallIsVideo(false);
        stopAllMedia();
      }
    },
    [opts.userId, closePeer, stopAllMedia]
  );

  const acceptIncoming = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Conexão perdida.');
      setIncoming(null);
      setPhase('idle');
      return;
    }
    const { callId, chatId, video, from } = inc;
    callCtxRef.current = {
      callId,
      chatId,
      peerUserId: from.id,
      peerName: from.name,
      video,
      isCaller: false,
    };
    setPeerName(from.name);
    setActiveChatId(chatId);
    setIncoming(null);
    setPhase('calling');
    closePeer();
    setCallIsVideo(video);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: 'user' } : false,
        audio: true,
      });
      localMediaRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);
      setCamOff(!video);
      ws.send(JSON.stringify({ type: 'call:accept', callId }));
    } catch (e) {
      console.error(e);
      toast.error('Permissão negada');
      ws.send(JSON.stringify({ type: 'call:reject', callId }));
      callCtxRef.current = null;
      setPhase('idle');
      setPeerName('');
      setCallIsVideo(false);
      stopAllMedia();
    }
  }, [incoming, closePeer, stopAllMedia]);

  const rejectIncoming = useCallback(() => {
    if (!incoming) return;
    wsRef.current?.send(JSON.stringify({ type: 'call:reject', callId: incoming.callId }));
    setIncoming(null);
    setPhase('idle');
    setActiveChatId(null);
  }, [incoming]);

  const toggleMic = useCallback(() => {
    const s = localMediaRef.current;
    if (!s) return;
    const next = !micMuted;
    s.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
  }, [micMuted]);

  const toggleCam = useCallback(() => {
    const s = localMediaRef.current;
    if (!s) return;
    const vts = s.getVideoTracks();
    if (vts.length === 0) return;
    const next = !camOff;
    vts.forEach((t) => {
      t.enabled = !next;
    });
    setCamOff(next);
  }, [camOff]);

  const stopScreenShare = useCallback(() => {
    const pc = pcRef.current;
    const currentLocal = localMediaRef.current;
    const camTrack = cameraTrackRef.current;
    const activeScreen = screenTrackRef.current;
    if (!pc || !currentLocal || !activeScreen) return;

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender && camTrack) {
      void sender.replaceTrack(camTrack);
    }

    try {
      activeScreen.stop();
    } catch {
      /* ignore */
    }
    screenTrackRef.current = null;
    try {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null;

    currentLocal.getVideoTracks().forEach((t) => {
      if (t !== camTrack) {
        try {
          currentLocal.removeTrack(t);
        } catch {
          /* ignore */
        }
      }
    });
    if (camTrack && !currentLocal.getVideoTracks().includes(camTrack)) {
      currentLocal.addTrack(camTrack);
    }
    setLocalStream(new MediaStream(currentLocal.getTracks()));
    setIsScreenSharing(false);
    setCamOff(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!callIsVideo) return;
    const pc = pcRef.current;
    const currentLocal = localMediaRef.current;
    if (!pc || !currentLocal) return;

    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!videoSender) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const [screenTrack] = stream.getVideoTracks();
      if (!screenTrack) return;

      if (!cameraTrackRef.current) {
        cameraTrackRef.current = currentLocal.getVideoTracks()[0] ?? null;
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };

      await videoSender.replaceTrack(screenTrack);

      const camTrack = cameraTrackRef.current;
      currentLocal.getVideoTracks().forEach((t) => {
        if (t !== camTrack) {
          try {
            currentLocal.removeTrack(t);
          } catch {
            /* ignore */
          }
        }
      });
      if (camTrack) {
        try {
          currentLocal.removeTrack(camTrack);
        } catch {
          /* ignore */
        }
      }
      currentLocal.addTrack(screenTrack);
      screenStreamRef.current = stream;
      screenTrackRef.current = screenTrack;
      setLocalStream(new MediaStream(currentLocal.getTracks()));
      setIsScreenSharing(true);
      setCamOff(false);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível compartilhar a tela');
    }
  }, [callIsVideo, isScreenSharing, stopScreenShare]);

  return {
    phase,
    incoming,
    localStream,
    remoteStream,
    micMuted,
    camOff,
    peerName,
    callIsVideo,
    activeChatId,
    callDurationSec,
    callQuality,
    callLatencyMs,
    packetLossPct,
    wsConnectionState,
    startOutgoing,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    isScreenSharing,
  };
}

export type NativeCallHook = ReturnType<typeof useNativeWebRTCCall>;
