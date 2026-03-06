'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calculator,
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  Search,
  Check,
  X,
  ClipboardList,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Building2,
  FileDown
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';

// Tipos
export interface ComposicaoItem {
  codigo: string;
  banco: string;
  chave: string;
  descricao: string;
  precoUnitario: number;
}

export interface ItemServico {
  chave: string;
  codigo: string;
  banco: string;
  descricao: string;
}

export interface Subtitulo {
  id: string;
  nome: string;
  itens: ItemServico[];
}

export interface ServicoPadrao {
  id: string;
  nome: string;
  subtitulos: Subtitulo[];
}

const STORAGE_PREFIX = 'orcamento';
const STORAGE_IMPORTS = 'orcamento-imports';

function storageKey(centroCustoId: string, base: string) {
  return `${STORAGE_PREFIX}-${base}-${centroCustoId}`;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  date: string;
  tipo: 'orçamento' | 'composições';
  servicosCount?: number;
  itensCount?: number;
}

function loadComposicoes(centroCustoId: string | null): ComposicaoItem[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'composicoes'));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveComposicoes(centroCustoId: string, items: ComposicaoItem[]) {
  localStorage.setItem(storageKey(centroCustoId, 'composicoes'), JSON.stringify(items));
}

function loadServicos(centroCustoId: string | null): ServicoPadrao[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'servicos'));
    const parsed: any[] = s ? JSON.parse(s) : [];
    return parsed.map(svc => {
      if (svc.subtitulos && Array.isArray(svc.subtitulos)) return svc;
      const itens = svc.itens || [];
      return {
        ...svc,
        subtitulos: itens.length
          ? [{ id: crypto.randomUUID(), nome: svc.nome, itens }]
          : []
      };
    });
  } catch {
    return [];
  }
}

function saveServicos(centroCustoId: string, servicos: ServicoPadrao[]) {
  localStorage.setItem(storageKey(centroCustoId, 'servicos'), JSON.stringify(servicos));
}

function loadImports(centroCustoId: string | null): ImportRecord[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'imports'));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function addImport(centroCustoId: string, record: Omit<ImportRecord, 'id'>) {
  const list = loadImports(centroCustoId);
  list.unshift({
    ...record,
    id: crypto.randomUUID()
  } as ImportRecord);
  if (list.length > 20) list.pop();
  localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(list));
}

