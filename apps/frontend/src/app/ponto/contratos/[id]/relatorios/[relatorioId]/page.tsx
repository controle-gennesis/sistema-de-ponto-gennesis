'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  Plus,
  Upload,
  ImagePlus,
  X,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import toast from 'react-hot-toast';
import api from '@/lib/api';

/* ──────────────────────────────────────────── tipos ── */
interface FotoItem {
  id: string;
  src: string | null;
  titulo: string;
  desc: string;
}

interface CamposData {
  contrato: string;
  os: string;
  unidade: string;
  tipo: string;
  solicitante: string;
  os2: string;
  lote: string;
}

interface RelatorioData {
  campos: CamposData;
  logo: string | null;
  croqui: string | null;
  localizacao: string | null;
  fotos: FotoItem[];
}

interface Contract {
  id: string;
  name: string;
  number: string;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FOTOS_POR_PAGINA = 6;

const inputFotoClasse =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ' +
  'placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500/60 ' +
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500';

export default function RelatorioFotograficoEditorPage() {
  const params = useParams();
  const router = useRouter();

  const rawId = params?.id;
  const rawRelId = params?.relatorioId;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';
  const relatorioId = typeof rawRelId === 'string' ? rawRelId : Array.isArray(rawRelId) ? rawRelId[0] ?? '' : '';

  const [campos, setCampos] = useState<CamposData>({
    contrato: 'XXXXXXXX',
    os: 'XXXXXXXXX',
    unidade: 'XXXXXXXXXX',
    tipo: 'XXXXXXXXXX',
    solicitante: 'XXXXXXX',
    os2: 'XXX',
    lote: 'XXX',
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [croqui, setCroqui] = useState<string | null>(null);
  const [localizacao, setLocalizacao] = useState<string | null>(null);
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const manualSaveRef = useRef(false);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputLoteFotosRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'relatorio-print-css';
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 0 0 18mm 0; }
        body > * { display: none !important; }
        #relatorio-print-root { display: block !important; }
        .relatorio-page-header { display: none !important; }
        .relatorio-toolbar { display: none !important; }
        .relatorio-add-foto-btn { display: none !important; }
        .relatorio-add-foto-slot { display: none !important; }
        .relatorio-foto-remover { display: none !important; }
        .relatorio-bloco-remover { display: none !important; }
        .relatorio-logo-remover { display: none !important; }
        .relatorio-capa { padding: 6mm 10mm 4mm !important; margin: 0 !important; width: 100% !important;
          print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        .relatorio-primeira-folha { width: auto !important; margin: 0 10mm !important; padding: 4mm 0 6mm !important;
          border: none !important; border-radius: 0 !important; page-break-after: always !important; }
        .relatorio-grupo-pagina { page-break-before: always !important; padding: 20mm 10mm 0 !important; }
        .relatorio-grade { gap: 4mm 4mm !important; grid-template-columns: 1fr 1fr !important; }
        .relatorio-foto-card { page-break-inside: avoid !important; border: 1px solid #bbb !important; border-radius: 0 !important; }
        .relatorio-foto-area { height: 48mm !important; aspect-ratio: unset !important; }
        .relatorio-bloco-img-area { height: 55mm !important; }
        .relatorio-placeholder { display: none !important; }
        .relatorio-numero-foto { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        input[type="file"] { display: none !important; }
        .relatorio-foto-input { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById('relatorio-print-css')?.remove();
    };
  }, []);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });
  const contract = contractData?.data as Contract | undefined;

  const { isLoading: loadingRelatorio } = useQuery({
    queryKey: ['relatorio-fotografico', contractId, relatorioId],
    queryFn: async () => {
      const res = await api.get(`/relatorios-fotograficos/${contractId}/${relatorioId}`);
      return res.data;
    },
    enabled: !!contractId && !!relatorioId,
    onSuccess: (res: { data: RelatorioData }) => {
      const d = res.data;
      if (d.campos) setCampos(d.campos);
      setLogo(d.logo ?? null);
      setCroqui(d.croqui ?? null);
      setLocalizacao(d.localizacao ?? null);
      setFotos(d.fotos ?? []);
    },
  } as Parameters<typeof useQuery>[0]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data: RelatorioData = { campos, logo, croqui, localizacao, fotos };
      await api.put(`/relatorios-fotograficos/${contractId}/${relatorioId}`, { data });
    },
    onSuccess: () => {
      setDirty(false);
      if (manualSaveRef.current) {
        toast.success('Relatório salvo!');
        manualSaveRef.current = false;
      }
    },
    onError: () => {
      toast.error('Erro ao salvar.');
      manualSaveRef.current = false;
    },
  });

  const runSave = useCallback(
    (opts?: { manual?: boolean }) => {
      if (opts?.manual) manualSaveRef.current = true;
      saveMutation.mutate();
    },
    [saveMutation]
  );

  const handleSave = useCallback(() => {
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
    runSave({ manual: true });
  }, [runSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  const AUTOSAVE_MS = 1400;
  useEffect(() => {
    if (!contractId || !relatorioId || loadingRelatorio || !dirty) return;
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(() => {
      autoSaveDebounceRef.current = null;
      runSave();
    }, AUTOSAVE_MS);
    return () => {
      if (autoSaveDebounceRef.current) {
        clearTimeout(autoSaveDebounceRef.current);
        autoSaveDebounceRef.current = null;
      }
    };
  }, [campos, logo, croqui, localizacao, fotos, dirty, loadingRelatorio, contractId, relatorioId, runSave]);

  const mark = () => setDirty(true);

  const setCampo = (key: keyof CamposData, val: string) => {
    setCampos((prev) => ({ ...prev, [key]: val }));
    mark();
  };

  const adicionarFoto = () => {
    setFotos((prev) => [...prev, { id: uid(), src: null, titulo: '', desc: '' }]);
    mark();
  };

  const removerFoto = (id: string) => {
    setFotos((prev) => prev.filter((f) => f.id !== id));
    mark();
  };

  const setFotoSrc = async (id: string, file: File) => {
    const src = await fileToBase64(file);
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, src } : f)));
    mark();
  };

  const clearFotoSrc = (id: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, src: null } : f)));
    mark();
  };

  const setFotoTitulo = (id: string, titulo: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, titulo } : f)));
    mark();
  };

  const setFotoDesc = (id: string, desc: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, desc } : f)));
    mark();
  };

  const handleLoteFotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const novas: FotoItem[] = await Promise.all(
      arr.map(async (file) => ({
        id: uid(),
        src: await fileToBase64(file),
        titulo: '',
        desc: '',
      }))
    );
    setFotos((prev) => [...prev, ...novas]);
    mark();
  };

  const handleImgChange = async (file: File | undefined, setter: (v: string | null) => void) => {
    if (!file) return;
    const src = await fileToBase64(file);
    setter(src);
    mark();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (!contractId || !relatorioId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const gruposPagina: FotoItem[][] = [];
  if (!loadingRelatorio) {
    for (let i = 0; i < fotos.length; i += FOTOS_POR_PAGINA) {
      gruposPagina.push(fotos.slice(i, i + FOTOS_POR_PAGINA));
    }
  }
  const gruposRender: { fotos: FotoItem[]; showAddSlot: boolean }[] = gruposPagina.map((grupo) => ({
    fotos: grupo,
    showAddSlot: false,
  }));
  if (gruposRender.length === 0) {
    gruposRender.push({ fotos: [], showAddSlot: true });
  } else if (fotos.length % FOTOS_POR_PAGINA === 0) {
    gruposRender.push({ fotos: [], showAddSlot: true });
  } else {
    gruposRender[gruposRender.length - 1].showAddSlot = true;
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <div className="w-full min-w-0 max-w-[100%] space-y-6 pb-8">
            {/* Cabeçalho: mesmo padrão de OrcamentoPageView (sem ícone, só título + subtítulo) */}
            <div className="relatorio-page-header relative flex min-h-[3.25rem] items-center justify-center py-1">
              <Link
                href={`/ponto/contratos/${contractId}/relatorios`}
                aria-label="Voltar à lista de relatórios"
                className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Voltar
              </Link>
              <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
                  {loadingContract ? 'Carregando contrato…' : contract?.name || 'Relatórios'}
                </h1>
                <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 line-clamp-2 break-words">
                  Relatórios Fotográficos
                </p>
              </div>
            </div>

            {loadingRelatorio ? (
              <Loading message="Carregando relatório…" size="lg" />
            ) : (
              <>
            {/* Toolbar — bloco separado do documento abaixo */}
            <Card padding="none" className="relatorio-toolbar w-full shadow-sm">
              <CardHeader className="p-4 sm:p-5 border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Editor de relatório</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relatorio-add-foto-btn inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                      <Upload className="h-4 w-4 shrink-0" />
                      Fotos em lote
                      <input ref={inputLoteFotosRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleLoteFotos(e.target.files)} />
                    </label>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      title="Gera PDF pela caixa de impressão do navegador"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      Exportar
                    </button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Documento (preview + impressão) — capa em card próprio, separada da barra e do bloco de croqui */}
            <div
              id="relatorio-print-root"
              className="space-y-4 sm:space-y-5 print:space-y-0"
            >
              {/* Croqui + Localização */}
              <Card className="relatorio-primeira-folha w-full rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm print:shadow-none print:max-w-none print:rounded-none">
                <CardContent className="p-4 sm:p-6 sm:pt-5 space-y-6">
                  {(
                    [
                      {
                        titulo: 'CROQUI DA UNIDADE',
                        src: croqui,
                        setter: setCroqui,
                        placeholder: 'Clique para adicionar o croqui da unidade',
                      },
                      {
                        titulo: 'LOCALIZAÇÃO',
                        src: localizacao,
                        setter: setLocalizacao,
                        placeholder: 'Clique para adicionar a imagem de localização',
                      },
                    ] as const
                  ).map(({ titulo, src, setter, placeholder }, idx) => (
                    <div key={titulo} className={idx > 0 ? 'pt-2' : ''}>
                      <div
                        className="rounded-t-md border border-b-0 border-gray-200 dark:border-gray-600
                          bg-gray-100 dark:bg-gray-700/80 py-1.5 px-2 text-center text-[11px] font-bold uppercase
                          tracking-wide text-gray-800 dark:text-gray-100"
                      >
                        {titulo}
                      </div>
                      <div
                        className={`relatorio-bloco-img-area relative border border-gray-200 dark:border-gray-600
                          rounded-b-md min-h-[200px] sm:min-h-[220px] lg:h-[270px] flex items-center justify-center
                          overflow-hidden ${
                            src
                              ? 'bg-white dark:bg-gray-900'
                              : 'bg-gray-50 dark:bg-gray-900/40 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/60'
                          } transition-colors`}
                      >
                        {src ? (
                          <>
                            <img
                              src={src}
                              alt={titulo}
                              className="max-w-full max-h-full object-contain"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setter(null);
                                mark();
                              }}
                              className="relatorio-bloco-remover absolute top-1.5 right-1.5 w-6 h-6 rounded-full
                                bg-red-600/90 text-white text-xs flex items-center justify-center
                                hover:bg-red-700 shadow"
                              title="Remover"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <label className="relatorio-placeholder flex flex-col items-center justify-center gap-2 w-full h-full min-h-[200px] cursor-pointer p-4 text-center">
                            <ImagePlus
                              className="w-10 h-10 text-gray-400 dark:text-gray-500"
                              strokeWidth={1.2}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{placeholder}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden relatorio-foto-input"
                              onChange={(e) => handleImgChange(e.target.files?.[0], setter)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Grade de fotos */}
              {gruposRender.map((grupoRender, gi) => (
                <div
                  key={gi}
                  className="relatorio-grupo-pagina w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 print:shadow-none print:rounded-none"
                >
                  {/* Faixa título — edge-to-edge, sem padding extra, igual CROQUI DA UNIDADE */}
                  <div className="py-2 text-center font-bold uppercase tracking-widest text-white bg-red-600 dark:bg-red-700">
                    Registro Fotográfico
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="relatorio-grade grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {grupoRender.fotos.map((foto, fi) => {
                        const numGlobal = gi * FOTOS_POR_PAGINA + fi + 1;
                        return (
                          <div
                            key={foto.id}
                            className="relatorio-foto-card flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800 shadow-sm print:shadow-none"
                          >
                            {/* Cabeçalho do card: número da foto centralizado + X para remover */}
                            <div className="relatorio-numero-foto flex items-center border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/80 px-2 py-1.5
                              [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
                              <div className="flex-1" />
                              <span className="text-[11px] font-bold tracking-widest uppercase text-gray-800 dark:text-gray-100">
                                Foto {String(numGlobal).padStart(2, '0')}
                              </span>
                              <div className="flex flex-1 justify-end">
                                <button
                                  type="button"
                                  onClick={() => removerFoto(foto.id)}
                                  className="relatorio-foto-remover flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                  title="Remover foto do relatório"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Área da imagem */}
                            <div
                              className={`relatorio-foto-area relative w-full aspect-video flex items-center justify-center overflow-hidden ${
                                foto.src
                                  ? 'bg-white dark:bg-gray-900'
                                  : 'bg-gray-50 dark:bg-gray-900/40 cursor-pointer'
                              }`}
                            >
                              {foto.src ? (
                                <>
                                  <img
                                    src={foto.src}
                                    alt={`Foto ${numGlobal}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => clearFotoSrc(foto.id)}
                                    className="relatorio-foto-remover absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                                    title="Trocar imagem"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                  <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 flex items-center justify-center bg-black/10 transition-opacity" title="Clique para trocar a imagem">
                                    <input type="file" accept="image/*" className="hidden relatorio-foto-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFotoSrc(foto.id, f); }} />
                                  </label>
                                </>
                              ) : (
                                <label
                                  className="relatorio-placeholder flex flex-col items-center justify-center gap-2 w-full h-full min-h-[140px] cursor-pointer text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 transition-colors"
                                >
                                  <ImagePlus className="w-9 h-9" strokeWidth={1.3} />
                                  <span className="text-xs">Clique para adicionar</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden relatorio-foto-input"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) setFotoSrc(foto.id, f);
                                    }}
                                  />
                                </label>
                              )}
                            </div>

                            {/* Inputs de título e descrição */}
                            <div className="p-2.5 space-y-2 border-t border-gray-100 dark:border-gray-700">
                              <input
                                type="text"
                                placeholder="Título da foto..."
                                value={foto.titulo}
                                onChange={(e) => setFotoTitulo(foto.id, e.target.value)}
                                className={inputFotoClasse}
                              />
                              <textarea
                                placeholder="Descrição da imagem..."
                                value={foto.desc}
                                onChange={(e) => setFotoDesc(foto.id, e.target.value)}
                                rows={2}
                                className={inputFotoClasse + ' resize-none'}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {grupoRender.showAddSlot && (
                        <button
                          type="button"
                          onClick={adicionarFoto}
                          className={
                            'relatorio-add-foto-slot flex w-full flex-col items-center justify-center gap-2 self-stretch rounded-lg border-2 border-dashed border-gray-300 ' +
                            'bg-gray-50 dark:bg-gray-900/40 py-10 text-sm font-medium text-gray-500 transition-colors ' +
                            'hover:border-red-400/80 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-red-700 ' +
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 ' +
                            'dark:border-gray-500 dark:text-gray-400 dark:hover:border-red-400/55 dark:hover:bg-red-900/15 dark:hover:text-red-400 ' +
                            'min-h-[22rem] h-full ' +
                            (grupoRender.fotos.length === 0 ? 'sm:col-span-2 ' : '')
                          }
                        >
                          <Plus className="h-8 w-8 shrink-0" />
                          Adicionar foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
              </>
            )}
          </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
