'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, MapPin, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

export type TeamGeoPhoto = {
  url: string;
  name: string;
  key?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
  address?: string | null;
};

type GeoFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

function formatDateTime(date: Date) {
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function osmEmbedUrl(lat: number, lng: number) {
  const delta = 0.0035;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, body] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

async function stampPhoto(
  dataUrl: string,
  info: {
    title: string;
    capturedAt: Date;
    latitude: number;
    longitude: number;
    address?: string | null;
  }
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível processar a foto'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a foto');

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pad = Math.max(16, Math.round(canvas.width * 0.025));
  const lineHeight = Math.max(22, Math.round(canvas.width * 0.028));
  const titleSize = Math.max(20, Math.round(canvas.width * 0.032));
  const bodySize = Math.max(16, Math.round(canvas.width * 0.024));
  ctx.font = `${bodySize}px sans-serif`;
  const lines = [
    formatDateTime(info.capturedAt),
    formatCoords(info.latitude, info.longitude),
    ...(info.address ? wrapCanvasText(ctx, info.address, canvas.width - pad * 2) : []),
  ];
  const barHeight = pad * 2 + titleSize + lineHeight * lines.length + 8;

  const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.25, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText(info.title, pad, canvas.height - barHeight + pad);
  ctx.font = `${bodySize}px sans-serif`;
  lines.forEach((line, index) => {
    ctx.fillText(line, pad, canvas.height - barHeight + pad + titleSize + 10 + index * lineHeight);
  });

  return canvas.toDataURL('image/jpeg', 0.9);
}

function getFreshPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este navegador não informa localização'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}