async function fetchFromApi(centroCustoId: string): Promise<{ servicos: ServicoPadrao[]; imports: ImportRecord[] } | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}`);
    const d = res.data;
    if (d && (d.servicos?.length > 0 || d.imports?.length > 0)) {
      return { servicos: d.servicos || [], imports: d.imports || [] };
    }
  } catch {
    /* ignora */
  }
  return null;
}

async function saveToApi(centroCustoId: string, data: { servicos: ServicoPadrao[]; imports: ImportRecord[] }) {
  try {
    await api.put(`/orcamento/${centroCustoId}`, data);
  } catch (err) {
    console.warn('Erro ao salvar orçamento no S3:', err);
  }
}

async function fetchComposicoesGeral(): Promise<ComposicaoItem[]> {
  try {
    const res = await api.get('/orcamento/composicoes/geral');
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

async function saveComposicoesGeralToApi(items: ComposicaoItem[]) {
  try {
    await api.put('/orcamento/composicoes/geral', { items });
  } catch (err) {
    console.warn('Erro ao salvar composições no S3:', err);
  }
}

function parsePreco(val: any): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizarChave(codigo: string, banco: string): string {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  return `${c}${b}`.replace(/\s+/g, '');
}

function chavesParaBusca(codigo: string, banco: string, chave: string): string[] {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  const k = String(chave || '').trim();
  const uniq = new Set<string>();
  if (k) uniq.add(k);
  uniq.add(normalizarChave(c, b));
  uniq.add(`${c}${b}`.replace(/[\s.]+/g, '')); // sem pontos/espaços (ex: 1680097FDE)
  uniq.add(`${c}_${b}`);
  uniq.add(`${c}-${b}`);
  return Array.from(uniq);
}

export default function OrcamentoPage() {
  const router = useRouter();
  const { costCenters, isLoading: loadingCentros } = useCostCenters();
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'composicoes' | 'servicos' | 'orcamento'>('orcamento');
  const [composicoes, setComposicoes] = useState<ComposicaoItem[]>([]);
  const [servicos, setServicos] = useState<ServicoPadrao[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchComposicao, setSearchComposicao] = useState('');
  const [subtitulosSelecionados, setSubtitulosSelecionados] = useState<Set<string>>(new Set());
  const [subtitulosNoOrcamento, setSubtitulosNoOrcamento] = useState<string[]>([]);
  const [quantidadesPorItem, setQuantidadesPorItem] = useState<Record<string, number>>({});
  const [novoServicoNome, setNovoServicoNome] = useState('');
  const [showAddServico, setShowAddServico] = useState(false);
  const [isImportandoOrcamento, setIsImportandoOrcamento] = useState(false);
  const [servicosExpandidos, setServicosExpandidos] = useState<Set<string>>(new Set());
  const [loadingFromApi, setLoadingFromApi] = useState(false);
  const [showServicosDropdown, setShowServicosDropdown] = useState(false);
  const [servicosSearch, setServicosSearch] = useState('');
  const servicosDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (costCenters?.length && !centroCustoId) {
      const first = costCenters.find((c: { id?: string }) => c.id);
      if (first?.id) setCentroCustoId(first.id);
    }
  }, [costCenters, centroCustoId]);

  useEffect(() => {
    let cancelled = false;
    fetchComposicoesGeral().then(items => {
      if (cancelled) return;
      if (items.length > 0) {
        setComposicoes(items);
      } else {
        setComposicoes([]);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!centroCustoId) return;
    let cancelled = false;
    setLoadingFromApi(true);
    fetchFromApi(centroCustoId).then(apiData => {
      if (cancelled) return;
      if (apiData && (apiData.servicos.length > 0 || apiData.imports.length > 0)) {
        setServicos(apiData.servicos);
        setImports(apiData.imports);
        saveServicos(centroCustoId, apiData.servicos);
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(apiData.imports));
        if (apiData.servicos.length > 0) {
          setServicosExpandidos(new Set([apiData.servicos[0].id]));
        }
      } else {
        const svcs = loadServicos(centroCustoId);
        setServicos(svcs);
        setImports(loadImports(centroCustoId));
        if (svcs.length > 0) setServicosExpandidos(new Set([svcs[0].id]));
      }
      setLoadingFromApi(false);
    });
    return () => { cancelled = true; setLoadingFromApi(false); };
  }, [centroCustoId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (servicosDropdownRef.current && !servicosDropdownRef.current.contains(e.target as Node)) {
        setShowServicosDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const persistToApi = (s: ServicoPadrao[], i: ImportRecord[]) => {
    if (centroCustoId) saveToApi(centroCustoId, { servicos: s, imports: i });
  };

  const apagarOrcamento = () => {
    if (!centroCustoId) return;
    if (!confirm('Tem certeza que deseja apagar todo o orçamento perfeito deste contrato? Esta ação não pode ser desfeita.')) return;
    setServicos([]);
    setImports([]);
    setSubtitulosNoOrcamento([]);
    setSubtitulosSelecionados(new Set());
    setQuantidadesPorItem({});
    saveServicos(centroCustoId, []);
    localStorage.setItem(storageKey(centroCustoId, 'imports'), '[]');
    persistToApi([], []);
    toast.success('Orçamento perfeito apagado.');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleFileUploadComposicoes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      if (rows.length < 2) {
        toast.error('Planilha vazia ou sem dados');
        return;
      }
      const header = (rows[0] || []).map((h: any) => String(h || '').toLowerCase().trim());
      const chaveIdx = header.findIndex(h => h === 'chave');
      const codigoIdx = header.findIndex(h => h.includes('código') || h.includes('codigo'));
      const bancoIdx = header.findIndex(h => h === 'banco');
      const descIdx = header.findIndex(h => h === 'descrição' || h.includes('descri'));
      const matMoIdx = header.findIndex(h =>
        (h.includes('mat') && (h.includes('m.o') || h.includes('m. o') || h.includes('mo'))) ||
        h === 'mat + m.o'
      );
      const items: ComposicaoItem[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const codigo = String(row[codigoIdx] ?? row[1] ?? '').trim();
        const banco = String(row[bancoIdx] ?? row[2] ?? '').trim();
        const chave = String(row[chaveIdx] ?? '').trim() || normalizarChave(codigo, banco);
        const descricao = String(row[descIdx] ?? row[4] ?? '').trim();
        const preco = matMoIdx >= 0 ? parsePreco(row[matMoIdx]) : parsePreco(row[6] ?? row[7]);
        if (codigo || banco || chave || descricao) {
          items.push({ codigo, banco, chave, descricao, precoUnitario: preco });
        }
      }
      setComposicoes(items);
      await saveComposicoesGeralToApi(items);
      toast.success(`${items.length} composições importadas e salvas no S3.`);
    } catch (err) {
      toast.error('Erro ao processar o arquivo. Verifique o formato.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const composicoesFiltradas = useMemo(() => {
    if (!searchComposicao.trim()) return composicoes;
    const q = searchComposicao.toLowerCase();
    return composicoes.filter(
      c =>
        c.codigo.toLowerCase().includes(q) ||
        c.banco.toLowerCase().includes(q) ||
        c.chave.toLowerCase().includes(q) ||
        c.descricao.toLowerCase().includes(q)
    );
  }, [composicoes, searchComposicao]);

  const addServico = () => {
    if (!novoServicoNome.trim()) {
      toast.error('Informe o nome do serviço');
      return;
    }
    const novo: ServicoPadrao = {
      id: crypto.randomUUID(),
      nome: novoServicoNome.trim(),
      subtitulos: [{ id: crypto.randomUUID(), nome: 'Novo subtítulo', itens: [] }]
    };
    const updated = [...servicos, novo];
    setServicos(updated);
    if (centroCustoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setNovoServicoNome('');
    setShowAddServico(false);
    toast.success('Serviço criado. Importe o orçamento perfeito para preencher a estrutura.');
  };

  const removeServico = (id: string) => {
    const updated = servicos.filter(s => s.id !== id);
    setServicos(updated);
    if (centroCustoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    const prefix = id + '|';
    setSubtitulosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setSubtitulosSelecionados(prev => new Set(Array.from(prev).filter(k => !k.startsWith(prefix))));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(prefix)) delete next[k]; });
      return next;
    });
  };

  const addItemToServico = (servicoId: string, subtituloId: string, item: ComposicaoItem) => {
    const svc = servicos.find(s => s.id === servicoId);
    const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
    if (!sub) return;
    const existe = sub.itens.some(i => i.chave === item.chave || (i.codigo === item.codigo && i.banco === item.banco));
    if (existe) {
      toast.error('Este item já está no subtítulo');
      return;
    }
    const novoItem: ItemServico = {
      chave: item.chave || normalizarChave(item.codigo, item.banco),
      codigo: item.codigo,
      banco: item.banco,
      descricao: item.descricao
    };
    const updated = servicos.map(s => {
      if (s.id !== servicoId) return s;
      return {
        ...s,
        subtitulos: s.subtitulos.map(sb =>
          sb.id === subtituloId ? { ...sb, itens: [...sb.itens, novoItem] } : sb
        )
      };
    });
    setServicos(updated);
    if (centroCustoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    toast.success('Item adicionado');
  };

  const handleImportOrcamentoPerfeito = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!centroCustoId) {
      toast.error('Selecione um contrato (centro de custo) antes de importar.');
      return;
    }
    setIsImportandoOrcamento(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      if (rows.length < 12) {
        toast.error('Planilha sem dados suficientes (cabeçalho esperado na linha 11)');
        return;
      }
      const HEADER_ROW = 10;
      const header = (rows[HEADER_ROW] || []).map((h: any) =>
        String(h || '').toLowerCase().trim().replace(/[.\s]+$/, '').replace(/^[.\s]+/, '')
      );
      const itemIdx = header.findIndex(h => h === 'item');
      const codigoIdx = header.findIndex(h => h.includes('código') || h.includes('codigo'));
      const bancoIdx = header.findIndex(h => h === 'banco');
      const descIdx = header.findIndex(h => h.includes('descri') && !h.includes('serviço') && !h.includes('servico'));

      type ServicoImport = { nome: string; subtitulos: Map<string, ItemServico[]> };
      const servicosMap = new Map<string, ServicoImport>();

      let topicoAtual = '';
      let subdivisaoAtual = '';

      for (let i = HEADER_ROW + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const itemVal = String(row[itemIdx] ?? '').trim();
        const codigo = String(row[codigoIdx] ?? '').trim();
        const banco = String(row[bancoIdx] ?? '').trim();
        const descricao = String(row[descIdx] ?? '').trim();
        const chave = normalizarChave(codigo, banco);

        const partes = itemVal ? String(itemVal).split('.').filter(Boolean) : [];
        const nivel = partes.length;

        if (descricao && !codigo && !banco) {
          if (nivel === 1) {
            topicoAtual = descricao;
            subdivisaoAtual = '';
          } else if (nivel === 2) {
            subdivisaoAtual = descricao;
          }
        }

        const ehItem = (codigo || banco) && descricao && nivel >= 2;
        if (ehItem && topicoAtual) {
          const nomeSubtitulo = subdivisaoAtual || topicoAtual;
          const item: ItemServico = { chave, codigo, banco, descricao };
          let servico = servicosMap.get(topicoAtual);
          if (!servico) {
            servico = { nome: topicoAtual, subtitulos: new Map() };
            servicosMap.set(topicoAtual, servico);
          }
          let itensSub = servico.subtitulos.get(nomeSubtitulo) || [];
          const jaExiste = itensSub.some(x => x.chave === item.chave || (x.codigo === item.codigo && x.banco === item.banco));
          if (!jaExiste) {
            itensSub = [...itensSub, item];
            servico.subtitulos.set(nomeSubtitulo, itensSub);
          }
        }
      }

      const servicosImportados: ServicoPadrao[] = Array.from(servicosMap.entries())
        .filter(([, v]) => v.subtitulos.size > 0)
        .map(([nome, v]) => ({
          id: crypto.randomUUID(),
          nome,
          subtitulos: Array.from(v.subtitulos.entries())
            .filter(([, itens]) => itens.length > 0)
            .map(([nomSub, itens]) => ({
              id: crypto.randomUUID(),
              nome: nomSub,
              itens
            }))
        }));

      if (servicosImportados.length === 0) {
        toast.error('Nenhum serviço encontrado. Verifique se o cabeçalho está na linha 11 (ITEM, CÓDIGO, BANCO, DESCRIÇÃO).');
        return;
      }

      setServicos(servicosImportados);
      saveServicos(centroCustoId, servicosImportados);
      addImport(centroCustoId, {
        fileName: file.name,
        date: new Date().toISOString(),
        tipo: 'orçamento',
        servicosCount: servicosImportados.length
      });
      setImports(loadImports(centroCustoId));
      persistToApi(servicosImportados, loadImports(centroCustoId));
      toast.success(`${servicosImportados.length} serviço(s) importados para o contrato selecionado e salvos no S3.`);
      setActiveTab('orcamento');
    } catch (err) {
      toast.error('Erro ao processar o arquivo. Verifique o formato.');
    } finally {
      setIsImportandoOrcamento(false);
      e.target.value = '';
    }
  };

  const removeItemFromServico = (servicoId: string, subtituloId: string, chave: string) => {
    const itemKey = `${servicoId}|${subtituloId}|${chave}`;
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    const updated = servicos.map(s => {
      if (s.id !== servicoId) return s;
      return {
        ...s,
        subtitulos: s.subtitulos.map(sub =>
          sub.id === subtituloId ? { ...sub, itens: sub.itens.filter(i => i.chave !== chave) } : sub
        )
      };
    });
    setServicos(updated);
    if (centroCustoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    toast.success('Item removido');
  };


  const subtitulosAdicionados = useMemo(() => {
    return subtitulosNoOrcamento
      .map(key => {
        const [servicoId, subtituloId] = key.split('|');
        const svc = servicos.find(s => s.id === servicoId);
        const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
        return sub ? { key, servicoNome: svc!.nome, subtituloNome: sub.nome, itens: sub.itens } : null;
      })
      .filter(Boolean) as { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[];
  }, [subtitulosNoOrcamento, servicos]);

  const todosSubtitulos = useMemo(() => {
    const list: { key: string; servicoNome: string; subtituloNome: string }[] = [];
    servicos.forEach(s =>
      s.subtitulos.forEach(sub =>
        list.push({ key: `${s.id}|${sub.id}`, servicoNome: s.nome, subtituloNome: sub.nome })
      )
    );
    return list;
  }, [servicos]);

  const toggleSubtituloSelecionado = (key: string) => {
    setSubtitulosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selecionarTodosSubtitulos = () => {
    setSubtitulosSelecionados(new Set(todosSubtitulos.map(t => t.key)));
  };

  const desmarcarTodosSubtitulos = () => {
    setSubtitulosSelecionados(new Set());
  };

  const addSubtitulosSelecionadosAoOrcamento = () => {
    const paraAdicionar = Array.from(subtitulosSelecionados).filter(k => !subtitulosNoOrcamento.includes(k));
    if (paraAdicionar.length === 0) {
      toast.error('Nenhum subtítulo selecionado ou todos já estão no orçamento');
      return;
    }
    setSubtitulosNoOrcamento(prev => [...prev, ...paraAdicionar]);
    setSubtitulosSelecionados(new Set());
    toast.success(`${paraAdicionar.length} serviço(s) adicionado(s) ao orçamento`);
  };

  const removeSubtituloDoOrcamento = (key: string) => {
    setSubtitulosNoOrcamento(prev => prev.filter(k => k !== key));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(key + '|')) delete next[k];
      });
      return next;
    });
  };

  const mapaPrecos = useMemo(() => {
    const m: Record<string, number> = {};
    composicoes.forEach(c => {
      const chaves = chavesParaBusca(c.codigo, c.banco, c.chave);
      chaves.forEach(k => {
        if (k) m[k] = c.precoUnitario;
      });
    });
    return m;
  }, [composicoes]);

  const { itensCalculados, total } = useMemo(() => {
    const lista: { key: string; servicoNome: string; subtituloNome: string; item: ItemServico; precoUnitario: number; quantidade: number; total: number }[] = [];
    for (const bloco of subtitulosAdicionados) {
      for (const i of bloco.itens) {
        const chaves = chavesParaBusca(i.codigo, i.banco, i.chave);
        let preco = 0;
        for (const k of chaves) {
          const p = mapaPrecos[k];
          if (p != null && !Number.isNaN(p)) {
            preco = p;
            break;
          }
        }
        const itemKey = `${bloco.key}|${i.chave}`;
        const qtd = Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        const totalItem = preco * qtd;
        lista.push({
          key: itemKey,
          servicoNome: bloco.servicoNome,
          subtituloNome: bloco.subtituloNome,
          item: i,
          precoUnitario: preco,
          quantidade: qtd,
          total: totalItem
        });
      }
    }
    const soma = lista.reduce((acc, x) => acc + x.total, 0);
    return { itensCalculados: lista, total: soma };
  }, [subtitulosAdicionados, quantidadesPorItem, mapaPrecos]);

  const setQuantidadeItem = (itemKey: string, valor: number) => {
    setQuantidadesPorItem(prev => ({ ...prev, [itemKey]: Math.max(0, valor) }));
  };

  return (
    <ProtectedRoute route="/ponto/orcamento">
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Orçamento</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Automação de orçamentos com composições e serviços padrão por contrato
            </p>
          </div>

          {/* Seletor de Contrato (Centro de Custo) */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Contrato (Centro de Custo)
                  </label>
                  <select
                    value={centroCustoId || ''}
                    onChange={e => setCentroCustoId(e.target.value || null)}
                    disabled={loadingCentros}
                    className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  >
                    <option value="">{loadingCentros ? 'Carregando...' : 'Selecione o contrato'}</option>
                    {costCenters?.map((cc: { id?: string; code?: string; name?: string }) => (
                      <option key={cc.id} value={cc.id || ''}>
                        {cc.code || ''} — {cc.name || cc.code || 'Sem nome'}
                      </option>
                    ))}
                  </select>
                </div>
                {centroCustoId && (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm">
                      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <FileDown className="w-4 h-4 inline mr-1" />
                        {loadingFromApi ? 'Carregando do S3...' : `Documentos salvos no S3 (${imports.length})`}
                      </p>
                    {(servicos.length > 0 || composicoes.length > 0) && (
                      <button
                        type="button"
                        onClick={apagarOrcamento}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Apagar orçamento perfeito
                      </button>
                    )}
                    {imports.length > 0 && (
                    <div className="max-h-24 overflow-y-auto text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                      {imports.slice(0, 5).map(imp => (
                        <div key={imp.id}>
                          {imp.fileName} — {imp.tipo} — {imp.date ? new Date(imp.date).toLocaleString('pt-BR') : ''}
                          {imp.servicosCount != null && ` (${imp.servicosCount} serviços)`}
                          {imp.itensCount != null && ` (${imp.itensCount} itens)`}
                        </div>
                      ))}
                    </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
            {[
              { id: 'orcamento', label: 'Novo Orçamento', icon: Calculator },
              { id: 'composicoes', label: 'Composições', icon: FileSpreadsheet },
              { id: 'servicos', label: 'Serviços Padrão', icon: ClipboardList }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
                  activeTab === t.id
                    ? 'bg-red-600 text-white dark:bg-red-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Novo Orçamento */}
          {activeTab === 'orcamento' && (
            !centroCustoId ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
                  Selecione um contrato acima para criar orçamentos.
                </CardContent>
              </Card>
            ) : (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Criar orçamento</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selecione um serviço padrão e informe a quantidade para calcular o valor total
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-2 items-end flex-wrap">
                  <div ref={servicosDropdownRef} className="relative flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Adicionar serviços ao orçamento
                    </label>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowServicosDropdown(v => !v); }}
                      className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                    >
                      <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                      <span className="block pr-6 truncate">
                        {subtitulosSelecionados.size === 0
                          ? (todosSubtitulos.length === 0 ? 'Nenhum serviço disponível' : 'Selecione os serviços')
                          : subtitulosSelecionados.size === todosSubtitulos.filter(t => !subtitulosNoOrcamento.includes(t.key)).length
                            ? 'Todos selecionados'
                            : `${subtitulosSelecionados.size} selecionado(s)`}
                      </span>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                        {showServicosDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>
                  {showServicosDropdown && (
                    <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3 max-h-[min(24rem,70vh)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={servicosSearch}
                        onChange={(e) => setServicosSearch(e.target.value)}
                        className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                      />
                      <div className="flex items-center justify-between gap-2 mb-2">
                        {(() => {
                          const disp = todosSubtitulos.filter(t => !subtitulosNoOrcamento.includes(t.key));
                          const allChecked = disp.length > 0 && disp.every(t => subtitulosSelecionados.has(t.key));
                          return (
                            <label className="flex items-center gap-3 cursor-pointer group" htmlFor="select-all-servicos">
                              <div className="relative">
                                <input
                                  id="select-all-servicos"
                                  type="checkbox"
                                  checked={allChecked}
                                  onChange={(e) => e.target.checked ? selecionarTodosSubtitulos() : desmarcarTodosSubtitulos()}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                                  allChecked ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                }`}>
                                  {allChecked && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                            </label>
                          );
                        })()}
                      </div>
                      <div>
                        {todosSubtitulos.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                            Nenhum serviço disponível. Importe o orçamento perfeito na aba Serviços Padrão.
                          </p>
                        ) : (
                          todosSubtitulos
                            .filter(t => {
                              const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
                              return label.includes(servicosSearch.trim().toLowerCase());
                            })
                            .map(t => {
                              const jaNoOrcamento = subtitulosNoOrcamento.includes(t.key);
                              const checked = subtitulosSelecionados.has(t.key);
                              return (
                                <label
                                  key={t.key}
                                  className={`flex items-center gap-3 py-1.5 cursor-pointer group ${jaNoOrcamento ? 'opacity-50' : ''}`}
                                >
                                  <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked ? 'bg-red-600 dark:bg-red-500 border-red-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500'}`}>
                                    {checked && (
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleSubtituloSelecionado(t.key)}
                                    disabled={jaNoOrcamento}
                                    className="sr-only"
                                  />
                                  <span className="text-sm text-gray-900 dark:text-gray-100">
                                    {t.servicoNome} › {t.subtituloNome}
                                    {jaNoOrcamento && ' (já no orçamento)'}
                                  </span>
                                </label>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { addSubtitulosSelecionadosAoOrcamento(); setShowServicosDropdown(false); }}
                    className="h-10 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 inline-flex items-center gap-2 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar ({subtitulosSelecionados.size})
                  </button>
                </div>

                {subtitulosSelecionados.size > 0 && subtitulosAdicionados.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                    {subtitulosSelecionados.size} serviço(s) selecionado(s). Clique em <strong>Adicionar</strong> para incluí-los no orçamento.
                  </p>
                )}

                {subtitulosAdicionados.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Itens necessários — informe a quantidade de cada item (preço vem da planilha de composições)
                    </p>
                    <div className="space-y-6">
                      {subtitulosAdicionados.map(bloco => {
                        const rowsDoBloco = itensCalculados.filter(r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome);
                        return (
                          <div key={bloco.key} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {bloco.servicoNome} › {bloco.subtituloNome}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSubtituloDoOrcamento(bloco.key)}
                                className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-gray-400 dark:hover:text-red-400 rounded"
                                title="Remover este serviço"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead>
                                  <tr className="bg-gray-50 dark:bg-gray-800">
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Código</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Banco</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-28">Quantidade</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SUB MATERIAL</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SUB MAT + M.O</th>
                                    <th className="px-4 py-2 w-10"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                  {rowsDoBloco.map((row) => {
                                    const [servicoId, subtituloId] = bloco.key.split('|');
                                    return (
                                    <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{row.item.codigo}</td>
                                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{row.item.banco}</td>
                                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">{row.item.descricao}</td>
                                      <td className="px-4 py-2 text-right">
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={row.quantidade === 0 ? '' : row.quantidade}
                                          onChange={e => setQuantidadeItem(row.key, parseFloat(e.target.value) || 0)}
                                          placeholder="0"
                                          className="w-20 px-2 py-1 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                        />
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right">
                                        R$ {row.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right font-medium">
                                        R$ {row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2">
                                        <button
                                          type="button"
                                          onClick={() => removeItemFromServico(servicoId, subtituloId, row.item.chave)}
                                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                                          title="Remover item"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">Valor total do orçamento</span>
                      <span className="text-xl font-bold text-red-600 dark:text-red-400">
                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            )
          )}

          {/* Tab: Composições */}
          {activeTab === 'composicoes' && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Arquivo de composições</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Importe uma planilha Excel com os itens (Código, Banco, Chave, Descrição, Preço)
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors">
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{isUploading ? 'Processando...' : 'Importar planilha'}</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUploadComposicoes}
                      className="hidden"
                    />
                  </label>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por código, banco, descrição..."
                      value={searchComposicao}
                      onChange={e => setSearchComposicao(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    />
                  </div>
                </div>
                {composicoes.length === 0 ? (
                  <p className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Nenhuma composição carregada. Importe uma planilha para começar.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Código</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Banco</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Chave</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Descrição</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Preço Unit.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {composicoesFiltradas.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-2 text-sm">{c.codigo}</td>
                            <td className="px-4 py-2 text-sm">{c.banco}</td>
                            <td className="px-4 py-2 text-sm">{c.chave}</td>
                            <td className="px-4 py-2 text-sm max-w-xs truncate">{c.descricao}</td>
                            <td className="px-4 py-2 text-sm text-right">
                              R$ {c.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab: Serviços Padrão */}
          {activeTab === 'servicos' && (
            !centroCustoId ? (
              <Card><CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">Selecione um contrato acima para importar o orçamento perfeito.</CardContent></Card>
            ) : (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Serviços padrão</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Importe um orçamento perfeito. Estrutura: Serviço › Subtítulos › Itens
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors">
                      {isImportandoOrcamento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{isImportandoOrcamento ? 'Importando...' : 'Importar orçamento perfeito'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportOrcamentoPerfeito}
                        className="hidden"
                      />
                    </label>
                    {!showAddServico ? (
                      <button
                        onClick={() => setShowAddServico(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Plus className="w-4 h-4" />
                        Novo serviço
                      </button>
                    ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nome do serviço"
                        value={novoServicoNome}
                        onChange={e => setNovoServicoNome(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                      <button onClick={addServico} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setShowAddServico(false); setNovoServicoNome(''); }} className="p-2 bg-gray-300 dark:bg-gray-600 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {servicos.map(svc => {
                  const expandido = servicosExpandidos.has(svc.id);
                  const totalItens = svc.subtitulos.reduce((acc, sub) => acc + sub.itens.length, 0);
                  return (
                    <div key={svc.id} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 cursor-pointer"
                        onClick={() =>
                          setServicosExpandidos(prev => {
                            const next = new Set(prev);
                            if (next.has(svc.id)) next.delete(svc.id);
                            else next.add(svc.id);
                            return next;
                          })
                        }
                      >
                        <div className="flex items-center gap-2">
                          {expandido ? (
                            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          )}
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 uppercase">{svc.nome}</h3>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({svc.subtitulos.length} subtítulos, {totalItens} itens)
                          </span>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            removeServico(svc.id);
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
                          title="Excluir serviço"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {expandido && (
                        <div className="border-t border-gray-200 dark:border-gray-700">
                          {svc.subtitulos.map(sub => (
                            <div key={sub.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                              <div className="px-6 py-3 bg-gray-100 dark:bg-gray-800/50">
                                <p className="font-medium text-gray-800 dark:text-gray-200">{sub.nome}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {sub.itens.length} itens
                                </p>
                              </div>
                              <div className="px-6 py-2 space-y-1">
                                {sub.itens.map((i, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between py-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700"
                                  >
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                                      {i.codigo} {i.banco} — {i.descricao}
                                    </span>
                                    <button
                                      onClick={() => removeItemFromServico(svc.id, sub.id, i.chave)}
                                      className="ml-2 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900/30">
                                <select
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    const [codigo, banco] = val.split('|');
                                    const item = composicoes.find(c => c.codigo === codigo && c.banco === banco);
                                    if (item) addItemToServico(svc.id, sub.id, item);
                                    e.target.value = '';
                                  }}
                                  className="text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                >
                                  <option value="">+ Adicionar item das composições</option>
                                  {composicoes
                                    .filter(c => !sub.itens.some(i => i.chave === (c.chave || normalizarChave(c.codigo, c.banco))))
                                    .map((c, i) => (
                                      <option key={i} value={`${c.codigo}|${c.banco}`}>
                                        {c.codigo} {c.banco} — {c.descricao.slice(0, 50)}...
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            )
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
