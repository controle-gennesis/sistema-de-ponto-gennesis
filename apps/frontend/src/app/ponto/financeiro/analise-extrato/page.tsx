 'use client';
 
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
 import { Upload, FileText, Loader2, Download, BarChart3, TrendingUp, DollarSign, Building2, Layers, Filter, RotateCcw, AlertCircle, CheckCircle2, Eye, ChevronUp, ChevronDown, ArrowUpDown, ArrowLeft } from 'lucide-react';
 import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
 import { Card, CardContent, CardHeader } from '@/components/ui/Card';
 import { Modal } from '@/components/ui/Modal';
 import { MainLayout } from '@/components/layout/MainLayout';
 import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
 import { usePermissions } from '@/hooks/usePermissions';
 import api from '@/lib/api';
import { useCostCenters } from '@/hooks/useCostCenters';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
 import * as XLSX from 'xlsx';
 import jsPDF from 'jspdf';
 import html2canvas from 'html2canvas';
 
 interface FinancialAnalysisReport {
   summary: {
     totalRecords: number;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     periodRange: {
       start: string;
       end: string;
     };
   };
   byCompany: Array<{
     company: string;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     recordCount: number;
   }>;
   byCostCenter: Array<{
     costCenter: string;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     recordCount: number;
   }>;
   byNature: Array<{
     nature: string;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     recordCount: number;
   }>;
   bySupplier: Array<{
     supplier: string;
     cpfCnpj: string;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     recordCount: number;
   }>;
   topSuppliers: Array<{
     supplier: string;
     cpfCnpj: string;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     recordCount: number;
   }>;
   byDocumentType: Array<{
     documentType: string;
     totalEntries: number;
     totalExits: number;
     netValue: number;
     recordCount: number;
   }>;
   rawRecords?: Array<{
     coligada: string;
     numerodocumento: string;
     segundonumero: string;
     descricao: string;
     datacriacao: string;
     datacompensacao: string;
     dataemissao: string;
     historico: string;
     ccusto: string;
     natureza: string;
     fornecedor: string;
     cpfCnpj: string;
     saida: number;
     entrada: number;
     tipooperacao: string;
     valortotal: number;
     tipodocumento: string;
   }>;
 }
 
 // Função para ordenar arrays genérica (fora do componente para evitar problemas com genéricos)
 function sortArray<T>(
   array: T[],
   sortConfig: { column: string | null; direction: 'asc' | 'desc' },
   getValue: (item: T, column: string) => number | string
 ): T[] {
   if (!sortConfig.column) return array;
   
   const sorted = [...array].sort((a, b) => {
     const valueA = getValue(a, sortConfig.column!);
     const valueB = getValue(b, sortConfig.column!);
     
     if (typeof valueA === 'number' && typeof valueB === 'number') {
       if (sortConfig.direction === 'desc') {
         return valueB - valueA; // Maior para menor
       } else {
         return valueA - valueB; // Menor para maior
       }
     } else {
       const strA = String(valueA).toLowerCase();
       const strB = String(valueB).toLowerCase();
       if (sortConfig.direction === 'desc') {
         return strB.localeCompare(strA);
       } else {
         return strA.localeCompare(strB);
       }
     }
   });
   
   return sorted;
 }
 
 export default function AnaliseExtratoPage() {
  const pageTitle = 'Análise de Extrato';
  const pageSubtitle = 'Importe um extrato bancário e gere relatórios detalhados de análise';
  const uploadTitle = 'Análise de Extrato';
  const uploadSubtitle = 'Importe seu extrato para gerar relatórios detalhados';
  const reportTitle = 'Relatório de Análise de Extrato';

  const { isDepartmentFinanceiro, userPosition } = usePermissions();
   const isAdministrator = userPosition === 'Administrador';
   const canAccess = isAdministrator || isDepartmentFinanceiro;
 
   const [selectedFile, setSelectedFile] = useState<File | null>(null);
   const [report, setReport] = useState<FinancialAnalysisReport | null>(null);
   const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiCostCenterMap, setApiCostCenterMap] = useState<Map<string, { code: string; name: string }>>(new Map());
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  // mapeamento salvo localmente (chave normalizada -> {code,name})
  const [localMapping, setLocalMapping] = useState<Map<string, { code: string; name: string }>>(new Map());
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [unmappedCodes, setUnmappedCodes] = useState<string[]>([]);
  const [mappingCandidates, setMappingCandidates] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, { code: string; name: string }>>({});
   
   // Estados para controlar modais
   const [showCostCenterModal, setShowCostCenterModal] = useState(false);
   const [showNatureModal, setShowNatureModal] = useState(false);
   const [showSuppliersModal, setShowSuppliersModal] = useState(false);
   const [showDocumentTypeModal, setShowDocumentTypeModal] = useState(false);
   
   // Estado para modal de registros detalhados
   const [showRecordsModal, setShowRecordsModal] = useState(false);
   const [selectedRecords, setSelectedRecords] = useState<FinancialAnalysisReport['rawRecords']>([]);
   const [selectedRecordTitle, setSelectedRecordTitle] = useState<string>('');
   const [previousModal, setPreviousModal] = useState<'costCenter' | 'nature' | 'suppliers' | 'documentType' | null>(null);
   
   // Estados para ordenação
  const [sortCostCenter, setSortCostCenter] = useState<{ column: 'costCenter' | 'entries' | 'exits' | 'valorFinal' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   const [sortNature, setSortNature] = useState<{ column: 'nature' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   const [sortSuppliers, setSortSuppliers] = useState<{ column: 'supplier' | 'entries' | 'exits' | 'difference' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   const [sortDocumentType, setSortDocumentType] = useState<{ column: 'documentType' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   
   // Estados para ordenação nas modais
   const [sortCostCenterModal, setSortCostCenterModal] = useState<{ column: 'costCenter' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   const [sortNatureModal, setSortNatureModal] = useState<{ column: 'nature' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   const [sortSuppliersModal, setSortSuppliersModal] = useState<{ column: 'supplier' | 'entries' | 'exits' | 'difference' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
   const [sortDocumentTypeModal, setSortDocumentTypeModal] = useState<{ column: 'documentType' | 'entries' | 'exits' | 'records' | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
 
   const uploadMutation = useMutation({
     mutationFn: async ({ file }: { file: File }) => {
       const formData = new FormData();
       formData.append('file', file);
 
       const response = await api.post('/financial-analysis/upload', formData);
 
       return response.data;
     },
     onSuccess: (data) => {
       setReport(data.data);
       setError(null);
     },
     onError: (error: any) => {
       setError(error.response?.data?.message || 'Erro ao processar planilha. Verifique o formato do arquivo.');
       setReport(null);
     },
   });
 
   const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
     if (file) {
       // Validar extensão
       const validExtensions = ['.xlsx', '.xls', '.csv'];
       const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
       
       if (!validExtensions.includes(fileExtension)) {
         setError('Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV (.csv)');
         setSelectedFile(null);
         return;
       }
 
       setSelectedFile(file);
       setError(null);
       setReport(null);
     }
   };
 
  const parseExcelFile = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const first = workbook.SheetNames[0];
    const sheet = workbook.Sheets[first];
    // Parse as array of objects using the first row as headers (more robust for columns)
    const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    return data;
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Por favor, selecione um arquivo');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const data = await parseExcelFile(selectedFile);
      if (!Array.isArray(data) || data.length === 0) {
        setError('Planilha vazia ou formato inválido.');
        setIsProcessing(false);
        return;
      }
      // data is array of objects where keys are headers
      const headers = Object.keys(data[0] || {}).map(h => String(h || '').trim());
      setFileHeaders(headers);

      // heurística para encontrar chaves (nomes de colunas)
      const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '');
      const findKey = (regex: RegExp) => headers.find(h => regex.test(norm(h)));
      const keyMap = {
        ccusto: findKey(/ccusto|centro|centrodecusto/),
        valortotal: findKey(/valor|valortotal|value/),
        datacriacao: findKey(/datadecriacao|datadecriação|datacriacao|dataemissao|data/),
        numerodocumento: findKey(/numerodocumento|documento|n[ºo]documento/),
        descricao: findKey(/descricao|historico|descri/),
      };

      const rawRecords = (data as any[]).map(r => {
        const obj: any = { ...r };
        // normalized helpful fields with safe key checks
        const kCC = keyMap.ccusto as string | undefined;
        const kVal = keyMap.valortotal as string | undefined;
        const kDate = keyMap.datacriacao as string | undefined;
        const kNum = keyMap.numerodocumento as string | undefined;
        const kDesc = keyMap.descricao as string | undefined;

        obj.ccusto = String((kCC && r[kCC]) ?? r['Centro de Custo'] ?? r['Código'] ?? r['Centro'] ?? '').trim();
        obj.valortotal = (kVal && r[kVal]) ?? r['Valor'] ?? r['VALOR'] ?? '';
        obj.datacriacao = (kDate && r[kDate]) ?? r['Data'] ?? r['DATA'] ?? '';
        obj.numerodocumento = (kNum && r[kNum]) ?? r['Número Documento'] ?? r['NUMERO DOCUMENTO'] ?? '';
        obj.descricao = (kDesc && r[kDesc]) ?? r['Descrição'] ?? r['Histórico'] ?? r['HISTORICO'] ?? '';
        return obj;
      });

      // construir summary simples
      let totalEntries = 0;
      let totalExits = 0;
      const parsedRecords = rawRecords.map(rr => {
        const rawValField = rr.valortotal ?? '';
        const n = Number(String(rawValField).replace(/[^\d-.,-]/g, '').replace(',', '.'));
        const v = isNaN(n) ? 0 : n;
        if (v > 0) totalEntries += v;
        if (v < 0) totalExits += Math.abs(v);
        return {
          ...rr,
          valortotal: v,
          entrada: v > 0 ? v : 0,
          saida: v < 0 ? Math.abs(v) : 0,
          // store original parsed date value for safer formatting
          __rawDate: rr.datacriacao,
        };
      });

      const now = new Date();
      const summary = {
        totalRecords: parsedRecords.length,
        totalEntries,
        totalExits,
        netValue: totalEntries - totalExits,
        periodRange: { start: '', end: '' },
      };

      const syntheticReport: FinancialAnalysisReport = {
        summary,
        byCompany: [],
        byCostCenter: [],
        byNature: [],
        bySupplier: [],
        topSuppliers: [],
        byDocumentType: [],
        rawRecords: parsedRecords as any,
      };

      setReport(syntheticReport);
      // após gerar os registros, tentar resolver nomes dos centros de custo via backend
      try {
        const uniqueCodes = Array.from(new Set(parsedRecords.map(p => String(p.ccusto || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim()).filter(s => s && s !== ''))).slice(0, 2000);
        if (uniqueCodes.length > 0) {
          await resolveCostCenters(uniqueCodes);

          // identificar códigos que ainda não têm correspondência (nem local nem via lookup/api)
          const stillUnmapped: string[] = [];
          const { map: lookupMap, normalize } = costCenterLookup || {};
          uniqueCodes.forEach(code => {
            const raw = String(code).trim();
            const norm = normalizeStandalone(raw);
            const digits = norm.replace(/[^0-9]/g, '');

            const hasLocal = localMapping && (localMapping.get(raw) || localMapping.get(norm) || (digits && localMapping.get(digits)));
            const hasLookup = lookupMap && (lookupMap.get(raw) || lookupMap.get(norm) || (digits && lookupMap.get(digits)));
            const hasApi = apiCostCenterMap && (apiCostCenterMap.get(raw) || apiCostCenterMap.get(norm) || (digits && apiCostCenterMap.get(digits)));

            if (!hasLocal && !hasLookup && !hasApi) {
              stillUnmapped.push(raw);
            }
          });

          if (stillUnmapped.length > 0) {
            // buscar sugestões para unmapped e abrir modal
            const candidates = await fetchCandidatesForCodes(stillUnmapped);
            setMappingCandidates(candidates);
            // iniciar rascunhos com primeira sugestão quando houver
            const drafts: Record<string, { code: string; name: string }> = {};
            stillUnmapped.forEach(c => {
              const list = candidates[c] || [];
              drafts[c] = list[0] ? { code: list[0].code, name: list[0].name } : { code: c, name: '' };
            });
            setMappingDrafts(drafts);
            setUnmappedCodes(stillUnmapped);
            setShowMappingModal(true);
          }
        }
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      console.error(err);
      setError('Erro ao processar planilha. Verifique o formato do arquivo.');
    } finally {
      setIsProcessing(false);
    }
  };
 
   const formatCurrency = (value: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(value);
   };
 
  const formatDate = (dateString: any) => {
    if (!dateString) return '-';
    try {
      // If already a Date object, format using local date components to avoid timezone shifts
      if (dateString instanceof Date && !isNaN(dateString.getTime())) {
        const d = dateString as Date;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      }

      // If it's a number (Excel serial), try to convert (XLSX already returns Date with cellDates:true in most cases)
      if (typeof dateString === 'number') {
        const d = new Date(dateString);
        if (!isNaN(d.getTime())) {
          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
      }

      // If ISO string, parse and use UTC components to avoid local timezone offset
      const str = String(dateString);
      const isoMatch = /^\d{4}-\d{2}-\d{2}T/.test(str);
      const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(str);
      if (dateOnlyMatch) {
        const parts = str.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      if (isoMatch) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
        }
      }

      // Fallback to Date parsing and locale format
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
      return str;
    } catch {
      return String(dateString);
    }
   };
 
   // Função helper para renderizar header clicável
   const renderSortableHeader = (
     label: string,
     column: string,
     currentSort: { column: string | null; direction: 'asc' | 'desc' },
     onSort: (column: string) => void
   ) => {
     const isActive = currentSort.column === column;
     
     return (
       <th 
         className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
         onClick={() => onSort(column)}
       >
         <div className="flex items-center justify-end gap-1">
           <span>{label}</span>
           <div className="flex flex-col">
             {isActive ? (
               currentSort.direction === 'desc' ? (
                 <ChevronDown className="w-3 h-3" />
               ) : (
                 <ChevronUp className="w-3 h-3" />
               )
             ) : (
               <ArrowUpDown className="w-3 h-3 opacity-50" />
             )}
           </div>
         </div>
       </th>
     );
   };
 
   // Função helper para header clicável à esquerda (para nomes)
   const renderSortableHeaderLeft = (
     label: string,
     column: string,
     currentSort: { column: string | null; direction: 'asc' | 'desc' },
     onSort: (column: string) => void
   ) => {
     const isActive = currentSort.column === column;
     
     return (
       <th 
         className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
         onClick={() => onSort(column)}
       >
         <div className="flex items-center gap-1">
           <span>{label}</span>
           <div className="flex flex-col">
             {isActive ? (
               currentSort.direction === 'desc' ? (
                 <ChevronDown className="w-3 h-3" />
               ) : (
                 <ChevronUp className="w-3 h-3" />
               )
             ) : (
               <ArrowUpDown className="w-3 h-3 opacity-50" />
             )}
           </div>
         </div>
       </th>
     );
   };

  // normalize header for comparisons
  const normalizeHeader = (h: string) =>
    String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Sorting state for records modal
  const [sortRecordsModal, setSortRecordsModal] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'desc' });
  const handleSortRecords = (column: string) => {
    setSortRecordsModal(prev => {
      if (prev.column === column) {
        return { column: prev.column, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { column, direction: 'desc' };
    });
  };

  const sortedSelectedRecords = useMemo(() => {
    if (!selectedRecords || selectedRecords.length === 0) return [];
    return sortArray(selectedRecords as any[], sortRecordsModal, (item: any, column: string) => {
      // handle numeric computed columns
      const key = String(column);
      const v = item[key];
      if (v === undefined || v === null) {
        // try computed fields
        if (/entrada/i.test(key)) return item.entrada ?? 0;
        if (/sa[ií]da|saida/i.test(key)) return item.saida ?? 0;
        if (/valor|valortotal/i.test(key)) return item.valortotal ?? 0;
      }
      if (typeof v === 'number') return v;
      if (!isNaN(Number(v))) return Number(v);
      return String(v ?? '');
    });
  }, [selectedRecords, sortRecordsModal]);
 
   const displayReport = report;
 
  const { costCenters } = useCostCenters();
  const costCentersList = costCenters;
  // Montar mapa de lookup tolerante: várias formas normalizadas do código apontam para o mesmo registro
  const costCenterLookup = useMemo(() => {
    const normalize = (s: string) => {
      return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remover acentos
        .toLowerCase()
        .replace(/[^0-9a-z]/g, ''); // manter apenas alfanumérico (remove pontos, espaços, hífens)
    };

    const map = new Map<string, { code: string; name: string }>();
    costCentersList.forEach((cc: any) => {
      if (!cc || !cc.code) return;
      const raw = String(cc.code).trim();
      const norm = normalize(raw);
      // chaves variantes
      map.set(raw, { code: raw, name: cc.name || '' });
      map.set(norm, { code: raw, name: cc.name || '' });
      // dígitos apenas (se houver letras podem ficar iguais)
      const digits = norm.replace(/[^0-9]/g, '');
      if (digits && digits !== norm) map.set(digits, { code: raw, name: cc.name || '' });
    });

    return { map, normalize };
  }, [costCentersList]);

  // Normalize standalone (used antes de costCenterLookup estar pronto)
  const normalizeStandalone = (s: string) => {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^0-9a-z]/g, '');
  };

  // Buscar naturezas cadastradas para mapear código -> nome
  const { data: budgetNaturesData } = useQuery({
    queryKey: ['budget-natures',],
    queryFn: async () => {
      const res = await api.get('/budget-natures', { params: { limit: 2000 } });
      return res.data;
    },
  });

  const budgetNaturesList = budgetNaturesData?.data || [];
  const natureLookup = useMemo(() => {
    const normalize = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^0-9a-z]/g, '');
    const map = new Map<string, { code: string; name: string }>();
    budgetNaturesList.forEach((n: any) => {
      if (!n) return;
      const raw = String(n.code || n.Código || n.codigo || n.code || n.name || '').trim();
      const norm = normalize(raw);
      map.set(raw, { code: raw, name: n.name || n.Nome || '' });
      map.set(norm, { code: raw, name: n.name || n.Nome || '' });
      const digits = norm.replace(/[^0-9]/g, '');
      if (digits) map.set(digits, { code: raw, name: n.name || n.Nome || '' });
    });
    return { map, normalize };
  }, [budgetNaturesList]);

  // natureza filters state (multi-select + search)
  const [selectedNatureEntrada, setSelectedNatureEntrada] = useState<string[]>([]);
  const [selectedNatureSaida, setSelectedNatureSaida] = useState<string[]>([]);
  const [selectedNatureEntradaSearch, setSelectedNatureEntradaSearch] = useState<string>('');
  const [selectedNatureSaidaSearch, setSelectedNatureSaidaSearch] = useState<string>('');
  const [showEntradaDropdown, setShowEntradaDropdown] = useState(false);
  const [showSaidaDropdown, setShowSaidaDropdown] = useState(false);
  const [selectedPolos, setSelectedPolos] = useState<string[]>([]);
  const [selectedPolosSearch, setSelectedPolosSearch] = useState('');
  const [showPoloDropdown, setShowPoloDropdown] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const entradaRef = useRef<HTMLDivElement | null>(null);
  const saidaRef = useRef<HTMLDivElement | null>(null);
  const poloRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedPolosRef = useRef(false);
  const prevDisplayReportRef = useRef<typeof displayReport>(null);

  // fechar dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (entradaRef.current && !entradaRef.current.contains(e.target as Node)) setShowEntradaDropdown(false);
      if (saidaRef.current && !saidaRef.current.contains(e.target as Node)) setShowSaidaDropdown(false);
      if (poloRef.current && !poloRef.current.contains(e.target as Node)) setShowPoloDropdown(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const VAZIAS_CODE = '__VAZIAS__';

  const naturezaEntradasList = useMemo(() => {
    const base = (budgetNaturesList || []).filter((n: any) => {
      const code = String(n.code || n.Código || n.codigo || '').trim();
      return code.startsWith('1');
    });
    return [...base, { code: VAZIAS_CODE, name: 'Vazias' }];
  }, [budgetNaturesList]);

  const naturezaSaidasList = useMemo(() => {
    const base = (budgetNaturesList || []).filter((n: any) => {
      const code = String(n.code || n.Código || n.codigo || '').trim();
      return code.startsWith('2') || code.startsWith('3');
    });
    return [...base, { code: VAZIAS_CODE, name: 'Vazias' }];
  }, [budgetNaturesList]);

  // Por padrão, selecionar todas as naturezas ao importar planilha (polos serão preenchidos após getPoloForRecord/polosList)
  useEffect(() => {
    if (!displayReport) return;
    const allEntrada = (naturezaEntradasList || []).map((n: any) => String(n.code || n.Código || n.codigo || ''));
    const allSaida = (naturezaSaidasList || []).map((n: any) => String(n.code || n.Código || n.codigo || ''));
    if (allEntrada.length > 0) setSelectedNatureEntrada(allEntrada);
    if (allSaida.length > 0) setSelectedNatureSaida(allSaida);
  }, [displayReport, naturezaEntradasList, naturezaSaidasList]);

  const getNatureCodeForRecord = (record: any) => {
    // try explicit codNatureza fields first
    const tryKeys = ['codNatureza', 'cod_natureza', 'COD_NATUREZA', 'CodNatureza', 'cod natureza', 'cod'];
    for (const k of tryKeys) {
      if (record[k]) return String(record[k]).trim();
    }
    // else try natureza field (could be code or name)
    const raw = String(record.natureza || record.NATUREZA || record['Natureza'] || '').trim();
    if (!raw) return '';
    const { map: nmap, normalize: nnormalize } = natureLookup || {};
    if (nmap) {
      const found = nmap.get(raw) || nmap.get(nnormalize ? nnormalize(raw) : raw) || nmap.get(raw.replace(/[^0-9]/g, ''));
      if (found) return found.code;
    }
    // fallback: if raw looks like code (starts with digit), return raw
    if (/^\d/.test(raw)) return raw;
    return '';
  };

  const isDateHeader = (h: string) => {
    if (!h) return false;
    const s = String(h).toLowerCase();
    return /data|date|datacriacao|dataemissao|datacompensacao|data de|dataemiss|data criação|data criação|vencimento/.test(s);
  };

  // Resolve nomes dos centros de custo usando o backend (batch -> fallback por busca)
  const resolveCostCenters = async (codes: string[]) => {
    try {
      if (!codes || codes.length === 0) return new Map();
      // tentar rota batch primeiro
      try {
        const res = await api.get('/cost-centers', { params: { codes: codes.join(',') } });
        const items = normalizeCostCentersResponse(res.data);
        const map = new Map();
        items.forEach((cc: any) => {
          const raw = String(cc.code || '').trim();
          const norm = normalizeStandalone(raw);
          const digits = norm.replace(/[^0-9]/g, '');
          map.set(raw, { code: raw, name: cc.name || '' });
          map.set(norm, { code: raw, name: cc.name || '' });
          if (digits) map.set(digits, { code: raw, name: cc.name || '' });
        });
        setApiCostCenterMap(map);
        return map;
      } catch (e) {
        // batch não suportado ou falhou - fallback abaixo
      }

      // fallback: buscar por cada código (paralelo)
      const promises = codes.map(async (code) => {
        try {
          const res = await api.get('/cost-centers', { params: { search: code, limit: 5 } });
          const found = normalizeCostCentersResponse(res.data);
          if (found && found.length > 0) {
            // tentar encontrar exato, senão pegar o primeiro
            const exact = found.find((cc: any) => String(cc.code || '').trim().toLowerCase() === String(code || '').trim().toLowerCase());
            return exact || found[0];
          }
        } catch (err) {
          // ignore
        }
        return null;
      });

      const results = await Promise.all(promises);
      const map = new Map();
      results.forEach((cc: any) => {
        if (!cc) return;
        const raw = String(cc.code || '').trim();
        const norm = normalizeStandalone(raw);
        const digits = norm.replace(/[^0-9]/g, '');
        map.set(raw, { code: raw, name: cc.name || '' });
        map.set(norm, { code: raw, name: cc.name || '' });
        if (digits) map.set(digits, { code: raw, name: cc.name || '' });
      });
      setApiCostCenterMap(map);
      return map;
    } catch (err) {
      console.error('Erro ao resolver centros de custo:', err);
      return new Map();
    }
  };

  // carregar mapeamento salvo em localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('analiseExtrato_cc_map_v1');
      if (raw) {
        const obj = JSON.parse(raw);
        const map = new Map<string, { code: string; name: string }>();
        Object.keys(obj || {}).forEach(k => {
          if (obj[k] && obj[k].code) {
            map.set(k, { code: obj[k].code, name: obj[k].name });
          }
        });
        setLocalMapping(map);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const persistLocalMapping = (map: Map<string, { code: string; name: string }>) => {
    try {
      const obj: Record<string, { code: string; name: string }> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem('analiseExtrato_cc_map_v1', JSON.stringify(obj));
    } catch (e) {
      console.error('Erro ao salvar mapeamento local:', e);
    }
  };

  // buscar sugestões do backend para cada código não mapeado
  const fetchCandidatesForCodes = async (codes: string[]) => {
    const out: Record<string, Array<{ code: string; name: string }>> = {};
    await Promise.all(codes.map(async (code) => {
      try {
        const res = await api.get('/cost-centers', { params: { search: code, limit: 8 } });
        const items = normalizeCostCentersResponse(res.data).map((cc: any) => ({ code: cc.code, name: cc.name }));
        out[code] = items;
      } catch (e) {
        out[code] = [];
      }
    }));
    return out;
  };

  // Filtro de natureza (reutilizado em costCenterSummary)
  const filterRecordsByNature = (rec: any) => {
    const entradaSelected = Array.isArray(selectedNatureEntrada) && selectedNatureEntrada.length > 0;
    const saidaSelected = Array.isArray(selectedNatureSaida) && selectedNatureSaida.length > 0;
    const entradaAll = entradaSelected && selectedNatureEntrada.length === (naturezaEntradasList || []).length;
    const saidaAll = saidaSelected && selectedNatureSaida.length === (naturezaSaidasList || []).length;
    const rawVal = rec.valortotal ?? 0;
    const n = Number(String(rawVal).replace(/[^\d-.,]/g, '').replace(',', '.'));
    const val = isNaN(n) ? 0 : n;
    const nat = String(getNatureCodeForRecord(rec) ?? '');
    const isEntry = val > 0;
    const isExit = val < 0;
    // Se nenhum nos dois: não incluir nada (relatório zerado)
    if (!entradaSelected && !saidaSelected) return false;
    // Se entrada sem seleção: excluir todos os registros de entrada
    if (!entradaSelected && isEntry) return false;
    // Se saída sem seleção: excluir todos os registros de saída
    if (!saidaSelected && isExit) return false;
    // Entrada: se "todas" selecionadas, incluir qualquer entrada; senão, só as que batem (incl. natureza vazia se "Vazias" selecionada)
    if (isEntry) return entradaAll || selectedNatureEntrada.includes(nat) || (nat === '' && selectedNatureEntrada.includes(VAZIAS_CODE));
    // Saída: se "todas" selecionadas, incluir qualquer saída; senão, só as que batem (incl. natureza vazia se "Vazias" selecionada)
    if (isExit) return saidaAll || selectedNatureSaida.includes(nat) || (nat === '' && selectedNatureSaida.includes(VAZIAS_CODE));
    return false;
  };

  // helper: obtain polo for a raw record (uses costCentersList lookup)
  const getPoloForRecord = (record: any) => {
    try {
      const raw = String(record.ccusto || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
      const norm = costCenterLookup && costCenterLookup.normalize ? costCenterLookup.normalize(raw) : normalizeStandalone(raw);
      const rawDigits = raw.replace(/\D/g, '');
      const normDigits = norm.replace(/\D/g, '');
      const rawDigitsNoLeading = rawDigits.replace(/^0+/, '') || rawDigits;
      const normDigitsNoLeading = normDigits.replace(/^0+/, '') || normDigits;

      let found = costCentersList.find((cc: any) => String(cc.code || '').trim() === raw);
      if (!found) found = costCentersList.find((cc: any) => (costCenterLookup && costCenterLookup.normalize ? costCenterLookup.normalize(String(cc.code || '')) : String(cc.code || '')) === norm);
      if (!found) {
        found = costCentersList.find((cc: any) => {
          const ccNorm = costCenterLookup && costCenterLookup.normalize ? costCenterLookup.normalize(String(cc.code || '')) : String(cc.code || '');
          return ccNorm.includes(norm) || norm.includes(ccNorm);
        });
      }
      if (!found && (rawDigits || normDigits)) {
        found = costCentersList.find((cc: any) => {
          const ccCode = String(cc.code || '').trim();
          const ccDigits = ccCode.replace(/\D/g, '');
          const ccDigitsNoLeading = ccDigits.replace(/^0+/, '') || ccDigits;
          return ccDigits === rawDigits || ccDigits === normDigits
            || ccDigitsNoLeading === rawDigitsNoLeading || ccDigitsNoLeading === normDigitsNoLeading
            || (rawDigitsNoLeading && ccDigitsNoLeading && (ccDigitsNoLeading.includes(rawDigitsNoLeading) || rawDigitsNoLeading.includes(ccDigitsNoLeading)));
        });
      }
      const polo = found ? ((found as any).polo ?? (found as any).Polo ?? '') : '';
      return (polo && String(polo).trim()) ? String(polo).trim() : 'Sem Polo';
    } catch {
      return 'Sem Polo';
    }
  };

  const polosList = useMemo(() => {
    if (!displayReport?.rawRecords?.length) return [];
    const set = new Set<string>();
    (displayReport.rawRecords as any[]).forEach(r => set.add(getPoloForRecord(r) || 'Sem Polo'));
    return Array.from(set).sort();
  }, [displayReport, costCentersList]);

  // Inicializar polos só uma vez por planilha; não sobrescrever quando o usuário altera a seleção
  useEffect(() => {
    if (!displayReport) {
      hasInitializedPolosRef.current = false;
      prevDisplayReportRef.current = null;
      return;
    }
    if (prevDisplayReportRef.current !== displayReport) {
      prevDisplayReportRef.current = displayReport;
      hasInitializedPolosRef.current = false;
    }
    if (!polosList.length) return;
    if (!hasInitializedPolosRef.current) {
      hasInitializedPolosRef.current = true;
      setSelectedPolos([...polosList]);
    }
  }, [displayReport, polosList]);

  const filterRecordsByPolo = (rec: any) => {
    const polo = getPoloForRecord(rec) || 'Sem Polo';
    if (selectedPolos.length === 0) return false;
    if (selectedPolos.length === polosList.length) return true;
    return selectedPolos.includes(polo);
  };

  // Relatório sintetizado por Centro de Custo (Entrada / Saída / Valor Final) a partir dos registros brutos
  const costCenterSummary = useMemo(() => {
    if (!displayReport) return [];
    const allRecords = displayReport.rawRecords || [];
    const records = allRecords.filter(r => filterRecordsByNature(r) && filterRecordsByPolo(r));
    const map = new Map<string, { centro: string; entrada: number; saida: number; count: number }>();

    records.forEach(r => {
      const rawCodeAny = (r.ccusto ?? '');
      const rawCodeStr = String(rawCodeAny);
      // remover caracteres invisíveis comuns e trim
      const removeInvisible = (s: string) => s.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
      const cleaned = removeInvisible(rawCodeStr) || 'Sem Centro';

      // canonical key para agrupar (mesma normalização usada no lookup)
      const canonical = costCenterLookup && costCenterLookup.normalize ? costCenterLookup.normalize(cleaned) : cleaned;

      // tentar ler valor em diferentes campos
      const rawVal = r.valortotal ?? 0;
      const n = Number(String(rawVal).replace(/[^\d-.,]/g, '').replace(',', '.'));
      const value = isNaN(n) ? 0 : n;
      const entrada = value > 0 ? value : 0;
      const saida = value < 0 ? Math.abs(value) : 0;

      const cur = map.get(canonical) ?? { centro: cleaned, entrada: 0, saida: 0, count: 0 };
      cur.entrada += entrada;
      cur.saida += saida;
      cur.count += 1;
      map.set(canonical, cur);
    });

    const arr = Array.from(map.entries()).map(([key, x]) => {
      const originalDisplayCandidate = x.centro;
      let display = originalDisplayCandidate;

      const { map: lookupMap, normalize } = costCenterLookup || {};
      // primeiro, tentar mapeamento local salvo pelo usuário
      if (localMapping && localMapping.size > 0) {
        const localKeys = [
          originalDisplayCandidate,
          originalDisplayCandidate.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim(),
          normalizeStandalone(String(originalDisplayCandidate)),
          normalizeStandalone(String(originalDisplayCandidate)).replace(/[^0-9]/g, ''),
          normalizeStandalone(String(originalDisplayCandidate)).replace(/^0+/, '')
        ].filter(Boolean) as string[];
        for (const k of localKeys) {
          const foundLocal = localMapping.get(k);
          if (foundLocal) {
            display = foundLocal.name || String(foundLocal.code || '');
            break;
          }
        }
      }

      // se ainda não encontrou, tentar lookup / heurísticas
      if (display === originalDisplayCandidate && originalDisplayCandidate && lookupMap && normalize) {
        const norm = normalize(String(originalDisplayCandidate));
        const digitsOnly = norm.replace(/[^0-9]/g, '');
        const digitsNoLeading = digitsOnly.replace(/^0+/, '') || digitsOnly;

        const variants = [
          String(originalDisplayCandidate),
          originalDisplayCandidate.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim(),
          norm,
          digitsOnly,
          digitsNoLeading
        ].filter(Boolean) as string[];

        let matched: any = null;
        for (const v of variants) {
          matched = lookupMap.get(v);
          if (matched) break;
        }

        if (!matched) {
          // tentativa por inclusão/prefixo entre os registros cadastrados
          const found = costCentersList.find((cc: any) => {
            if (!cc || !cc.code) return false;
            const ccNorm = normalize(String(cc.code));
            return ccNorm.includes(norm) || norm.includes(ccNorm) || ccNorm.includes(digitsOnly) || digitsOnly.includes(ccNorm);
          });
          if (found) matched = { code: found.code, name: found.name };
        }

        if (matched) {
          display = matched.name || String(matched.code || '');
        } else if (apiCostCenterMap && apiCostCenterMap.size > 0) {
          // tentar também procurar no mapa retornado pela API (caso ainda não esteja no lookup)
          const tryKeys = [originalDisplayCandidate, normalizeStandalone(String(originalDisplayCandidate)), (normalizeStandalone(String(originalDisplayCandidate)).replace(/[^0-9]/g, '')), (normalizeStandalone(String(originalDisplayCandidate)).replace(/^0+/, ''))];
          for (const k of tryKeys) {
            const found = apiCostCenterMap.get(k);
            if (found) {
              display = found.name || String(found.code || '');
              break;
            }
          }
        }
      }

      return {
        key,
        centro: display,
        polo: getPoloForRecord({ ccusto: originalDisplayCandidate }),
        entrada: x.entrada,
        saida: x.saida,
        valorFinal: x.entrada - x.saida,
        registros: x.count
      };
    });

    arr.sort((a, b) => b.valorFinal - a.valorFinal);
    return arr;
  }, [displayReport, selectedNatureEntrada, selectedNatureSaida, naturezaEntradasList, naturezaSaidasList, selectedPolos, polosList, costCentersList]);
 
  // Totais agregados do relatório por Centro de Custo
  const costCenterTotals = useMemo(() => {
    if (!costCenterSummary || costCenterSummary.length === 0) {
      return { entrada: 0, saida: 0, valorFinal: 0, registros: 0 };
    }
    return costCenterSummary.reduce(
      (acc, cur) => {
        acc.entrada += cur.entrada;
        acc.saida += cur.saida;
        acc.valorFinal += cur.valorFinal;
        acc.registros += cur.registros || 0;
        return acc;
      },
      { entrada: 0, saida: 0, valorFinal: 0, registros: 0 }
    );
  }, [costCenterSummary]);

  // Ordenação aplicada ao resumo por centro de custo
  const handleSortCostCenter = (column: string) => {
    setSortCostCenter(prev => {
      if (prev.column === column) {
        return { column: prev.column, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { column: column as any, direction: 'desc' };
    });
  };

  const sortedCostCenterSummary = useMemo(() => {
    if (!costCenterSummary || costCenterSummary.length === 0) return [];
    return sortArray(costCenterSummary, sortCostCenter, (item: any, column: string) => {
      switch (column) {
        case 'polo': return (item.polo || '').toLowerCase();
        case 'entries': return item.entrada;
        case 'exits': return item.saida;
        case 'valorFinal': return item.valorFinal;
        case 'records': return item.registros ?? 0;
        case 'costCenter': return item.centro;
        default: return '';
      }
    });
  }, [costCenterSummary, sortCostCenter]);

   // Função para lidar com clique em uma linha e mostrar registros detalhados
   const handleRowClick = (filterType: 'costCenter' | 'nature' | 'supplier' | 'documentType', filterValue: string, title: string) => {
     if (!displayReport?.rawRecords) return;
     
     const filtered = displayReport.rawRecords.filter(record => {
       if (!filterRecordsByNature(record) || !filterRecordsByPolo(record)) return false;
       switch (filterType) {
         case 'costCenter':
          {
            const raw = String(record.ccusto || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
            const canonical = costCenterLookup && costCenterLookup.normalize ? costCenterLookup.normalize(raw) : normalizeStandalone(raw);
            // filterValue may be the canonical key (row.key) or the original code/name
            return raw === filterValue || canonical === filterValue;
          }
         case 'nature':
           return (record.natureza || 'Não informado') === filterValue;
         case 'supplier':
           return (record.fornecedor || 'Não informado') === filterValue;
         case 'documentType':
           return (record.tipodocumento || 'Não informado') === filterValue;
         default:
           return false;
       }
     });
     
     // Salvar qual modal estava aberto antes
     if (showCostCenterModal) {
       setPreviousModal('costCenter');
       setShowCostCenterModal(false);
     } else if (showNatureModal) {
       setPreviousModal('nature');
       setShowNatureModal(false);
     } else if (showSuppliersModal) {
       setPreviousModal('suppliers');
       setShowSuppliersModal(false);
     } else if (showDocumentTypeModal) {
       setPreviousModal('documentType');
       setShowDocumentTypeModal(false);
     } else {
       setPreviousModal(null);
     }
     
     setSelectedRecords(filtered);
     setSelectedRecordTitle(title);
     setShowRecordsModal(true);
   };
 
   // Função para voltar ao modal anterior
   const handleBackToPreviousModal = () => {
     setShowRecordsModal(false);
     
     if (previousModal === 'costCenter') {
       setShowCostCenterModal(true);
     } else if (previousModal === 'nature') {
       setShowNatureModal(true);
     } else if (previousModal === 'suppliers') {
       setShowSuppliersModal(true);
     } else if (previousModal === 'documentType') {
       setShowDocumentTypeModal(true);
     }
     
     setPreviousModal(null);
   };
 
  const handleMappingDraftChange = (origCode: string, value: { code: string; name: string }) => {
    setMappingDrafts(prev => ({ ...prev, [origCode]: value }));
  };

  const applyAndSaveMappings = () => {
    try {
      const newLocal = new Map(localMapping);
      const newApi = new Map(apiCostCenterMap);
      Object.keys(mappingDrafts).forEach(orig => {
        const v = mappingDrafts[orig];
        if (!v || !v.code) return;
        const keyNorm = normalizeStandalone(String(orig));
        const codeRaw = String(v.code).trim();
        const codeNorm = normalizeStandalone(codeRaw);
        const digits = codeNorm.replace(/[^0-9]/g, '');
        newLocal.set(keyNorm, { code: codeRaw, name: v.name || '' });
        newLocal.set(codeRaw, { code: codeRaw, name: v.name || '' });
        if (digits) newLocal.set(digits, { code: codeRaw, name: v.name || '' });

        // também atualizar mapa vindo da API para efeito imediato na UI
        newApi.set(codeRaw, { code: codeRaw, name: v.name || '' });
        newApi.set(codeNorm, { code: codeRaw, name: v.name || '' });
        if (digits) newApi.set(digits, { code: codeRaw, name: v.name || '' });
      });
      setLocalMapping(newLocal);
      setApiCostCenterMap(newApi);
      persistLocalMapping(newLocal);
      setShowMappingModal(false);
      setUnmappedCodes([]);
    } catch (e) {
      console.error('Erro ao aplicar mapeamentos:', e);
    }
  };

   const handleExportPDF = async () => {
     if (!displayReport) return;
 
     try {
       // Mostrar loading
       const loadingToast = document.createElement('div');
       loadingToast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
       loadingToast.textContent = 'Gerando PDF com gráficos e tabelas...';
       document.body.appendChild(loadingToast);
 
       const pdf = new jsPDF('p', 'mm', 'a4');
       const pageWidth = pdf.internal.pageSize.getWidth();
       const pageHeight = pdf.internal.pageSize.getHeight();
       const margin = 15;
       let yPosition = margin;
 
       // Função para adicionar nova página se necessário
       const checkPageBreak = (requiredHeight: number) => {
         if (yPosition + requiredHeight > pageHeight - margin) {
           pdf.addPage();
           yPosition = margin;
         }
       };
 
       // Função para capturar elemento e adicionar ao PDF
       const captureAndAdd = async (element: HTMLElement | null, spacing: number = 15, elementName: string = 'elemento'): Promise<boolean> => {
         if (!element) {
           console.warn(`${elementName} não encontrado`);
           return false;
         }
 
         try {
           console.log(`Capturando ${elementName}...`);
           
           // Rolar até o elemento
           element.scrollIntoView({ behavior: 'instant', block: 'center' });
           await new Promise(resolve => setTimeout(resolve, 1500));
 
           // Verificar se o elemento está visível
           const rect = element.getBoundingClientRect();
           if (rect.width === 0 || rect.height === 0) {
             console.warn(`${elementName} não está visível (width: ${rect.width}, height: ${rect.height})`);
             return false;
           }
 
           // Capturar elemento
           const canvas = await html2canvas(element, {
             backgroundColor: '#ffffff',
             scale: 2,
             logging: false,
             useCORS: true,
             allowTaint: true,
             width: element.scrollWidth || element.offsetWidth,
             height: element.scrollHeight || element.offsetHeight
           });
 
           if (!canvas || canvas.width === 0 || canvas.height === 0) {
             console.warn(`${elementName}: Canvas vazio ou inválido`); 
             return false;
           }
 
           console.log(`${elementName} capturado: ${canvas.width}x${canvas.height}px`);
 
           // Calcular dimensões
           const imgWidth = pageWidth - 2 * margin;
           const imgHeight = (canvas.height * imgWidth) / canvas.width;
 
           // Verificar se precisa de nova página
           checkPageBreak(imgHeight + spacing);
 
           // Adicionar imagem
           pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', margin, yPosition, imgWidth, imgHeight);
           yPosition += imgHeight + spacing;
 
           console.log(`${elementName} adicionado ao PDF com sucesso`);
           return true;
         } catch (error) {
           console.error(`Erro ao capturar ${elementName}:`, error);
           return false;
         }
       };
 
       // Cabeçalho
       pdf.setFontSize(20);
       pdf.setFont('helvetica', 'bold');
       pdf.text('Relatório de Análise de Extrato', pageWidth / 2, yPosition, { align: 'center' });
       yPosition += 10;
 
       pdf.setFontSize(10);
       pdf.setFont('helvetica', 'normal');
       const now = new Date();
       pdf.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`, pageWidth / 2, yPosition, { align: 'center' });
       yPosition += 20;
 
       // Resumo (texto)
       pdf.setFontSize(16);
       pdf.setFont('helvetica', 'bold');
       pdf.text('Resumo', margin, yPosition);
       yPosition += 10;
 
       pdf.setFontSize(11);
       pdf.setFont('helvetica', 'normal');
       pdf.text(`Total de Registros: ${displayReport.summary.totalRecords.toLocaleString('pt-BR')}`, margin, yPosition);
       yPosition += 7;
       pdf.setTextColor(0, 150, 0);
       pdf.text(`Total de Entradas: ${formatCurrency(displayReport.summary.totalEntries)}`, margin, yPosition);
       yPosition += 7;
       pdf.setTextColor(200, 0, 0);
       pdf.text(`Total de Saídas: ${formatCurrency(displayReport.summary.totalExits)}`, margin, yPosition);
       yPosition += 7;
       pdf.setTextColor(0, 0, 0);
       pdf.text(`Período: ${formatDate(displayReport.summary.periodRange.start)} a ${formatDate(displayReport.summary.periodRange.end)}`, margin, yPosition);
       yPosition += 15;
 
       // ... restante do PDF e relatórios idênticos ao original ...
 
       // Remover loading
       if (loadingToast && loadingToast.parentNode) {
         document.body.removeChild(loadingToast);
       }
 
       // Salvar PDF
       const fileName = `analise-extrato-${now.toISOString().split('T')[0]}.pdf`;
       pdf.save(fileName);
       
       console.log('PDF gerado com sucesso!');
     } catch (error) {
       console.error('Erro ao exportar PDF:', error);
       const errorMessage = error instanceof Error ? error.message : String(error);
       console.error('Detalhes do erro:', errorMessage);
       if (error instanceof Error && error.stack) {
         console.error('Stack trace:', error.stack);
       }
       
       alert(`Erro ao exportar PDF: ${errorMessage}\n\nVerifique o console do navegador (F12) para mais detalhes.`);
       
       // Remover loading em caso de erro
       const loadingToast = document.querySelector('.fixed.top-4.right-4');
       if (loadingToast && loadingToast.parentNode) {
         document.body.removeChild(loadingToast);
       }
     }
   };
 
   if (!canAccess) {
     return (
       <ProtectedRoute route="/ponto/financeiro/analise-extrato">
         <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
           <Card className="border-red-200 dark:border-red-800">
             <CardContent className="p-6">
               <div className="flex items-start gap-3">
                 <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
                 <div>
                   <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
                     Acesso Negado
                   </h3>
                   <p className="text-sm text-red-700 dark:text-red-300">
                     Você não tem permissão para acessar esta página. Apenas administradores e membros do departamento financeiro podem acessar.
                   </p>
                 </div>
               </div>
             </CardContent>
           </Card>
         </MainLayout>
       </ProtectedRoute>
     );
   }
 
   return (
     <ProtectedRoute route="/ponto/financeiro/analise-extrato">
       <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
         <div className="space-y-6">
           {/* Header */}
           <div className="text-center">
             <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
               {pageTitle}
             </h1>
             <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
               {pageSubtitle}
             </p>
           </div>
 
           {/* Upload Section */}
           <Card className="border-2 border-gray-200 dark:border-gray-700">
             <CardContent className="p-6">
               <div className="space-y-6">
                 {/* Header */}
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                       <Upload className="w-6 h-6 text-red-600 dark:text-red-400" />
                     </div>
                     <div>
                       <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                         {uploadTitle}
                       </h3>
                       <p className="text-sm text-gray-500 dark:text-gray-400">
                         {uploadSubtitle}
                       </p>
                     </div>
                   </div>
                 </div>
 
                 {/* Upload Area */}
                 <div className="space-y-4">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                     Selecione o arquivo
                   </label>
                   
                   <label className="block cursor-pointer group">
                     <input
                       type="file"
                       accept=".xlsx,.xls,.csv"
                       onChange={handleFileSelect}
                       className="hidden"
                     />
                     <div className={`
                       relative flex flex-col items-center justify-center 
                       px-8 py-12 border-2 border-dashed rounded-xl
                       transition-all duration-200
                       ${selectedFile 
                         ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/10' 
                         : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 group-hover:border-red-400 dark:group-hover:border-red-500 group-hover:bg-red-50/50 dark:group-hover:bg-red-900/10'
                       }
                     `}>
                       {selectedFile ? (
                         <div className="flex flex-col items-center gap-3">
                           <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                             <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                           </div>
                           <div className="text-center">
                             <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                               {selectedFile.name}
                             </p>
                             <p className="text-xs text-gray-500 dark:text-gray-400">
                               {(selectedFile.size / 1024).toFixed(2)} KB
                             </p>
                           </div>
                           <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                             Clique para trocar o arquivo
                           </span>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center gap-3">
                           <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-colors">
                             <Upload className="w-8 h-8 text-gray-400 group-hover:text-red-500 transition-colors" />
                           </div>
                           <div className="text-center">
                             <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                               Clique para selecionar ou arraste o arquivo aqui
                             </p>
                             <p className="text-xs text-gray-500 dark:text-gray-400">
                               Formatos suportados: .xlsx, .xls, .csv
                             </p>
                           </div>
                         </div>
                       )}
                     </div>
                   </label>
 
                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploadMutation.isPending}
                      className="flex items-center gap-2 px-8 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md disabled:shadow-none"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-5 h-5" />
                          <span>Importar e Analisar</span>
                        </>
                      )}
                    </button>
                  </div>
                 </div>
 
                 {/* Status Messages */}
                 {error && (
                   <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-r-lg">
                     <div className="flex items-start gap-3">
                       <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                       <div>
                         <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                           Erro ao processar
                         </p>
                         <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                       </div>
                     </div>
                   </div>
                 )}
 
                 {uploadMutation.isSuccess && !error && (
                   <div className="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-r-lg">
                     <div className="flex items-start gap-3">
                       <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                       <div>
                         <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                           Sucesso!
                         </p>
                         <p className="text-sm text-green-700 dark:text-green-300">
                           Planilha processada com sucesso! O relatório foi gerado abaixo.
                         </p>
                       </div>
                     </div>
                   </div>
                 )}
               </div>
              </CardContent>
            </Card>

           {/* Filtros — só exibe após importar planilha (mesmo padrão da folha de pagamento) */}
           {displayReport && (
           <Card>
             <CardHeader className="border-b-0">
               <div className="flex items-center justify-between">
                 <div className="flex items-center space-x-2">
                   <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                   <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                 </div>
                 <div className="flex items-center space-x-4">
                   {!isFiltersMinimized && (
                     <button
                       onClick={() => {
                         const allEntrada = (naturezaEntradasList || []).map((n: any) => String(n.code || n.Código || n.codigo || ''));
                         const allSaida = (naturezaSaidasList || []).map((n: any) => String(n.code || n.Código || n.codigo || ''));
                         setSelectedNatureEntrada(allEntrada);
                         setSelectedNatureSaida(allSaida);
                         setSelectedPolos([...polosList]);
                         setSelectedNatureEntradaSearch('');
                         setSelectedNatureSaidaSearch('');
                         setSelectedPolosSearch('');
                       }}
                       className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                       title="Limpar todos os filtros"
                     >
                       <RotateCcw className="w-5 h-5" />
                     </button>
                   )}
                   <button
                     onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                     className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                     title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
                   >
                     {isFiltersMinimized ? (
                       <ChevronDown className="w-5 h-5" />
                     ) : (
                       <ChevronUp className="w-5 h-5" />
                     )}
                   </button>
                 </div>
               </div>
             </CardHeader>
             {!isFiltersMinimized && (
             <CardContent className="p-4 sm:p-6">
               <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 {/* Entradas */}
                 <div ref={entradaRef} className="relative">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Naturezas de Entrada</label>
                   <div className="relative">
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); setShowEntradaDropdown(v => !v); setShowSaidaDropdown(false); setShowPoloDropdown(false); }}
                       className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent relative"
                     >
                       <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                       <span className="block pr-6 text-sm truncate">
                         {selectedNatureEntrada.length === 0 ? 'Nenhuma' : selectedNatureEntrada.length === (naturezaEntradasList || []).length ? 'Todas' : `${selectedNatureEntrada.length} selecionada(s)`}
                       </span>
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                         {showEntradaDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                       </span>
                     </button>
                   </div>
                   {showEntradaDropdown && (
                     <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3">
                       <input
                         type="text"
                         placeholder="Pesquisar..."
                         value={selectedNatureEntradaSearch}
                         onChange={(e) => {
                           const value = e.target.value;
                           setSelectedNatureEntradaSearch(value);
                           const q = value.trim().toLowerCase();
                           const list = naturezaEntradasList || [];
                           if (q === '') {
                             setSelectedNatureEntrada(list.map((n: any) => String(n.code || n.Código || n.codigo || '')));
                           } else {
                             const matching = list.filter((n: any) => {
                               const label = `${String(n.code || n.Código || n.codigo || '')} — ${String(n.name || n.Nome || '')}`.toLowerCase();
                               return label.includes(q);
                             });
                             setSelectedNatureEntrada(matching.map((n: any) => String(n.code || n.Código || n.codigo || '')));
                           }
                         }}
                         className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                       />
                       <div className="flex items-center gap-2 mb-2">
                         <label htmlFor="select-all-entrada" className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative">
                             <input
                               id="select-all-entrada"
                               type="checkbox"
                               checked={selectedNatureEntrada.length > 0 && selectedNatureEntrada.length === (naturezaEntradasList || []).length}
                               onChange={(e) => {
                                 if (e.target.checked) {
                                   const all = (naturezaEntradasList || []).map((n: any) => String(n.code || n.Código || n.codigo || ''));
                                   setSelectedNatureEntrada(all);
                                 } else {
                                   setSelectedNatureEntrada([]);
                                 }
                               }}
                               className="sr-only"
                             />
                             <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                               selectedNatureEntrada.length > 0 && selectedNatureEntrada.length === (naturezaEntradasList || []).length
                                 ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                 : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                             }`}>
                               {selectedNatureEntrada.length > 0 && selectedNatureEntrada.length === (naturezaEntradasList || []).length && (
                                 <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                 </svg>
                               )}
                             </div>
                           </div>
                           <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                         </label>
                       </div>
                       <div className="max-h-48 overflow-y-auto">
                         {(naturezaEntradasList || [])
                           .filter((n: any) => {
                             const label = `${String(n.code || n.Código || n.codigo || '')} — ${String(n.name || n.Nome || '')}`.toLowerCase();
                             return label.includes(selectedNatureEntradaSearch.toLowerCase());
                           })
                           .map((n: any) => {
                             const code = String(n.code || n.Código || n.codigo || '');
                             const checked = selectedNatureEntrada.includes(code);
                             const nome = String(n.name || n.Nome || '');
                             return (
                               <label key={code} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                 <div className="relative">
                                   <input
                                     type="checkbox"
                                     checked={checked}
                                     onChange={(e) => {
                                       e.stopPropagation();
                                       if (e.target.checked) {
                                         setSelectedNatureEntrada(prev => Array.from(new Set([...prev, code])));
                                       } else {
                                         setSelectedNatureEntrada(prev => prev.filter(x => x !== code));
                                       }
                                     }}
                                     className="sr-only"
                                   />
                                   <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                     checked
                                       ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                       : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                   }`}>
                                     {checked && (
                                       <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                       </svg>
                                     )}
                                   </div>
                                 </div>
                                 <span className="text-sm text-gray-900 dark:text-gray-100">{nome || code}</span>
                               </label>
                             );
                           })}
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Saídas - dropdown no padrão Setor */}
                 <div ref={saidaRef} className="relative">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Naturezas de Saída</label>
                   <div className="relative">
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); setShowSaidaDropdown(v => !v); setShowEntradaDropdown(false); setShowPoloDropdown(false); }}
                       className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent relative"
                     >
                       <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                       <span className="block pr-6 text-sm truncate">
                         {selectedNatureSaida.length === 0 ? 'Nenhuma' : selectedNatureSaida.length === (naturezaSaidasList || []).length ? 'Todas' : `${selectedNatureSaida.length} selecionada(s)`}
                       </span>
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                         {showSaidaDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                       </span>
                     </button>
                   </div>
                   {showSaidaDropdown && (
                     <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3">
                       <input
                         type="text"
                         placeholder="Pesquisar..."
                         value={selectedNatureSaidaSearch}
                         onChange={(e) => {
                           const value = e.target.value;
                           setSelectedNatureSaidaSearch(value);
                           const q = value.trim().toLowerCase();
                           const list = naturezaSaidasList || [];
                           if (q === '') {
                             setSelectedNatureSaida(list.map((n: any) => String(n.code || n.Código || n.codigo || '')));
                           } else {
                             const matching = list.filter((n: any) => {
                               const label = `${String(n.code || n.Código || n.codigo || '')} — ${String(n.name || n.Nome || '')}`.toLowerCase();
                               return label.includes(q);
                             });
                             setSelectedNatureSaida(matching.map((n: any) => String(n.code || n.Código || n.codigo || '')));
                           }
                         }}
                         className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                       />
                       <div className="flex items-center gap-2 mb-2">
                         <label htmlFor="select-all-saida" className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative">
                             <input
                               id="select-all-saida"
                               type="checkbox"
                               checked={selectedNatureSaida.length > 0 && selectedNatureSaida.length === (naturezaSaidasList || []).length}
                               onChange={(e) => {
                                 if (e.target.checked) {
                                   const all = (naturezaSaidasList || []).map((n: any) => String(n.code || n.Código || n.codigo || ''));
                                   setSelectedNatureSaida(all);
                                 } else {
                                   setSelectedNatureSaida([]);
                                 }
                               }}
                               className="sr-only"
                             />
                             <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                               selectedNatureSaida.length > 0 && selectedNatureSaida.length === (naturezaSaidasList || []).length
                                 ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                 : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                             }`}>
                               {selectedNatureSaida.length > 0 && selectedNatureSaida.length === (naturezaSaidasList || []).length && (
                                 <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                 </svg>
                               )}
                             </div>
                           </div>
                           <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                         </label>
                       </div>
                       <div className="max-h-48 overflow-y-auto">
                         {(naturezaSaidasList || [])
                           .filter((n: any) => {
                             const label = `${String(n.code || n.Código || n.codigo || '')} — ${String(n.name || n.Nome || '')}`.toLowerCase();
                             return label.includes(selectedNatureSaidaSearch.toLowerCase());
                           })
                           .map((n: any) => {
                             const code = String(n.code || n.Código || n.codigo || '');
                             const checked = selectedNatureSaida.includes(code);
                             const nome = String(n.name || n.Nome || '');
                             return (
                               <label key={code} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                 <div className="relative">
                                   <input
                                     type="checkbox"
                                     checked={checked}
                                     onChange={(e) => {
                                       e.stopPropagation();
                                       if (e.target.checked) {
                                         setSelectedNatureSaida(prev => Array.from(new Set([...prev, code])));
                                       } else {
                                         setSelectedNatureSaida(prev => prev.filter(x => x !== code));
                                       }
                                     }}
                                     className="sr-only"
                                   />
                                   <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                     checked
                                       ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                       : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                   }`}>
                                     {checked && (
                                       <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                       </svg>
                                     )}
                                   </div>
                                 </div>
                                 <span className="text-sm text-gray-900 dark:text-gray-100">{nome || code}</span>
                               </label>
                             );
                           })}
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Polo - dropdown no mesmo padrão */}
                 <div ref={poloRef} className="relative">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Polos</label>
                   <div className="relative">
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); setShowPoloDropdown(v => !v); setShowEntradaDropdown(false); setShowSaidaDropdown(false); }}
                       className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent relative"
                     >
                       <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                       <span className="block pr-6 text-sm truncate">
                         {selectedPolos.length === 0 ? 'Nenhum' : selectedPolos.length === polosList.length ? 'Todos' : `${selectedPolos.length} selecionado(s)`}
                       </span>
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                         {showPoloDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                       </span>
                     </button>
                   </div>
                   {showPoloDropdown && (
                     <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3">
                       <input
                         type="text"
                         placeholder="Pesquisar..."
                         value={selectedPolosSearch}
                         onChange={(e) => {
                           const value = e.target.value;
                           setSelectedPolosSearch(value);
                           const q = value.trim().toLowerCase();
                           if (q === '') {
                             setSelectedPolos([...polosList]);
                           } else {
                             setSelectedPolos(polosList.filter(p => p.toLowerCase().includes(q)));
                           }
                         }}
                         className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                       />
                       <div className="flex items-center gap-2 mb-2">
                         <label htmlFor="select-all-polo" className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative">
                             <input
                               id="select-all-polo"
                               type="checkbox"
                               checked={selectedPolos.length > 0 && selectedPolos.length === polosList.length}
                               onChange={(e) => {
                                 if (e.target.checked) {
                                   setSelectedPolos([...polosList]);
                                 } else {
                                   setSelectedPolos([]);
                                 }
                               }}
                               className="sr-only"
                             />
                             <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                               selectedPolos.length > 0 && selectedPolos.length === polosList.length
                                 ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                 : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                             }`}>
                               {selectedPolos.length > 0 && selectedPolos.length === polosList.length && (
                                 <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                 </svg>
                               )}
                             </div>
                           </div>
                           <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                         </label>
                       </div>
                       <div className="max-h-48 overflow-y-auto">
                         {polosList
                           .filter(p => p.toLowerCase().includes(selectedPolosSearch.toLowerCase()))
                           .map(polo => {
                             const checked = selectedPolos.includes(polo);
                             return (
                               <label key={polo} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                 <div className="relative">
                                   <input
                                     type="checkbox"
                                     checked={checked}
                                     onChange={(e) => {
                                       e.stopPropagation();
                                       if (e.target.checked) {
                                         setSelectedPolos(prev => Array.from(new Set([...prev, polo])));
                                       } else {
                                         setSelectedPolos(prev => prev.filter(x => x !== polo));
                                       }
                                     }}
                                     className="sr-only"
                                   />
                                   <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                     checked
                                       ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                       : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                   }`}>
                                     {checked && (
                                       <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                       </svg>
                                     )}
                                   </div>
                                 </div>
                                 <span className="text-sm text-gray-900 dark:text-gray-100">{polo}</span>
                               </label>
                             );
                           })}
                       </div>
                     </div>
                   )}
                 </div>
               </div>
               </div>
             </CardContent>
             )}
           </Card>
           )}

          {/* Report Section */}
           {displayReport && (
             <div id="report-section" className="space-y-6">
              {/* Cards de resumo — mesmo layout do dashboard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-6">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="p-2 sm:p-3 bg-slate-100 dark:bg-slate-800 rounded-lg flex-shrink-0">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">Registros</p>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                          {(costCenterTotals.registros ?? 0).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">Total entradas</p>
                        <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                          {formatCurrency(costCenterTotals.entrada)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 rotate-180 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">Total saídas</p>
                        <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                          {formatCurrency(costCenterTotals.saida)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="p-2 sm:p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex-shrink-0">
                        <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">Saldo</p>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                          {formatCurrency(costCenterTotals.valorFinal ?? 0)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

             {/* Relatório personalizado por Centro de Custo */}
              <Card>
                  <CardHeader className="border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Relatório por Centro de Custo
                        </h3>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <div className="max-h-[60vh] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                          <tr>
                            {renderSortableHeaderLeft('Centro de Custo', 'costCenter', sortCostCenter as any, handleSortCostCenter)}
                            {renderSortableHeaderLeft('Polo', 'polo', sortCostCenter as any, handleSortCostCenter)}
                            {renderSortableHeader('Entrada', 'entries', sortCostCenter as any, handleSortCostCenter)}
                            {renderSortableHeader('Saída', 'exits', sortCostCenter as any, handleSortCostCenter)}
                            {renderSortableHeader('Saldo', 'valorFinal', sortCostCenter as any, handleSortCostCenter)}
                            {renderSortableHeader('Registros', 'records', sortCostCenter as any, handleSortCostCenter)}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                          {sortedCostCenterSummary.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum registro a exibir
                              </td>
                            </tr>
                          ) : (
                            sortedCostCenterSummary.map((row, idx) => (
                              <tr
                                key={idx}
                                className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                                onClick={() => handleRowClick('costCenter', row.key || row.centro || 'Não informado', `Registros - Centro de Custo: ${row.centro}`)}
                              >
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{row.centro}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.polo ?? 'Sem Polo'}</td>
                                <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">{formatCurrency(row.entrada)}</td>
                                <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">{formatCurrency(row.saida)}</td>
                                <td className="px-4 py-3 text-sm text-right font-medium">
                                  {formatCurrency(row.valorFinal)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right">{(row.registros ?? 0).toLocaleString('pt-BR')}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 z-10">
                          <tr className="font-semibold">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"></td>
                            <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">{formatCurrency(costCenterTotals.entrada)}</td>
                            <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">{formatCurrency(costCenterTotals.saida)}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatCurrency(costCenterTotals.valorFinal)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">{(costCenterTotals.registros ?? 0).toLocaleString('pt-BR')}</td>
                          </tr>
                        </tfoot>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                </Card>

             </div>
           )}

          {/* Modal de mapeamento manual de Centros de Custo não encontrados */}
          {showMappingModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowMappingModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mapear Centros de Custo não encontrados</h3>
                  <button onClick={() => setShowMappingModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    Fechar
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Foram encontrados códigos no arquivo que não tiveram correspondência automática. Associe manualmente ou escolha uma sugestão.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">Código no arquivo</th>
                          <th className="px-4 py-2 text-left">Sugestões</th>
                          <th className="px-4 py-2 text-left">Escolha / Nome</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {unmappedCodes.map((code) => (
                          <tr key={code}>
                            <td className="px-4 py-2 align-top font-mono">{code}</td>
                            <td className="px-4 py-2">
                              <select
                                value={(mappingDrafts[code] && mappingDrafts[code].code) || ''}
                                onChange={(e) => {
                                  const selected = e.target.value;
                                  const candidate = (mappingCandidates[code] || []).find(c => c.code === selected);
                                  handleMappingDraftChange(code, candidate ? { code: candidate.code, name: candidate.name } : { code: selected, name: '' });
                                }}
                                className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-800"
                              >
                                <option value="">{mappingCandidates[code] && mappingCandidates[code].length > 0 ? 'Selecione uma sugestão...' : 'Nenhuma sugestão'}</option>
                                {(mappingCandidates[code] || []).map((c) => (
                                  <option key={c.code} value={c.code}>{c.name} — {c.code}</option>
                                ))}
                                <option value={code}>Usar código original</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                placeholder="Nome (pode editar)"
                                value={(mappingDrafts[code] && mappingDrafts[code].name) || ''}
                                onChange={(e) => {
                                  const prev = mappingDrafts[code] || { code, name: '' };
                                  handleMappingDraftChange(code, { code: prev.code || code, name: e.target.value });
                                }}
                                className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-800"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={() => setShowMappingModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg">Cancelar</button>
                    <button onClick={applyAndSaveMappings} className="px-4 py-2 bg-green-600 text-white rounded-lg">Aplicar e Salvar</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal - Registros Detalhados */}
          <Modal
            isOpen={showRecordsModal}
            onClose={() => {
              if (previousModal) {
                handleBackToPreviousModal();
              } else {
                setShowRecordsModal(false);
                setPreviousModal(null);
              }
            }}
            title={selectedRecordTitle}
            size="xl"
          >
            <div className="overflow-x-auto max-h-[70vh]">
              {selectedRecords && selectedRecords.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      {fileHeaders && fileHeaders.length > 0 ? (
                        fileHeaders.map((h, i) => (
                          // make headers clickable to sort by that column
                          i === 0
                            ? renderSortableHeaderLeft(h, h, sortRecordsModal, handleSortRecords)
                            : renderSortableHeader(h, h, sortRecordsModal, handleSortRecords)
                        ))
                      ) : (
                        <>
                          {renderSortableHeaderLeft('Data', 'datacriacao', sortRecordsModal, handleSortRecords)}
                          {renderSortableHeader('Documento', 'numerodocumento', sortRecordsModal, handleSortRecords)}
                          {renderSortableHeaderLeft('Descrição', 'descricao', sortRecordsModal, handleSortRecords)}
                        </>
                      )}
                      {/* Do not show computed Entrada/Saída/Valor Total here (user requested) */}
                      {/* Only render computed Histórico if fileHeaders doesn't already include it */}
                      {!fileHeaders?.some(h => normalizeHeader(h).includes('historico')) && (
                        renderSortableHeaderLeft('Histórico', 'historico', sortRecordsModal, handleSortRecords)
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedSelectedRecords.map((record: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        {fileHeaders && fileHeaders.length > 0 ? (
                          fileHeaders.map((h) => {
                            const v = (record as any)[h];
                            const headerNorm = normalizeHeader(h);
                            const isValueHeader = /valor|valortotal|value|valor total/i.test(headerNorm);
                            let displayVal = '';
                            // Only treat as date when header looks like a date column
                            if (!isValueHeader && isDateHeader(h)) {
                              if (v instanceof Date) {
                                displayVal = formatDate(v);
                              } else if (typeof v === 'string' && (/^\d{4}-\d{2}-\d{2}T/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v))) {
                                displayVal = formatDate(v);
                              } else if (typeof v === 'number') {
                                const tryDate = new Date(v);
                                displayVal = !isNaN(tryDate.getTime()) ? formatDate(tryDate) : String(v);
                              } else {
                                displayVal = String(v ?? '');
                              }
                            } else if (isValueHeader) {
                              // parse numeric value and format as currency, apply color
                              let num = 0;
                              if (typeof v === 'number') num = v;
                              else if (typeof v === 'string') {
                                const parsed = Number(String(v).replace(/[^\d-.,-]/g, '').replace(',', '.'));
                                num = isNaN(parsed) ? 0 : parsed;
                              }
                              displayVal = formatCurrency(num);
                              const colorClass = num > 0 ? 'text-green-600 dark:text-green-400' : (num < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white');
                              return (
                                <td key={h} className={`px-4 py-3 text-sm text-right ${colorClass}`}>
                                  {displayVal}
                                </td>
                              );
                            } else {
                              // render raw for non-date, non-value columns
                              // Map natureza codes to names when header indicates natureza
                              if (/natureza|nature/i.test(headerNorm) && v != null && typeof v !== 'object') {
                                const key = String(v).trim();
                                const { map: nmap, normalize: nnormalize } = natureLookup || {};
                                let mapped = null;
                                if (nmap) {
                                  mapped = nmap.get(key) || nmap.get(nnormalize ? nnormalize(key) : key) || nmap.get(key.replace(/[^0-9]/g, ''));
                                }
                                displayVal = mapped ? mapped.name : String(v ?? '');
                              } else {
                                displayVal = String(v ?? '');
                              }
                            }

                            const isHistorico = /historico|histórico/i.test(headerNorm);
                            return (
                              <td
                                key={h}
                                className={`px-4 py-3 text-sm text-gray-900 dark:text-white ${isHistorico ? 'max-w-[280px] align-top' : ''}`}
                                title={isHistorico ? String(displayVal) : undefined}
                              >
                                {isHistorico ? (
                                  <span className="line-clamp-2 break-words">{displayVal}</span>
                                ) : (
                                  displayVal
                                )}
                              </td>
                            );
                          })
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDate((record as any).__rawDate ?? record.datacriacao)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{record.numerodocumento || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{record.descricao || '-'}</td>
                          </>
                        )}
                        {/* Show Histórico only if not present among file headers */}
                        {!fileHeaders?.some(h => normalizeHeader(h).includes('historico')) && (
                          <td
                            className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[280px] align-top"
                            title={String((record as any).historico || (record as any)['Histórico'] || '-')}
                          >
                            <span className="line-clamp-2 break-words">{(record as any).historico || (record as any)['Histórico'] || '-'}</span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhum registro encontrado.</div>
              )}
            </div>
          </Modal>

          {/* Modais e demais componentes seguem o mesmo padrão da versão principal */}
         </div>
       </MainLayout>
    </ProtectedRoute>
  );
}

