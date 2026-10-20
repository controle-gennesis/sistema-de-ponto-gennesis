'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  /** Chamado uma vez com o texto lido do QR. */
  onScan: (raw: string) => void;
  onCancel: () => void;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

/** Lê o QR da localidade com a câmera traseira (usa o BarcodeDetector do navegador). */
export const PunchQrScanner: React.FC<Props> = ({ onScan, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const Detector = (window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
    }).BarcodeDetector;

    if (!Detector) {
      setError(
        'Este navegador não lê QR Code pela câmera. Use o aplicativo do celular ou o Chrome para ler o QR da localidade.'
      );
      return;
    }

    const detector = new Detector({ formats: ['qr_code'] });

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const raw = codes.find((c) => c.rawValue)?.rawValue;
            if (raw) {
              stopped = true;
              onScan(raw);
              return;
            }
          } catch {
            // frame sem QR / vídeo ainda carregando
          }
          raf = window.setTimeout(tick, 250) as unknown as number;
        };
        void tick();
      } catch {
        setError('Não foi possível acessar a câmera. Permita o acesso e tente de novo.');
      }
    };

    void start();

    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onScan muda a cada render do pai; a leitura roda uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-56 w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-36 w-36 rounded-2xl border-2 border-white/90" />
          </div>
          <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white drop-shadow">
            Aponte para o QR da localidade
          </p>
        </div>
      )}
      <div className="flex justify-center">
        <Button onClick={onCancel} variant="outline" size="sm">
          Cancelar
        </Button>
      </div>
    </div>
  );
};
