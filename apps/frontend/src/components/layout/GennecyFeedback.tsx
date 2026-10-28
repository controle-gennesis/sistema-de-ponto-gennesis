'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Send, Star, X } from 'lucide-react';
import api from '@/lib/api';

/** Expressões da Gennecy: public/gennecy/<nome>.png */
const EXPRESSOES = [
  'ai', 'apagada', 'apaixonada', 'beijinho', 'brava', 'chorando', 'desconfiada', 'empolgada',
  'entediada', 'feliz', 'maluca', 'nervosa', 'pensando', 'piscando', 'rindo', 'sapeca',
  'sonolenta', 'surpresa', 'timida', 'triste',
] as const;
type Expressao = (typeof EXPRESSOES)[number];

const expressaoSrc = (e: Expressao) => `/gennecy/${e}.png`;

/** Reação da Gennecy conforme a nota que a pessoa está escolhendo. */
const RATING_EXPRESSAO: Record<number, Expressao> = {
  1: 'chorando',
  2: 'triste',
  3: 'desconfiada',
  4: 'feliz',
  5: 'empolgada',
};

/** Se a pessoa demora sem mexer em nada, ela vai mudando de cara (segundos parado → expressão). */
const IDLE_EXPRESSOES: { apos: number; expressao: Expressao }[] = [
  { apos: 45, expressao: 'apagada' },
  { apos: 30, expressao: 'sonolenta' },
  { apos: 18, expressao: 'entediada' },
  { apos: 9, expressao: 'desconfiada' },
];

/** Pequenas "gracinhas" aleatórias enquanto a pessoa lê. */
const BRINCADEIRAS: Expressao[] = ['piscando', 'sapeca', 'timida', 'beijinho', 'rindo', 'surpresa', 'empolgada'];

type Stage = 'hidden' | 'avatar' | 'open' | 'leaving';
type Step = 'intro' | 'rating' | 'likes' | 'comment' | 'thanks';

const STEPS: Step[] = ['intro', 'rating', 'likes', 'comment', 'thanks'];

const RATING_REACTION: Record<number, string> = {
  1: 'Poxa, vou querer saber o que houve 😕',
  2: 'Dá para melhorar, vou anotar 📝',
  3: 'Mais ou menos, vamos evoluir 🙂',
  4: 'Que bom! Fico feliz 😊',
  5: 'Uhul! Você me deixou muito feliz 🥰',
};

const LIKE_OPTIONS = [
  'Facilidade de uso',
  'Velocidade',
  'Visual',
  'Funcionalidades',
  'Relatórios',
  'Aprovações',
  'A Gennecy 💜',
];

/** Frases que a Gennecy "digita" em cada etapa. */
const SPEECH: Record<Step, string> = {
  intro: 'Oi! Eu sou a Gennecy! Posso te fazer 3 perguntinhas rápidas sobre o sistema? Leva menos de 1 minuto!',
  rating: 'Primeiro: de 1 a 5 estrelas, o que você está achando do sistema?',
  likes: 'Legal! E o que você mais curte por aqui? Pode marcar mais de um.',
  comment: 'Última! Quer me contar o que eu posso melhorar? (se não quiser, é só pular)',
  thanks: 'Muito obrigada pela sua opinião! 💜 Ela vai me ajudar a ficar cada vez melhor.',
};

/** Tempo até a Gennecy aparecer depois de abrir o sistema, para não atrapalhar quem acabou de chegar. */
const SHOW_DELAY_MS = 6000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Escreve o texto letra por letra; devolve o trecho já "digitado" e se terminou. */
function useTypewriter(text: string, active: boolean, speed = 24) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }
    if (prefersReducedMotion()) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return { shown: text.slice(0, count), done: count >= text.length };
}

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 70 + (i % 3) * 22;
  return {
    emoji: ['💜', '✨', '⭐', '💖'][i % 4],
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist) - 30,
    delay: (i % 5) * 60,
  };
});

/**
 * A Gennecy pula para dentro da tela, o balão sai da cabeça dela e ela "digita" uma pergunta de
 * cada vez (nota, o que mais gosta, o que melhorar). Aparece uma vez e só volta depois de um tempo.
 */