async function resolveAddress(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`,
      { signal: controller.signal }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      locality?: string;
      city?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    const parts = [data.locality || data.city, data.principalSubdivision, data.countryName].filter(
      (part, index, all) => part && all.indexOf(part) === index
    );
    return parts.length ? parts.join(', ') : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // ignore
    }
  });
}

export function TeamLivePhotoCapture({
  value,
  onChange,
  disabled = false,
  onPreview,
  title = 'Foto da equipe',
  stampTitle = 'Foto da equipe',
  emptyButtonLabel = 'Tirar foto da equipe',
  replaceButtonLabel = 'Tirar de novo',
  fileNamePrefix = 'equipe',
  hint = 'Só pela câmera, no momento. Galeria não vale. A foto grava data, hora e o local do GPS.',
  showEmptyButton = true,
}: {
  value: TeamGeoPhoto | null;
  onChange: (value: TeamGeoPhoto | null) => void;
  disabled?: boolean;
  onPreview: (url?: string | null, alt?: string) => void;
  title?: string;
  stampTitle?: string;
  emptyButtonLabel?: string;
  replaceButtonLabel?: string;
  fileNamePrefix?: string;
  hint?: string;
  /** Quando false, só abre a câmera via openCamera externo / botão pai. */
  showEmptyButton?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastFixRef = useRef<GeoFix | null>(null);

  const [open, setOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [capturing, setCapturing] = useState(false);

  const closeCamera = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOpen(false);
    setCameraReady(false);
    setCameraError(null);
    setCapturing(false);
  }, []);

  useEffect(() => () => closeCamera(), [closeCamera]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este navegador não abre a câmera. Use Chrome, Edge ou Safari.');
      return;
    }

    const strategies: MediaStreamConstraints[] = [
      {
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      },
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      { audio: false, video: true },
    ];

    let started: MediaStream | null = null;
    let lastError: unknown;
    for (const constraints of strategies) {
      try {
        started = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!started) {
      const err = lastError as { name?: string };
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError('Permita o acesso à câmera para fotografar.');
      } else if (err?.name === 'NotFoundError') {
        setCameraError('Nenhuma câmera encontrada neste aparelho.');
      } else {
        setCameraError('Não foi possível abrir a câmera. Feche outros apps que estejam usando ela.');
      }
      return;
    }

    stopStream(streamRef.current);
    streamRef.current = started;
    const video = videoRef.current;
    if (!video) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    const readyVideo = videoRef.current;
    if (!readyVideo) {
      stopStream(started);
      setCameraError('Câmera não ficou pronta. Tente de novo.');
      return;
    }
    readyVideo.srcObject = started;
    readyVideo.muted = true;
    readyVideo.playsInline = true;
    try {
      await readyVideo.play();
    } catch {
      // Safari às vezes precisa do clique inicial; o botão já foi o gesto.
    }
    setCameraReady(true);
  }, []);

  const startGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastFixRef.current = null;
    setFix(null);
    setAddress(null);
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Este navegador não informa localização. Ative o GPS e tente de novo.');
      return;
    }
    const applyFix = (position: GeolocationPosition) => {
      const next: GeoFix = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        timestamp: position.timestamp || Date.now(),
      };
      lastFixRef.current = next;
      setFix(next);
      setGeoError(null);
      void resolveAddress(next.latitude, next.longitude).then((resolved) => {
        if (lastFixRef.current?.timestamp === next.timestamp) setAddress(resolved);
      });
    };
    navigator.geolocation.getCurrentPosition(applyFix, (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        setGeoError('Permita o acesso à localização. Sem GPS a foto não é aceita.');
      } else {
        setGeoError('Não foi possível obter a localização. Ative o GPS e tente de novo.');
      }
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
    watchIdRef.current = navigator.geolocation.watchPosition(
      applyFix,
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startGps();
    void startCamera().then(() => {
      if (!cancelled) return;
      stopStream(streamRef.current);
      streamRef.current = null;
    });
    return () => {
      cancelled = true;
    };
  }, [open, startCamera, startGps]);

  const openCamera = () => {
    if (disabled) return;
    setNow(new Date());
    setOpen(true);
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || capturing) return;
    if (video.videoWidth < 8 || video.videoHeight < 8) {
      toast.error('A câmera ainda não está pronta');
      return;
    }

    setCapturing(true);
    try {
      let position: GeoFix | null = null;
      try {
        const fresh = await getFreshPosition();
        position = {
          latitude: fresh.coords.latitude,
          longitude: fresh.coords.longitude,
          accuracy: Number.isFinite(fresh.coords.accuracy) ? fresh.coords.accuracy : null,
          timestamp: Date.now(),
        };
      } catch {
        const last = lastFixRef.current;
        if (last && Date.now() - last.timestamp < 20000) position = last;
      }
      if (!position) {
        toast.error('Não deu para gravar a localização neste instante. Ative o GPS e tire de novo.');
        return;
      }

      const capturedAt = new Date();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível capturar a foto');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const raw = canvas.toDataURL('image/jpeg', 0.92);
      const resolvedAddress =
        address && lastFixRef.current && Date.now() - lastFixRef.current.timestamp < 25000
          ? address
          : await resolveAddress(position.latitude, position.longitude);
      const stamped = await stampPhoto(raw, {
        title: stampTitle,
        capturedAt,
        latitude: position.latitude,
        longitude: position.longitude,
        address: resolvedAddress,
      });
      const fileName = `${fileNamePrefix}-${capturedAt.toISOString().replace(/[:.]/g, '-')}.jpg`;
      const file = dataUrlToFile(stamped, fileName);
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/empreiteiros/upload-file', data);
      const uploaded = res.data?.data as { url?: string; name?: string; key?: string } | undefined;
      if (!uploaded?.url) throw new Error('Falha no upload');
      onChange({
        url: uploaded.url,
        name: uploaded.name || fileName,
        key: uploaded.key,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        capturedAt: capturedAt.toISOString(),
        address: resolvedAddress,
      });
      closeCamera();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : 'Não foi possível tirar a foto');
      toast.error(message);
    } finally {
      setCapturing(false);
    }
  };

  const href = value ? resolveApiMediaUrl(value.url) || value.url : '';

  return (
    <div className="space-y-2">
      {hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
      {value ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => onPreview(value.url, title)}
            className="block w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={href} alt={title} className="max-h-56 w-full object-cover" />
          </button>
          <div className="space-y-2 p-3">
            <p className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
              <span>
                {value.address || 'Local da captura'}
                <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
                  {formatCoords(value.latitude, value.longitude)}
                  {' · '}
                  {formatDateTime(new Date(value.capturedAt))}
                </span>
              </span>
            </p>
            <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
              <iframe
                title={`Local da ${title.toLowerCase()}`}
                src={osmEmbedUrl(value.latitude, value.longitude)}
                className="h-36 w-full border-0"
                loading="lazy"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={mapsUrl(value.latitude, value.longitude)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-red-700 hover:underline dark:text-red-300"
              >
                Abrir no mapa
              </a>
              {!disabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => openCamera()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline dark:text-gray-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {replaceButtonLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400"
                  >
                    Remover
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : showEmptyButton ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => openCamera()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-red-400 hover:bg-red-50/40 hover:text-red-600 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-red-950/20"
        >
          <Camera className="h-6 w-6" />
          <span className="text-sm font-medium">{emptyButtonLabel}</span>
        </button>
      ) : null}

      {open ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeCamera} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl bg-gray-950 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <p className="text-sm font-semibold">{title}</p>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg p-1.5 hover:bg-white/10"
                aria-label="Fechar câmera"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[3/4] w-full object-cover sm:aspect-video"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
                <p className="text-sm font-medium">{formatDateTime(now)}</p>
                {fix ? (
                  <p className="mt-0.5 text-xs text-white/90">
                    {formatCoords(fix.latitude, fix.longitude)}
                    {fix.accuracy != null ? ` · ±${Math.round(fix.accuracy)} m` : ''}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-200">
                    {geoError || 'Obtendo localização...'}
                  </p>
                )}
                {address ? <p className="mt-0.5 line-clamp-2 text-xs text-white/80">{address}</p> : null}
              </div>
              {!cameraReady && !cameraError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
                  Abrindo câmera...
                </div>
              ) : null}
            </div>
            {cameraError ? (
              <p className="px-4 pt-3 text-sm text-red-300">{cameraError}</p>
            ) : null}
            {geoError && !fix ? (
              <p className="px-4 pt-3 text-sm text-amber-200">{geoError}</p>
            ) : null}
            <div className="flex gap-2 p-4">
              <button
                type="button"
                disabled={!cameraReady || capturing || !fix}
                onClick={() => void capture()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {capturing ? 'Gravando...' : 'Capturar agora'}
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg bg-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        </AppModalOverlay>
      ) : null}
    </div>
  );
}

/** Várias fotos ao vivo com data, hora e GPS (mesmo fluxo da foto da equipe). */
export function LiveGeoPhotosField({
  values,
  onChange,
  disabled = false,
  onPreview,
  title = 'Foto do serviço',
  stampTitle = 'Foto do serviço',
  emptyButtonLabel = 'Tirar foto do serviço',
  fileNamePrefix = 'servico',
}: {
  values: TeamGeoPhoto[];
  onChange: (values: TeamGeoPhoto[]) => void;
  disabled?: boolean;
  onPreview: (url?: string | null, alt?: string) => void;
  title?: string;
  stampTitle?: string;
  emptyButtonLabel?: string;
  fileNamePrefix?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Só pela câmera, no momento. Galeria não vale. Cada foto grava data, hora e o local do GPS.
      </p>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((photo, index) => {
            const href = resolveApiMediaUrl(photo.url) || photo.url;
            return (
              <div
                key={`${photo.url}-${index}`}
                className="w-[7.5rem] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <button
                  type="button"
                  onClick={() => onPreview(photo.url, `${title} ${index + 1}`)}
                  className="block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={href} alt="" className="h-20 w-full object-cover" />
                </button>
                <div className="space-y-1 p-1.5">
                  <p className="line-clamp-2 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                    {formatDateTime(new Date(photo.capturedAt))}
                    <span className="mt-0.5 block">
                      {photo.address || formatCoords(photo.latitude, photo.longitude)}
                    </span>
                  </p>
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => onChange(values.filter((_, i) => i !== index))}
                      className="text-[10px] font-medium text-gray-500 hover:text-red-600 dark:text-gray-400"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {!disabled ? (
        <TeamLivePhotoCapture
          value={null}
          onChange={(photo) => {
            if (photo) onChange([...values, photo]);
          }}
          disabled={disabled}
          onPreview={onPreview}
          title={title}
          stampTitle={stampTitle}
          emptyButtonLabel={emptyButtonLabel}
          fileNamePrefix={fileNamePrefix}
          hint=""
        />
      ) : null}
    </div>
  );
}
