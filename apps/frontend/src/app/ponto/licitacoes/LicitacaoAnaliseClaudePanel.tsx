'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowRight, ChevronDown, ExternalLink, FileText, Loader2, Search, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

const RECOMENDACOES_CLAUDE = ['Participar', 'Avaliar com cuidado', 'Não participar'];

const STATUS_ARQUIVO = [
  { value: 'declinada', label: 'Declinada' },
  { value: 'suspensa', label: 'Suspensa' },
  { value: 'encerrada', label: 'Encerrada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'vencidas', label: 'Vencida' },
];

export type AnaliseClaudeData = {
  nome?: string | null;
  url?: string | null;
  enviadoEm?: string | null;
  enviadoPorNome?: string | null;
  recomendacao?: string | null;
  rejeicaoMotivo?: string | null;
  linkClaude?: string | null;
  analise?: string | null;
};

type Processo = {
  id: string;
  titulo: string;
  tituloExibicao?: string | null;
  orgao: string | null;
  objeto: string | null;
  valorEstimado: string | null;
  estado?: string | null;
  createdAt?: string;
  arquivada?: boolean;
  analiseEtapa?: string | null;
  analiseJson?: {
    emArquivo?: boolean;
    linkPastaDrive?: string | null;
    analiseClaude?: AnaliseClaudeData | null;
    origemRegiao?: { aceitePorNome?: string | null; rowSnapshot?: Record<string, unknown> | null } | null;
  } | null;
};

/** Data de abertura vinda da linha da planilha (coluna ABERTURA). */
function abertura(item: Processo): { label: string; time: number | null } {
  const snapshot = item.analiseJson?.origemRegiao?.rowSnapshot ?? {};
  const entry = Object.entries(snapshot).find(([key]) => key.trim().toUpperCase() === 'ABERTURA');
  const label = String(entry?.[1] ?? '').trim();
  const br = label.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const iso = label.match(/(\d{4})-(\d{2})-(\d{2})/);
  let time: number | null = null;
  if (br) {
    const year = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    time = new Date(year, Number(br[2]) - 1, Number(br[1])).getTime();
  } else if (iso) {
    time = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }
  return { label, time };
}

function apiMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export function LicitacaoAnaliseClaudePanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  /** Processo com a janela "Arquivar" aberta. */
  const [arquivando, setArquivando] = useState<Processo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [statusArquivo, setStatusArquivo] = useState('declinada');
  const fileRef = useRef<HTMLInputElement>(null);
  /** Processo aberto (link, recomendação e PDF); um por vez, para não baixar vários PDFs. */
  const [abertoId, setAbertoId] = useState<string | null>(null);
  /** Prévia ocultada pela pessoa, por processo. */
  const [previas, setPrevias] = useState<Record<string, boolean>>({});
  const uploadTargetRef = useRef<string | null>(null);

  const { data: processos = [], isLoading, isError } = useQuery({
    queryKey: ['licitacoes', 'claude'],
    queryFn: async () => {
      const res = await api.get('/licitacoes', { params: { arquivada: 'false', analiseEtapa: 'claude' } });
      return (res.data?.data ?? []) as Processo[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return processos
      .filter((p) => p.analiseEtapa === 'claude' && !p.arquivada && p.analiseJson?.emArquivo !== true)
      .filter(
        (p) =>
          !term ||
          [p.orgao, p.objeto, p.tituloExibicao, p.titulo].some((v) => v?.toLowerCase().includes(term)),
      )
      .map((p) => ({ ...p, abertura: abertura(p) }))
      // Abertura mais próxima primeiro; sem data no fim.
      .sort((a, b) => (a.abertura.time ?? Infinity) - (b.abertura.time ?? Infinity));
  }, [processos, search]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['licitacoes'] });

  const uploadMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const body = new FormData();
      body.append('file', file);
      await api.post(`/licitacoes/${id}/analise-claude`, body, { timeout: 120_000 });
    },
    onSuccess: (_data, { id }) => {
      setPrevias((prev) => ({ ...prev, [id]: true }));
      toast.success('PDF da análise anexado.');
      void refresh();
    },
    onError: (err) => toast.error(apiMessage(err, 'Não foi possível anexar o PDF.')),
  });

  const dadosMutation = useMutation({
    mutationFn: async ({
      id,
      ...dados
    }: {
      id: string;
      recomendacao?: string | null;
      linkClaude?: string;
      linkPastaDrive?: string;
      analise?: string;
    }) => {
      await api.patch(`/licitacoes/${id}/analise-claude`, dados);
    },
    onSuccess: () => void refresh(),
    onError: (err) => toast.error(apiMessage(err, 'Não foi possível salvar.')),
  });

  /** Salva o link ao sair do campo (como os links da Análise Preliminar). */
  const salvarLink = (
    id: string,
    input: HTMLInputElement,
    atual: string,
    campo: 'linkClaude' | 'linkPastaDrive' = 'linkClaude',
  ) => {
    let link = input.value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    input.value = link;
    if (link !== atual) dadosMutation.mutate({ id, [campo]: link });
  };

  const avancarMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/licitacoes/${id}/analise-etapa`, { etapa: 'preliminar' });
    },
    onSuccess: () => {
      toast.success('Enviada para a aba Análise Preliminar.');
      void refresh();
    },
    onError: (err) => toast.error(apiMessage(err, 'Não foi possível passar para a Análise Preliminar.')),
  });

  const arquivarMutation = useMutation({
    mutationFn: async ({ id, texto, status }: { id: string; texto: string; status: string }) => {
      await api.post(`/licitacoes/${id}/analise-claude/rejeitar`, { motivo: texto, status });
    },
    onSuccess: () => {
      toast.success('Enviada para o Arquivo.');
      setArquivando(null);
      setMotivo('');
      void refresh();
    },
    onError: (err) => toast.error(apiMessage(err, 'Não foi possível arquivar.')),
  });

  const pickFile = (id: string) => {
    uploadTargetRef.current = id;
    fileRef.current?.click();
  };

  const today = new Date().setHours(0, 0, 0, 0);
  const semPdf = list.filter((p) => !p.analiseJson?.analiseClaude?.url).length;

  return (
    <div className="space-y-5">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = uploadTargetRef.current;
          e.target.value = '';
          if (!file || !id) return;
          if (!/\.pdf$/i.test(file.name)) {
            toast.error('Envie o arquivo em PDF.');
            return;
          }
          if (file.size > 15 * 1024 * 1024) {
            toast.error('Arquivo muito grande. Máximo: 15 MB.');
            return;
          }
          uploadMutation.mutate({ id, file });
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {list.length} processo(s) · {semPdf} aguardando PDF
        </p>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar órgão ou objeto"
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-6 w-6 animate-spin text-red-600" />
        </div>
      ) : isError ? (
        <p className="py-14 text-center text-sm text-red-600">Não foi possível carregar os processos.</p>
      ) : list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-gray-500">
            {search.trim()
              ? 'Nenhum resultado.'
              : 'Nenhum processo aguardando. Eles chegam aqui ao dar o aceite em Por Região.'}
          </CardContent>
        </Card>
      ) : (
        list.map((p) => {
          const analise = p.analiseJson?.analiseClaude;
          const pdfUrl = resolveApiMediaUrl(analise?.url ?? null);
          const link = analise?.linkClaude ?? '';
          const linkDrive = p.analiseJson?.linkPastaDrive ?? '';
          const textoAnalise = analise?.analise ?? '';
          const passou = p.abertura.time != null && p.abertura.time < today;
          const aberto = abertoId === p.id;
          const previaAberta = previas[p.id] ?? true;
          // Só vale uma das opções da lista.
          const recomendacao = RECOMENDACOES_CLAUDE.includes(analise?.recomendacao ?? '')
            ? (analise?.recomendacao ?? '')
            : '';
          const faltando = [!link && 'o link', !recomendacao && 'a recomendação', !pdfUrl && 'o PDF'].filter(
            (item): item is string => !!item,
          );
          const avisoFaltando = faltando.length
            ? `Falta ${faltando.join(', ').replace(/, ([^,]*)$/, ' e $1')} para passar para a Preliminar.`
            : '';
          const faltaArquivar = [!link && 'o link', !pdfUrl && 'o PDF'].filter(Boolean).join(' e ');
          const enviando = uploadMutation.isPending && uploadMutation.variables?.id === p.id;
          const meta = [
            p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : null,
            p.analiseJson?.origemRegiao?.aceitePorNome,
            p.estado,
          ].filter(Boolean);
          return (
            <section key={p.id} className="space-y-3">
              <Card padding="none" className="shadow-sm">
                <CardContent className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={aberto}
                    onClick={() => setAbertoId(aberto ? null : p.id)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      setAbertoId(aberto ? null : p.id);
                    }}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ChevronDown
                        className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', !aberto && '-rotate-90')}
                        aria-hidden
                      />
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {p.tituloExibicao || p.orgao || p.titulo}
                      </h3>
                      <span
                        className={clsx(
                          'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                          pdfUrl
                            ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
                        )}
                      >
                        {pdfUrl ? 'PDF recebido' : 'Aguardando PDF'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {meta.join(' · ')}
                      {p.abertura.label ? (
                        <span className={clsx(passou && 'font-medium text-red-600 dark:text-red-400')}>
                          {meta.length ? ' · ' : ''}Abertura {p.abertura.label}
                          {passou ? ' (já passou)' : ''}
                        </span>
                      ) : null}
                    </p>
                    {p.objeto ? (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300" title={p.objeto}>
                        {p.objeto}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {aberto ? (
                <>
              <Card padding="none" className="shadow-sm">
                <CardContent className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Link da análise na Claude
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        key={link}
                        type="url"
                        defaultValue={link}
                        placeholder="https://claude.ai/..."
                        aria-label="Link da análise na Claude"
                        onBlur={(e) => salvarLink(p.id, e.currentTarget, link)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        className="h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                      {/^https?:\/\//i.test(link) ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir o link da Claude"
                          title="Abrir o link"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:text-red-600 dark:border-gray-600 dark:text-gray-300"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Segue para as próximas fases.</p>

                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">Recomendação</p>
                    <select
                      value={recomendacao}
                      disabled={dadosMutation.isPending}
                      aria-label="Recomendação da análise"
                      onChange={(e) => dadosMutation.mutate({ id: p.id, recomendacao: e.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    >
                      <option value="">Selecione a recomendação</option>
                      {RECOMENDACOES_CLAUDE.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {opcao}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">PDF da análise</p>
                    <div className="mt-1 flex min-h-10 flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => pickFile(p.id)}
                        className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {pdfUrl ? 'Trocar PDF' : 'Anexar PDF'}
                      </button>
                      {pdfUrl ? (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate">{analise?.nome || 'Ver PDF'}</span>
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {pdfUrl && analise?.enviadoPorNome
                        ? `Enviado por ${analise.enviadoPorNome}.`
                        : 'Somente PDF, até 15 MB.'}
                    </p>

                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Link da pasta no Drive
                    </p>
                    <input
                      key={linkDrive}
                      type="url"
                      defaultValue={linkDrive}
                      placeholder="https://drive.google.com/..."
                      aria-label="Link da pasta no Drive"
                      onBlur={(e) => salvarLink(p.id, e.currentTarget, linkDrive, 'linkPastaDrive')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <p className="mt-1 text-xs text-gray-500">Segue para as próximas fases.</p>
                  </div>

                  <div className="lg:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Análise</p>
                    <textarea
                      key={textoAnalise}
                      defaultValue={textoAnalise}
                      rows={7}
                      maxLength={20000}
                      aria-label="Análise"
                      placeholder="Escreva a análise..."
                      onBlur={(e) => {
                        const texto = e.currentTarget.value.trim();
                        if (texto !== textoAnalise) dadosMutation.mutate({ id: p.id, analise: texto });
                      }}
                      className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card padding="none" className="shadow-sm">
                <CardContent className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={faltando.length > 0 || avancarMutation.isPending || dadosMutation.isPending}
                      title={avisoFaltando || undefined}
                      onClick={() => {
                        if (window.confirm('Passar para a Análise Preliminar?')) {
                          avancarMutation.mutate(p.id);
                        }
                      }}
                      className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Passar para Preliminar <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!!faltaArquivar || dadosMutation.isPending}
                      title={
                        faltaArquivar
                          ? `Falta ${faltaArquivar} para arquivar`
                          : 'Vai para a aba Arquivo e não segue no processo'
                      }
                      onClick={() => {
                        setMotivo('');
                        setStatusArquivo(passou ? 'vencidas' : 'declinada');
                        setArquivando(p);
                      }}
                      className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Archive className="h-4 w-4" /> Arquivar
                    </button>
                  </div>
                  {avisoFaltando ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {avisoFaltando}
                      {faltaArquivar ? ` Para arquivar, falta ${faltaArquivar}.` : ''}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              {pdfUrl ? (
                <Card padding="none" className="overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between gap-3 px-5 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pré-visualização</p>
                    <button
                      type="button"
                      onClick={() => setPrevias((prev) => ({ ...prev, [p.id]: !previaAberta }))}
                      className="text-sm font-medium text-gray-500 hover:text-red-600 dark:text-gray-400"
                    >
                      {previaAberta ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  {previaAberta ? (
                    <iframe
                      src={pdfUrl}
                      title={`Análise Claude de ${p.orgao || p.titulo}`}
                      loading="lazy"
                      className="h-[75vh] w-full border-t border-gray-200 bg-white dark:border-gray-700"
                    />
                  ) : null}
                </Card>
              ) : null}
                </>
              ) : null}
            </section>
          );
        })
      )}

      {arquivando ? (
        <Modal isOpen onClose={() => setArquivando(null)} title="Arquivar licitação" size="sm" confirmBeforeClose={false}>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {arquivando.orgao || arquivando.titulo} vai para a aba Arquivo e não segue no processo.
          </p>
          <label className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Status
            <select
              value={statusArquivo}
              onChange={(e) => setStatusArquivo(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              {STATUS_ARQUIVO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Motivo (opcional)
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setArquivando(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={arquivarMutation.isPending}
              onClick={() =>
                arquivarMutation.mutate({ id: arquivando.id, texto: motivo.trim(), status: statusArquivo })
              }
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Arquivar
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