export function GennecyFeedback({ userId }: { userId?: string }) {
  const pathname = usePathname();
  const [stage, setStage] = React.useState<Stage>('hidden');
  const [step, setStep] = React.useState<Step>('intro');
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [likes, setLikes] = React.useState<string[]>([]);
  const [comment, setComment] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const [parado, setParado] = React.useState(0);
  const [gracinha, setGracinha] = React.useState<Expressao | null>(null);
  const [forcada, setForcada] = React.useState<Expressao | null>(null);
  const ultimaAcao = React.useRef(Date.now());

  const mexeu = () => {
    ultimaAcao.current = Date.now();
    setParado(0);
  };

  // Deixa todas as expressões em cache para a troca ser instantânea.
  React.useEffect(() => {
    EXPRESSOES.forEach((e) => {
      const img = new Image();
      img.src = expressaoSrc(e);
    });
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const { data } = useQuery({
    queryKey: ['app-feedback-status', userId],
    enabled: !!userId,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await api.get('/app-feedback/status');
      return Boolean(res.data?.data?.show);
    },
  });

  // Roteiro: a logo entra pulando e, logo depois, o balão sai da cabeça dela.
  React.useEffect(() => {
    // `?gennecy=1` na URL força a aparição, para ver e ajustar a animação sem esperar o prazo.
    const forced =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('gennecy') === '1';
    if ((!data && !forced) || stage !== 'hidden') return;
    later(() => {
      setStage('avatar');
      later(() => setStage('open'), 1100);
    }, SHOW_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, userId]);

  const speech = useTypewriter(SPEECH[step], stage === 'open');
  const talking = stage === 'open' && !speech.done;

  const aguardando = stage === 'open' && speech.done && step !== 'thanks';

  // Conta quanto tempo a pessoa ficou sem mexer em nada.
  React.useEffect(() => {
    if (!aguardando) return;
    ultimaAcao.current = Date.now();
    setParado(0);
    const id = setInterval(() => setParado(Math.floor((Date.now() - ultimaAcao.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [aguardando, step]);

  // Enquanto a pessoa está ativa, de vez em quando a Gennecy faz uma gracinha.
  React.useEffect(() => {
    if (!aguardando || parado >= IDLE_EXPRESSOES[IDLE_EXPRESSOES.length - 1].apos) return;
    const id = setTimeout(
      () => {
        setGracinha(BRINCADEIRAS[Math.floor(Math.random() * BRINCADEIRAS.length)]);
        setTimeout(() => setGracinha(null), 1500);
      },
      4500 + Math.random() * 3000,
    );
    return () => clearTimeout(id);
  }, [aguardando, parado, gracinha]);

  const leave = () => {
    setStage('leaving');
    later(() => setStage('hidden'), 500);
  };

  const dismiss = () => {
    setForcada('triste');
    void api.post('/app-feedback/dismiss').catch(() => undefined);
    leave();
  };

  const next = () => setStep((s) => STEPS[Math.min(STEPS.indexOf(s) + 1, STEPS.length - 1)]);

  const send = async () => {
    if (!rating || sending) return;
    setSending(true);
    setError('');
    try {
      await api.post('/app-feedback', { rating, likes, comment: comment.trim(), page: pathname });
      setStep('thanks');
      later(() => setForcada('beijinho'), 2200);
      later(leave, 4200);
    } catch {
      setForcada('nervosa');
      later(() => setForcada(null), 2500);
      setError('Não consegui enviar agora. Tente de novo em instantes.');
    } finally {
      setSending(false);
    }
  };

  if (stage === 'hidden') return null;

  const shownRating = hover || rating;

  const idleExpressao = IDLE_EXPRESSOES.find((i) => parado >= i.apos)?.expressao;
  const situacao: Expressao =
    stage === 'avatar'
      ? 'surpresa'
      : step === 'thanks'
        ? 'apaixonada'
        : sending
          ? 'maluca'
          : step === 'intro'
            ? speech.done
              ? 'piscando'
              : 'feliz'
            : step === 'rating'
              ? shownRating
                ? RATING_EXPRESSAO[shownRating]
                : 'pensando'
              : step === 'likes'
                ? likes.length
                  ? 'rindo'
                  : 'pensando'
                : comment.trim()
                  ? 'feliz'
                  : 'timida';
  const expressao: Expressao = forcada ?? (idleExpressao && !hover ? idleExpressao : (gracinha ?? situacao));
  const stepIndex = STEPS.indexOf(step);
  const leaving = stage === 'leaving';
  const temBarraInferior = /^\/ponto\/(cronogramas|orcamentos?)(\/|$)/.test(pathname || '');

  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
  const ghostBtn =
    'rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200';

  return (
    <div
      className={`fixed right-4 z-[90] flex w-[min(19.5rem,calc(100vw-2rem))] flex-col items-end sm:right-6 ${
        // Cronograma e orçamento têm uma barra de botões fixa embaixo: a Gennecy sobe para não cobri-la.
        temBarraInferior ? 'bottom-[4.75rem] sm:bottom-[5.25rem]' : 'bottom-4 sm:bottom-6'
      } ${leaving ? 'gennecy-leave' : ''}`}
      onPointerMove={mexeu}
      onPointerDown={mexeu}
      onKeyDown={mexeu}
      role="dialog"
      aria-label="Avalie o sistema"
    >
      {stage !== 'avatar' ? (
        <div className="gennecy-bubble relative mb-3 w-full rounded-3xl border border-gray-200 bg-white p-3.5 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          {step !== 'thanks' ? (
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Gennecy</span>
              <button
                type="button"
                onClick={dismiss}
                className="-mr-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {step !== 'intro' && step !== 'thanks' ? (
            <div className="mb-3 flex items-center gap-1.5" aria-hidden>
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                    n <= stepIndex ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
          ) : null}

          <p className="min-h-[2.75rem] text-[13px] font-medium leading-snug text-gray-800 dark:text-gray-100">
            {speech.shown}
            {!speech.done ? <span className="gennecy-caret" aria-hidden /> : null}
          </p>

          {speech.done ? (
            <div key={step} className="gennecy-step mt-3">
              {step === 'intro' ? (
                <div className="flex items-center gap-2">
                  <button type="button" className={primaryBtn} onClick={next}>
                    Bora! <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className={ghostBtn} onClick={dismiss}>
                    Agora não
                  </button>
                </div>
              ) : null}

              {step === 'rating' ? (
                <>
                  <div
                    className="flex items-center gap-1"
                    onMouseLeave={() => setHover(0)}
                    role="radiogroup"
                    aria-label="Nota de 1 a 5"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} de 5`}
                        onMouseEnter={() => setHover(n)}
                        onClick={() => setRating(n)}
                        className="rounded-md p-0.5 transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        <Star
                          className={`h-7 w-7 transition-all duration-200 ${
                            n <= shownRating
                              ? 'gennecy-star-on fill-amber-400 text-amber-400'
                              : 'fill-transparent text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 min-h-[1.25rem] text-xs font-medium text-gray-500 dark:text-gray-400">
                    {shownRating ? RATING_REACTION[shownRating] : ''}
                  </p>
                  <div className="mt-2 flex justify-end">
                    <button type="button" className={primaryBtn} onClick={next} disabled={!rating}>
                      Próximo <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </>
              ) : null}

              {step === 'likes' ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {LIKE_OPTIONS.map((opt) => {
                      const on = likes.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            setLikes((prev) =>
                              prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                            on
                              ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-red-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {on ? <Check className="h-3 w-3" aria-hidden /> : null}
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button type="button" className={ghostBtn} onClick={next}>
                      Pular
                    </button>
                    <button type="button" className={primaryBtn} onClick={next}>
                      Próximo <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </>
              ) : null}

              {step === 'comment' ? (
                <>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    autoFocus
                    placeholder="Escreva aqui o que você acha..."
                    className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
                  <div className="mt-3 flex justify-end">
                    <button type="button" className={primaryBtn} onClick={() => void send()} disabled={sending}>
                      <Send className="h-4 w-4" aria-hidden />
                      {sending ? 'Enviando…' : comment.trim() ? 'Enviar' : 'Pular e enviar'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {/* rabinho do balão apontando para a cabeça da Gennecy */}
          <span
            aria-hidden
            className="absolute -bottom-2 right-8 h-4 w-4 rotate-45 border-b border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      ) : null}

      <div className="relative mr-1 h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]">
        <span aria-hidden className="gennecy-glow absolute inset-2 rounded-full bg-red-400/40 blur-xl" />
        <div className={`gennecy-avatar relative h-full w-full ${talking ? 'gennecy-talking' : ''}`}>
          {/* Todas as expressões ficam montadas e só trocam de opacidade: sem piscar nem sumir. */}
          {EXPRESSOES.map((e) => (
            <img
              key={e}
              src={expressaoSrc(e)}
              alt={e === expressao ? 'Gennecy' : ''}
              aria-hidden={e !== expressao}
              draggable={false}
              className={`absolute inset-0 h-full w-full select-none object-contain drop-shadow-xl transition-[opacity,transform] duration-200 ease-out ${
                e === expressao ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              }`}
            />
          ))}
        </div>
        {step === 'thanks' && stage === 'open'
          ? PARTICLES.map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="gennecy-particle pointer-events-none absolute left-1/2 top-1/2 text-lg"
                style={
                  {
                    '--dx': `${p.dx}px`,
                    '--dy': `${p.dy}px`,
                    animationDelay: `${p.delay}ms`,
                  } as React.CSSProperties
                }
              >
                {p.emoji}
              </span>
            ))
          : null}
      </div>
    </div>
  );
}
