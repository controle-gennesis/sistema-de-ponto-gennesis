'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Users, Search, AlertTriangle, X, Clock, Calendar, User, Download, Edit, Save, Filter, Camera, FileCheck, Eye, Plus, ChevronDown, ChevronUp, CheckCircle, RotateCcw, Upload, FileSpreadsheet, Loader2, MoreVertical, DoorOpen, DoorClosed, Utensils, UtensilsCrossed } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TOMADORES_LIST } from '@/constants/tomadores';
import { 
  DEPARTMENTS_LIST,
  COMPANIES_LIST,
  MODALITIES_LIST,
  COST_CENTERS_LIST,
  CLIENTS_LIST,
  POLOS_LIST,
  CATEGORIAS_FINANCEIRAS_LIST
} from '@/constants/payrollFilters';
import { CARGOS_LIST } from '@/constants/cargos';
import { AdjustmentsList } from './AdjustmentsList';
import { AdjustmentForm } from './AdjustmentForm';
import { DiscountsList } from './DiscountsList';
import { DiscountForm } from './DiscountForm';
import { EditEmployeeForm } from './EditEmployeeForm';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { SalaryAdjustment, CreateAdjustmentData, UpdateAdjustmentData, SalaryDiscount, CreateDiscountData, UpdateDiscountData } from '@/types';
import toast from 'react-hot-toast';

interface Employee {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  isActive: boolean;
  employee?: {
    id: string;
    employeeId: string;
    department: string;
    position: string;
    hireDate: string;
    birthDate?: string;
    salary: number;
    isRemote: boolean;
    workSchedule: any;
    costCenter?: string;
    client?: string;
    dailyFoodVoucher?: number;
    dailyTransportVoucher?: number;
    company?: string;
    bank?: string;
    accountType?: string;
    agency?: string;
    operation?: string;
    account?: string;
    digit?: string;
    pixKeyType?: string;
    pixKey?: string;
    // Novos campos - Modalidade e Adicionais
    modality?: string;
    familySalary?: number;
    dangerPay?: number;
    unhealthyPay?: number;
    // Novos campos - Polo e Categoria Financeira
    polo?: string;
    categoriaFinanceira?: string;
  };
}

interface EmployeeListProps {
  userRole: string;
  showDeleteButton?: boolean;
}

export function EmployeeList({ userRole, showDeleteButton = true }: EmployeeListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [reactivateConfirm, setReactivateConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [poloFilter, setPoloFilter] = useState<string>('all');
  const [categoriaFinanceiraFilter, setCategoriaFinanceiraFilter] = useState<string>('all');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [deleteRecordConfirm, setDeleteRecordConfirm] = useState<string | null>(null);
  const [viewingCertificate, setViewingCertificate] = useState<string | null>(null);
  const [openRecordMenu, setOpenRecordMenu] = useState<string | null>(null);
  const [showAddAdjustmentForm, setShowAddAdjustmentForm] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<SalaryAdjustment | null>(null);
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  const [isAdjustmentsMinimized, setIsAdjustmentsMinimized] = useState(true);
  const [showAddDiscountForm, setShowAddDiscountForm] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<SalaryDiscount | null>(null);
  const [discounts, setDiscounts] = useState<SalaryDiscount[]>([]);
  const [isDiscountsMinimized, setIsDiscountsMinimized] = useState(true);
  // Aba do modal de detalhes: 'info' | 'remuneration' | 'records'
  const [detailsTab, setDetailsTab] = useState<'info' | 'remuneration' | 'records'>('info');
  const [editForm, setEditForm] = useState<{
    type: string;
    timestamp: string;
    reason: string;
    observation: string;
  }>({
    type: '',
    timestamp: '',
    reason: '',
    observation: ''
  });
  
  // Estados para edição de funcionário
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editVisibleSections, setEditVisibleSections] = useState<Array<'personal'|'professional'|'bank'|'remuneration'>|undefined>(undefined);
  
  // Estados para criar ponto manualmente
  const [showManualPointModal, setShowManualPointModal] = useState(false);
  const [manualPointData, setManualPointData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '07:00',
    type: 'ENTRY',
    observation: ''
  });

  // Estados para importar pontos
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRecords, setParsedRecords] = useState<Array<{date: string; time: string; type: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT'; observation?: string}>>([]);
  const [isParsing, setIsParsing] = useState(false);

  const queryClient = useQueryClient();

  // Listas de opções para filtros
  const departments = ['Todos', ...DEPARTMENTS_LIST];

  const positions = ['Todos', ...CARGOS_LIST];

  const costCenters = ['Todos', ...COST_CENTERS_LIST];

  const clients = ['Todos', ...CLIENTS_LIST];

  // Função para agrupar registros por dia
  const groupRecordsByDay = (records: any[]) => {
    const grouped = records.reduce((acc: Record<string, any[]>, record: any) => {
      const date = new Date(record.timestamp).toLocaleDateString('pt-BR');
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(record);
      return acc;
    }, {} as Record<string, any[]>);

    // Ordenar registros dentro de cada dia por tipo e timestamp
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a: any, b: any) => {
        // Definir ordem de prioridade dos tipos
        const typeOrder = {
          'ENTRY': 1,
          'LUNCH_START': 2,
          'LUNCH_END': 3,
          'EXIT': 4
        };
        
        const aOrder = typeOrder[a.type as keyof typeof typeOrder] || 999;
        const bOrder = typeOrder[b.type as keyof typeof typeOrder] || 999;
        
        // Se os tipos são diferentes, ordenar por tipo
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        
        // Se os tipos são iguais, ordenar por timestamp
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
    });

    return grouped;
  };

  // Função para exportar registros como XLSX
  const exportToExcel = () => {
    if (!selectedEmployee || !employeeRecordsData?.data) return;

    const records = employeeRecordsData.data;
    const groupedRecords = groupRecordsByDay(records);

    // Preparar dados para exportação
    const exportData = [];
    
    // Cabeçalho com informações do funcionário
    exportData.push(['INFORMAÇÕES DO FUNCIONÁRIO']);
    exportData.push(['Nome:', selectedEmployee.name]);
    exportData.push(['Email:', selectedEmployee.email]);
    exportData.push(['CPF:', selectedEmployee.cpf]);
    exportData.push(['Matrícula:', selectedEmployee.employee?.employeeId || 'N/A']);
    exportData.push(['Setor:', selectedEmployee.employee?.department || 'N/A']);
    exportData.push(['Cargo:', selectedEmployee.employee?.position || 'N/A']);
    exportData.push(['Data de Admissão:', selectedEmployee.employee?.hireDate ? 
      new Date(selectedEmployee.employee.hireDate).toLocaleDateString('pt-BR') : 'N/A']);
    exportData.push(['Centro de Custo:', selectedEmployee.employee?.costCenter || 'N/A']);
    exportData.push(['Tomador:', selectedEmployee.employee?.client || 'N/A']);
    exportData.push(['Período:', `${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`]);
    exportData.push(['']); // Linha em branco

    // Cabeçalho dos registros
    exportData.push([
      'Data',
      'Entrada',
      'Almoço',
      'Retorno',
      'Saída',
      'Motivo de Alterações'
    ]);

    // Dados agrupados por dia - ordenar por data
    Object.entries(groupedRecords)
      .sort(([a], [b]) => {
        // Converter strings de data para objetos Date para ordenação correta
        const dateA = new Date(a.split('/').reverse().join('-'));
        const dateB = new Date(b.split('/').reverse().join('-'));
        return dateA.getTime() - dateB.getTime();
      })
      .forEach(([date, dayRecords]) => {
      const dayData = {
        date: date,
        entrada: '',
        almoco: '',
        retorno: '',
        saida: '',
        observacoes: [] as string[]
      };

      // Processar registros do dia
      dayRecords.forEach((record: any) => {
        const date = new Date(record.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const time = `${hours}:${minutes}:${seconds}`;

        switch (record.type) {
          case 'ENTRY':
            dayData.entrada = time;
            break;
          case 'LUNCH_START':
            dayData.almoco = time;
            break;
          case 'LUNCH_END':
            dayData.retorno = time;
            break;
          case 'EXIT':
            dayData.saida = time;
            break;
        }

        // Adicionar motivo de alterações se existirem (exceto localização registrada)
        if (record.reason && !record.reason.includes('Localização registrada')) {
          dayData.observacoes.push(`${time} - ${record.reason}`);
        }
      });

      // Adicionar linha do dia
      exportData.push([
        dayData.date,
        dayData.entrada,
        dayData.almoco,
        dayData.retorno,
        dayData.saida,
        dayData.observacoes.join('; ')
      ]);
    });

    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registros de Ponto');

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 12 }, // Data
      { wch: 10 }, // Entrada
      { wch: 12 }, // Início Almoço
      { wch: 12 }, // Fim Almoço
      { wch: 10 }, // Saída
      { wch: 40 }  // Motivo de Alterações
    ];

    // Estilizar cabeçalho do funcionário
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let row = 0; row <= 8; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
      if (!ws[cellRef]) ws[cellRef] = { v: '' };
      ws[cellRef].s = { font: { bold: true } };
    }

    // Estilizar cabeçalho dos registros
    const headerRow = 9;
    for (let col = 0; col <= 5; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRow, c: col });
      if (!ws[cellRef]) ws[cellRef] = { v: '' };
      ws[cellRef].s = { 
        font: { bold: true }, 
        fill: { fgColor: { rgb: "E3F2FD" } },
        alignment: { horizontal: "center" }
      };
    }

    // Gerar nome do arquivo
    const fileName = `registros_${selectedEmployee.name.replace(/\s+/g, '_')}_${selectedMonth.toString().padStart(2, '0')}_${selectedYear}.xlsx`;
    
    // Download
    XLSX.writeFile(wb, fileName);
  };

  // Buscar funcionários - buscar todos para filtrar no frontend
  const { data: employeesData, isLoading, error } = useQuery({
    queryKey: ['employees', statusFilter],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { 
          page: 1,
          limit: 10000, // Buscar muitos para filtrar no frontend
          status: statusFilter === 'all' ? 'all' : statusFilter
        }
      });
      return res.data;
    },
    enabled: true, // Permitir que todos os usuários vejam a lista
  });

  // Buscar registros de ponto do funcionário selecionado
  const { data: employeeRecordsData, isLoading: loadingRecords } = useQuery({
    queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear],
    enabled: !!selectedEmployee,
    queryFn: async () => {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      
      const res = await api.get('/time-records', {
        params: {
          userId: selectedEmployee?.id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          limit: 1000
        }
      });
      return res.data;
    }
  });

  // Deletar funcionário
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await api.delete(`/users/${employeeId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteConfirm(null);
      // Fechar modal de detalhes após desligar
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      console.error('Erro ao deletar funcionário:', error);
    }
  });

  // Reativar funcionário
  const reactivateEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await api.put(`/users/${employeeId}`, { isActive: true });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Atualizar estado local do selecionado para refletir reativação imediata
      setSelectedEmployee((prev: any) => prev ? { ...prev, isActive: true } : prev);
      setReactivateConfirm(null);
      // Fechar modal de detalhes após reativar
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      console.error('Erro ao reativar funcionário:', error);
    }
  });

  // Atualizar registro de ponto
  const updateRecordMutation = useMutation({
    mutationFn: async ({ recordId, data }: { recordId: string; data: any }) => {
      const res = await api.put(`/time-records/${recordId}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear] });
      setEditingRecord(null);
      setEditForm({ type: '', timestamp: '', reason: '', observation: '' } as any);
      toast.success('Registro atualizado com sucesso!');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Erro ao atualizar registro';
      toast.error(errorMessage);
    }
  });

  // Deletar registro de ponto
  const deleteRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const res = await api.delete(`/time-records/${recordId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear] });
      setDeleteRecordConfirm(null);
      toast.success('Registro removido com sucesso!');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Erro ao remover registro';
      toast.error(errorMessage);
    }
  });

  // Criar ponto manualmente
  const createManualPointMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/time-records/manual', {
        employeeId: selectedEmployee?.employee?.id,
        ...data
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear] });
      setShowManualPointModal(false);
      setManualPointData({
        date: new Date().toISOString().split('T')[0],
        time: '07:00',
        type: 'ENTRY',
        observation: ''
      });
      toast.success('Ponto criado com sucesso!');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Erro ao criar ponto';
      toast.error(errorMessage);
    }
  });

  // Importar pontos de planilha
  const importRecordsMutation = useMutation({
    mutationFn: async (records: Array<{date: string; time: string; type: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT'; observation?: string}>) => {
      const res = await api.post('/time-records/import', {
        employeeId: selectedEmployee?.employee?.id,
        records
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employee-records', selectedEmployee?.id, selectedMonth, selectedYear] });
      setShowImportModal(false);
      setSelectedFile(null);
      setParsedRecords([]);
      toast.success(data.data?.message || 'Pontos importados com sucesso!');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Erro ao importar pontos';
      toast.error(errorMessage);
    }
  });

  // Função para processar planilha
  const parseSpreadsheet = async () => {
    if (!selectedFile || !selectedEmployee?.employee?.id) {
      toast.error('Selecione um arquivo');
      return;
    }

    setIsParsing(true);
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];

      // Encontrar linha do cabeçalho
      let headerRow = -1;
      let diaCol = -1;
      let ent1Col = -1, sai1Col = -1;
      let ent2Col = -1, sai2Col = -1;

      for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toLowerCase().trim();
          if (cell === 'dia' || (cell.includes('dia') && !cell.includes('h.d') && !cell.includes('h.t'))) {
            diaCol = j;
            headerRow = i;
          }
          if (cell.includes('ent. 1') || cell.includes('ent1') || cell.includes('entrada 1')) {
            ent1Col = j;
          }
          if (cell.includes('sai. 1') || cell.includes('sai1') || cell.includes('saída 1')) {
            sai1Col = j;
          }
          if (cell.includes('ent. 2') || cell.includes('ent2') || cell.includes('entrada 2')) {
            ent2Col = j;
          }
          if (cell.includes('sai. 2') || cell.includes('sai2') || cell.includes('saída 2')) {
            sai2Col = j;
          }
        }
        if (diaCol !== -1 && (ent1Col !== -1 || sai1Col !== -1)) {
          break;
        }
      }

      if (diaCol === -1) {
        toast.error('Não foi possível encontrar a coluna "Dia" na planilha');
        setIsParsing(false);
        return;
      }

      const records: Array<{date: string; time: string; type: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT'; observation?: string}> = [];

      // Detectar ano
      let detectedYear = new Date().getFullYear();
      for (let i = jsonData.length - 1; i >= Math.max(0, jsonData.length - 10); i--) {
        const row = jsonData[i];
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '');
          const yearMatch = cell.match(/\b(20\d{2})\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            if (year >= 2020 && year <= 2100) {
              detectedYear = year;
              break;
            }
          }
        }
      }

      const getFormattedDate = (sheet: any, rowIndex: number, colIndex: number) => {
        try {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          const cell = sheet[cellAddress];
          if (cell && cell.w) {
            return cell.w;
          }
        } catch (e) {}
        return null;
      };

      // Processar linhas
      for (let i = headerRow + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const dia = row[diaCol];
        
        if (!dia || (typeof dia === 'string' && dia.trim() === '')) continue;

        const formattedDate = getFormattedDate(firstSheet, i, diaCol);
        let dateStr = '';
        
        const parseDateString = (dateValue: string): string => {
          const cleanedDate = dateValue.replace(/^(seg|ter|qua|qui|sex|sáb|dom|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*/i, '').trim();
          
          const fullDateMatch = cleanedDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (fullDateMatch) {
            const [, day, month, year] = fullDateMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          const shortDateMatch = cleanedDate.match(/(\d{1,2})\/(\d{1,2})/);
          if (shortDateMatch) {
            const [, day, month] = shortDateMatch;
            return `${detectedYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          return '';
        };

        if (formattedDate) {
          dateStr = parseDateString(formattedDate);
        }
        
        if (!dateStr) {
          if (typeof dia === 'string') {
            dateStr = parseDateString(dia);
          } else if (typeof dia === 'number') {
            const excelDate = XLSX.SSF.parse_date_code(dia);
            let year = excelDate.y;
            let month = excelDate.m;
            let day = excelDate.d;
            
            if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
              continue;
            }
            
            if (year < 2020) {
              year = detectedYear;
            }
            
            dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
        }

        if (!dateStr) {
          continue;
        }

        const dateParts = dateStr.split('-');
        if (dateParts.length !== 3) {
          continue;
        }
        const [year, month, day] = dateParts.map(Number);
        if (isNaN(year) || isNaN(month) || isNaN(day) || year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
          continue;
        }

        const rowAsString = row.join(' ').toLowerCase();
        if (rowAsString.includes('total') || 
            rowAsString.includes('saldo') || 
            rowAsString.includes('processado') ||
            rowAsString.includes('abonos') ||
            rowAsString.includes('descontos') ||
            rowAsString.includes('horas noturnas')) {
          continue;
        }

        const isValidTime = (timeCell: any): boolean => {
          if (!timeCell) return false;
          
          if (typeof timeCell === 'number') {
            return timeCell >= 0.04 && timeCell < 1.0;
          } else if (typeof timeCell === 'string') {
            const trimmed = timeCell.trim();
            if (!trimmed || trimmed === '-' || trimmed === '--' || trimmed === '--**' || trimmed === '**') return false;
            const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = parseInt(timeMatch[2]);
              return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
            }
            return false;
          }
          return false;
        };

        const hasValidTime = 
          (ent1Col !== -1 && isValidTime(row[ent1Col])) ||
          (sai1Col !== -1 && isValidTime(row[sai1Col])) ||
          (ent2Col !== -1 && isValidTime(row[ent2Col])) ||
          (sai2Col !== -1 && isValidTime(row[sai2Col]));

        if (!hasValidTime) {
          continue;
        }

        const processTime = (timeCell: any, type: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT') => {
          if (!timeCell) return;
          
          let timeStr = '';
          if (typeof timeCell === 'number') {
            if (timeCell < 0.0001) return;
            
            const totalSeconds = Math.floor(timeCell * 86400);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          } else if (typeof timeCell === 'string') {
            const trimmed = timeCell.trim();
            if (!trimmed || trimmed === '-' || trimmed === '--' || trimmed === '--**' || trimmed === '**') return;
            
            const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (timeMatch) {
              const [, hour, minute] = timeMatch;
              timeStr = `${hour.padStart(2, '0')}:${minute}`;
            }
          }

          if (timeStr) {
            records.push({
              date: dateStr,
              time: timeStr,
              type
            });
          }
        };

        if (ent1Col !== -1) {
          processTime(row[ent1Col], 'ENTRY');
        }
        if (sai1Col !== -1) {
          processTime(row[sai1Col], 'LUNCH_START');
        }
        if (ent2Col !== -1) {
          processTime(row[ent2Col], 'LUNCH_END');
        }
        if (sai2Col !== -1) {
          processTime(row[sai2Col], 'EXIT');
        }
      }

      if (records.length === 0) {
        toast.error('Nenhum registro de ponto encontrado na planilha');
        setIsParsing(false);
        return;
      }

      setParsedRecords(records);
      toast.success(`${records.length} registro(s) encontrado(s) na planilha`);
    } catch (error: any) {
      console.error('Erro ao processar planilha:', error);
      toast.error('Erro ao processar planilha: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setParsedRecords([]);
    }
  };

  // Buscar acréscimos do funcionário
  const { data: adjustmentsData } = useQuery({
    queryKey: ['salary-adjustments', selectedEmployee?.employee?.id],
    queryFn: async () => {
      if (!selectedEmployee?.employee?.id) return { data: [] };
      const res = await api.get(`/salary-adjustments/employee/${selectedEmployee.employee.id}`);
      return res.data;
    },
    enabled: !!selectedEmployee?.employee?.id
  });

  // Atualizar lista de acréscimos quando os dados mudarem
  React.useEffect(() => {
    if (adjustmentsData?.data) {
      setAdjustments(adjustmentsData.data);
    }
  }, [adjustmentsData]);

  // Criar acréscimo
  const createAdjustmentMutation = useMutation({
    mutationFn: async (data: CreateAdjustmentData) => {
      const res = await api.post('/salary-adjustments', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments', selectedEmployee?.employee?.id] });
      setShowAddAdjustmentForm(false);
    }
  });

  // Atualizar acréscimo
  const updateAdjustmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAdjustmentData }) => {
      const res = await api.put(`/salary-adjustments/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments', selectedEmployee?.employee?.id] });
      setEditingAdjustment(null);
    }
  });

  // Deletar acréscimo
  const deleteAdjustmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/salary-adjustments/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments', selectedEmployee?.employee?.id] });
    }
  });

  // Buscar descontos do funcionário
  const { data: discountsData } = useQuery({
    queryKey: ['salary-discounts', selectedEmployee?.employee?.id],
    queryFn: async () => {
      if (!selectedEmployee?.employee?.id) return { data: [] };
      const res = await api.get(`/salary-discounts/employee/${selectedEmployee.employee.id}`);
      return res.data;
    },
    enabled: !!selectedEmployee?.employee?.id
  });

  // Atualizar lista de descontos quando os dados mudarem
  React.useEffect(() => {
    if (discountsData?.data) {
      setDiscounts(discountsData.data);
    }
  }, [discountsData]);

  // Criar desconto
  const createDiscountMutation = useMutation({
    mutationFn: async (data: CreateDiscountData) => {
      const res = await api.post('/salary-discounts', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-discounts', selectedEmployee?.employee?.id] });
      setShowAddDiscountForm(false);
    }
  });

  // Atualizar desconto
  const updateDiscountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateDiscountData }) => {
      const res = await api.put(`/salary-discounts/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-discounts', selectedEmployee?.employee?.id] });
      setEditingDiscount(null);
    }
  });

  // Deletar desconto
  const deleteDiscountMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/salary-discounts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-discounts', selectedEmployee?.employee?.id] });
    }
  });

  const handleDelete = (employeeId: string) => {
    deleteEmployeeMutation.mutate(employeeId);
  };

  // Funções para edição de funcionário
  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setShowEditForm(true);
  };

  const handleCloseEditForm = () => {
    setEditingEmployee(null);
    setShowEditForm(false);
    setEditVisibleSections(undefined);
    // Forçar refetch dos dados para atualizar a lista e o funcionário selecionado
    queryClient.invalidateQueries({ queryKey: ['employees'], exact: false });
    queryClient.refetchQueries({ queryKey: ['employees'], exact: false });
    // Se houver um funcionário selecionado, atualizar também
    if (selectedEmployee) {
      queryClient.invalidateQueries({ queryKey: ['employee-records', selectedEmployee.id] });
    }
  };

  const handleEditRecord = (record: any) => {
    setEditingRecord(record.id);
    
    // Converter timestamp para formato local usando UTC (banco salva em UTC)
    const date = new Date(record.timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    setEditForm({
      type: record.type,
      timestamp: localTimestamp,
      reason: (record.reason && !record.reason.includes('Localização registrada')) ? record.reason : '',
      observation: record.observation || ''
    });
  };

  const handleSaveEdit = () => {
    if (editingRecord) {
      updateRecordMutation.mutate({
        recordId: editingRecord,
        data: editForm
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditForm({ type: '', timestamp: '', reason: '', observation: '' });
  };

  // Handlers para acréscimos salariais
  const handleAddAdjustment = (data: CreateAdjustmentData | UpdateAdjustmentData) => {
    if ('employeeId' in data) {
      // É CreateAdjustmentData
      createAdjustmentMutation.mutate(data as CreateAdjustmentData);
    } else {
      // É UpdateAdjustmentData
      if (editingAdjustment) {
        updateAdjustmentMutation.mutate({
          id: editingAdjustment.id,
          data: data as UpdateAdjustmentData
        });
      }
    }
  };

  const handleUpdateAdjustment = (data: UpdateAdjustmentData) => {
    if (editingAdjustment) {
      updateAdjustmentMutation.mutate({
        id: editingAdjustment.id,
        data
      });
    }
  };

  const handleDeleteAdjustment = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este acréscimo?')) {
      deleteAdjustmentMutation.mutate(id);
    }
  };

  const handleEditAdjustment = (adjustment: SalaryAdjustment) => {
    setEditingAdjustment(adjustment);
    setIsAdjustmentsMinimized(false);
  };

  // Funções para manipular descontos
  const handleAddDiscount = (data: CreateDiscountData | UpdateDiscountData) => {
    if ('employeeId' in data) {
      // É CreateDiscountData
      createDiscountMutation.mutate(data as CreateDiscountData);
    } else {
      // É UpdateDiscountData
      if (editingDiscount) {
        updateDiscountMutation.mutate({
          id: editingDiscount.id,
          data: data as UpdateDiscountData
        });
      }
    }
  };

  const handleUpdateDiscount = (data: UpdateDiscountData) => {
    if (editingDiscount) {
      updateDiscountMutation.mutate({
        id: editingDiscount.id,
        data
      });
    }
  };

  const handleEditDiscount = (discount: SalaryDiscount) => {
    setEditingDiscount(discount);
    setShowAddDiscountForm(false);
    setIsDiscountsMinimized(false);
  };

  const handleDeleteDiscount = (id: string) => {
    if (confirm('Tem certeza que deseja remover este desconto?')) {
      deleteDiscountMutation.mutate(id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const employees = employeesData?.data || [];
  // Listas com base em fontes globais
  const companies: string[] = ['Todos', ...COMPANIES_LIST];
  const polos: string[] = ['Todos', ...POLOS_LIST];
  const categoriasFinanceiras: string[] = ['Todos', ...CATEGORIAS_FINANCEIRAS_LIST];
  const modalities: string[] = ['Todos', ...MODALITIES_LIST];
  const pagination = employeesData?.pagination || { total: 0, totalPages: 0 };

  // Filtrar apenas funcionários (não RH/Admin) e por todos os filtros
  const filteredEmployees = useMemo(() => {
    if (!employees || employees.length === 0) {
      return [];
    }
    
    return employees.filter((emp: Employee) => {
      // Apenas funcionários (não RH/Admin)
      if (emp.role !== 'EMPLOYEE') return false;
      
      // Busca geral - verifica em todos os campos
      if (searchTerm.trim() !== '') {
        const searchLower = searchTerm.toLowerCase().trim();
        const searchNumbers = searchTerm.replace(/\D/g, '');
        
        const matchesSearch = 
          (emp.name || '').toLowerCase().includes(searchLower) ||
          (emp.email || '').toLowerCase().includes(searchLower) ||
          (emp.cpf && searchNumbers.length > 0 && emp.cpf.replace(/\D/g, '').includes(searchNumbers)) ||
          (emp.employee?.employeeId || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.department || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.position || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.company || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.polo || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.costCenter || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.client || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.categoriaFinanceira || '').toLowerCase().includes(searchLower) ||
          (emp.employee?.modality || '').toLowerCase().includes(searchLower);
        
        if (!matchesSearch) {
          return false;
        }
      }
      
      // Filtros específicos
      if (departmentFilter !== 'all' && 
          (!emp.employee?.department || !emp.employee.department.toLowerCase().includes(departmentFilter.toLowerCase()))) {
        return false;
      }
      
      if (positionFilter !== 'all' && 
          (!emp.employee?.position || !emp.employee.position.toLowerCase().includes(positionFilter.toLowerCase()))) {
        return false;
      }
      
      if (costCenterFilter !== 'all' && 
          (!emp.employee?.costCenter || !emp.employee.costCenter.toLowerCase().includes(costCenterFilter.toLowerCase()))) {
        return false;
      }
      
      if (clientFilter !== 'all' && 
          (!emp.employee?.client || !emp.employee.client.toLowerCase().includes(clientFilter.toLowerCase()))) {
        return false;
      }
      
      if (companyFilter !== 'all' && emp.employee?.company !== companyFilter) {
        return false;
      }
      
      if (poloFilter !== 'all' && emp.employee?.polo !== poloFilter) {
        return false;
      }
      
      if (categoriaFinanceiraFilter !== 'all' && emp.employee?.categoriaFinanceira !== categoriaFinanceiraFilter) {
        return false;
      }
      
      if (modalityFilter !== 'all' && emp.employee?.modality !== modalityFilter) {
        return false;
      }
      
      return true;
    }).sort((a: Employee, b: Employee) => {
      // Ordenação alfabética por nome
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    });
  }, [employees, searchTerm, departmentFilter, positionFilter, costCenterFilter, clientFilter, companyFilter, poloFilter, categoriaFinanceiraFilter, modalityFilter]);

  // Aplicar paginação nos funcionários filtrados
  const totalFiltered = filteredEmployees.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  // Calcular informações de paginação
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalFiltered);

  // Resetar página quando buscar
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Verificar se o usuário tem permissões administrativas baseadas no cargo
  const { canManageEmployees } = usePermissions();

  // Função para limpar todos os filtros
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('active');
    setDepartmentFilter('all');
    setPositionFilter('all');
    setCostCenterFilter('all');
    setClientFilter('all');
    setCompanyFilter('all');
    setPoloFilter('all');
    setCategoriaFinanceiraFilter('all');
    setModalityFilter('all');
    setCurrentPage(1);
  };

  return (
    <>
      {/* Card de Filtros - fora do card de gestão (mesmo padrão das outras telas) */}
      <Card className="mb-6">
        <CardHeader className="border-b-0 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
            </div>
            <div className="flex items-center space-x-4">
              {!isFiltersMinimized && (
                <>
                  <button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
                  </button>
                  <button
                    onClick={clearFilters}
                    className="flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                    title="Limpar todos os filtros"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </>
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
              {/* Filtro Principal - Busca Geral */}
              <div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Buscar Funcionário
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Digite nome, CPF, matrícula, setor, empresa ou qualquer informação..."
                      className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                </div>
              </div>

              {/* Filtros Avançados - Condicionais */}
              {showAdvancedFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros Específicos</h4>
                  </div>
                  
                  {/* Grupo 1: Informações Básicas */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Básicas</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor
                        </label>
                        <select
                          value={departmentFilter}
                          onChange={(e) => setDepartmentFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todos</option>
                          {departments.filter(d => d !== 'Todos').map((dept) => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <select
                          value={positionFilter}
                          onChange={(e) => setPositionFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todos</option>
                          {positions.filter(p => p !== 'Todos').map((pos) => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Empresa
                        </label>
                        <select
                          value={companyFilter}
                          onChange={(e) => setCompanyFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todas</option>
                          {companies.filter(c => c !== 'Todos').map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Polo
                        </label>
                        <select
                          value={poloFilter}
                          onChange={(e) => setPoloFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todos</option>
                          {polos.filter(p => p !== 'Todos').map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Status
                        </label>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="active">Ativos</option>
                          <option value="inactive">Inativos</option>
                          <option value="all">Todos</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Grupo 2: Informações Financeiras */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Financeiras</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Centro de Custo
                        </label>
                        <select
                          value={costCenterFilter}
                          onChange={(e) => setCostCenterFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todos</option>
                          {costCenters.filter(cc => cc !== 'Todos').map((center) => (
                            <option key={center} value={center}>{center}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tomador
                        </label>
                        <select
                          value={clientFilter}
                          onChange={(e) => setClientFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todos</option>
                          {clients.filter(c => c !== 'Todos').map((tomador) => (
                            <option key={tomador} value={tomador}>{tomador}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Categoria Financeira
                        </label>
                        <select
                          value={categoriaFinanceiraFilter}
                          onChange={(e) => setCategoriaFinanceiraFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todas</option>
                          {categoriasFinanceiras.filter(c => c !== 'Todos').map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Modalidade
                        </label>
                        <select
                          value={modalityFilter}
                          onChange={(e) => setModalityFilter(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        >
                          <option value="all">Todas</option>
                          {modalities.filter(m => m !== 'Todos').map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {canManageEmployees ? 'Gerenciar Funcionários' : 'Lista de Funcionários'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {canManageEmployees 
                  ? 'Visualizar e gerenciar funcionários cadastrados' 
                  : 'Visualizar funcionários cadastrados'
                }
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Busca e Filtros */}
        <div className="hidden">
          {/* Cabeçalho dos Filtros */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              </div>
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
          
          {/* Conteúdo dos Filtros */}
          {!isFiltersMinimized && (
          <div className="p-4">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar funcionários por nome, email ou CPF..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>
              
              {/* Filtros adicionais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Setor:</label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  >
                    <option value="all">Todos</option>
                    {departments.filter(d => d !== 'Todos').map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cargo:</label>
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  >
                    <option value="all">Todos</option>
                    {positions.filter(p => p !== 'Todos').map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Centro de Custo:</label>
                  <select
                    value={costCenterFilter}
                    onChange={(e) => setCostCenterFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  >
                    <option value="all">Todos</option>
                    {costCenters.filter(cc => cc !== 'Todos').map((center) => (
                      <option key={center} value={center}>{center}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tomador:</label>
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  >
                    <option value="all">Todos</option>
                    {clients.filter(c => c !== 'Todos').map((tomador) => (
                      <option key={tomador} value={tomador}>{tomador}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista de funcionários */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Carregando funcionários...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Nenhum funcionário encontrado</p>
          </div>
        ) : (
          <>
            {/* Informações de paginação */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Mostrando {startItem} a {endItem} de {totalFiltered} funcionários
              </span>
              <span>
                Página {currentPage} de {totalPages}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {paginatedEmployees.map((employee: Employee) => (
              <div
                key={employee.id}
                onClick={() => { setSelectedEmployee(employee); setDetailsTab('info'); }}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-600 cursor-pointer transition-all duration-300 transform hover:-translate-y-1"
                >
                  {/* Avatar com iniciais - Centralizado */}
                  <div className="flex flex-col items-center text-center mb-6 relative">
                    <div className="w-16 h-16 bg-transparent border-2 border-blue-500 dark:border-blue-400 rounded-full flex items-center justify-center mb-3">
                      <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">
                        {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    {/* Status indicator no canto superior direito */}
                    <div className={`absolute top-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${
                      employee.isActive ? 'bg-green-500' : 'bg-red-500'
                    }`} title={employee.isActive ? 'Ativo' : 'Inativo'} />
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{employee.name}</span>
                  </div>

                  {/* Informações do funcionário */}
                  {employee.employee && (
                    <>
                      {/* Informações organizadas */}
                      <div className="space-y-3 text-xs bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">CPF:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.cpf}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Setor:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.position}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Cargo:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.department}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Empresa:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.company}</span>
                        </div>
                        {employee.employee.polo && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Polo:</span>
                            <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.polo}</span>
                          </div>
                        )}
                        {employee.employee.categoriaFinanceira && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Categoria Financeira:</span>
                            <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.categoriaFinanceira}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Modalidade:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.modality}</span>
                        </div>
                            {employee.employee.costCenter && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Centro de Custo:</span>
                            <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.costCenter}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Tomador:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{employee.employee.client}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Admissão:</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{formatDate(employee.employee.hireDate)}</span>
                        </div>
                      </div>
                
                      {/* Ações removidas do card da lista conforme solicitação */}
                    </>
                )}
              </div>
            ))}
            </div>

            {/* Botões de paginação */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                
                {/* Números das páginas */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNumber = i + 1;
                  const isActive = pageNumber === currentPage;
                  
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}

        {/* Modal de confirmação de exclusão */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirmar Desligamento</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Esta ação não pode ser desfeita</p>
                  </div>
                </div>
                
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  Tem certeza que deseja desligar este funcionário? O funcionário será desativado e não poderá mais acessar o sistema.
                </p>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    disabled={deleteEmployeeMutation.isPending}
                    className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {deleteEmployeeMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Desligando...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Desligar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmação de admissão (reativar) */}
        {reactivateConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setReactivateConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirmar Reativação</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Deseja reativar este funcionário?</p>
                  </div>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  O funcionário voltará a ficar ativo e poderá acessar o sistema normalmente.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setReactivateConfirm(null)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => reactivateEmployeeMutation.mutate(reactivateConfirm)}
                    disabled={reactivateEmployeeMutation.isPending}
                    className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {reactivateEmployeeMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Reativando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Confirmar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de detalhes do funcionário */}
        {selectedEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedEmployee(null)} />
            <div className="relative w-full max-w-5xl mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden h-[85vh] overflow-y-auto">
              {/* Header + Abas fixos */}
              <div className="sticky top-0 z-20 bg-white dark:bg-gray-800">
                <div className="px-6 pt-6">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold">
                        {selectedEmployee.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{selectedEmployee.name}</h3>
                  </div>
                </div>
                    <div className="flex items-center gap-2">
                      {canManageEmployees && showDeleteButton && (
                        selectedEmployee.isActive ? (
                          <button
                            onClick={() => setDeleteConfirm(selectedEmployee.id)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                            title="Desligar funcionário"
                          >
                            Desligar
                          </button>
                        ) : (
                          <button
                            onClick={() => setReactivateConfirm(selectedEmployee.id)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"
                            title="Reativar funcionário"
                          >
                            Reativar
                          </button>
                        )
                      )}
                <button
                  onClick={() => setSelectedEmployee(null)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                    </div>
                  </div>
              </div>

                <div className="px-6 pt-4">
                  <div className="flex items-center gap-6 border-b border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => setDetailsTab('info')}
                      className={`pb-2 -mb-px text-sm transition-colors border-b-2 ${
                        detailsTab === 'info'
                          ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Informações
                    </button>
                    <button
                      onClick={() => setDetailsTab('remuneration')}
                      className={`pb-2 -mb-px text-sm transition-colors border-b-2 ${
                        detailsTab === 'remuneration'
                          ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Proventos e Descontos
                    </button>
                    <button
                      onClick={() => setDetailsTab('records')}
                      className={`pb-2 -mb-px text-sm transition-colors border-b-2 ${
                        detailsTab === 'records'
                          ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Registros de Ponto
                    </button>
                      </div>
                      </div>
                      </div>

              {/* Conteúdo em Cards */}
              <div className="p-6 space-y-6">
                {detailsTab === 'info' && (
                  <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card - Informações Pessoais */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dados Pessoais</h4>
                      {canManageEmployees && (
                        <button
                          onClick={() => {
                            setEditingEmployee(selectedEmployee);
                            setEditVisibleSections(['personal']);
                            setShowEditForm(true);
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          Editar
                        </button>
                      )}
                      </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Nome</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">CPF</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.cpf}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Email</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">{selectedEmployee.email}</div>
                      </div>
                      {selectedEmployee.employee?.employeeId && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Matrícula</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.employeeId}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.birthDate && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Nascimento</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(selectedEmployee.employee.birthDate)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card - Informações Profissionais */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dados Profissionais</h4>
                      {canManageEmployees && (
                        <button
                          onClick={() => {
                            setEditingEmployee(selectedEmployee);
                            setEditVisibleSections(['professional']);
                            setShowEditForm(true);
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          Editar
                        </button>
                      )}
                      </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Cargo</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.position || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Setor</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.department || '—'}</div>
                      </div>
                      {selectedEmployee.employee?.modality && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Modalidade</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.modality}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Admissão</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.hireDate ? formatDate(selectedEmployee.employee.hireDate) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Regime</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.isRemote ? 'Remoto' : 'Presencial'}</div>
                      </div>
                      {selectedEmployee.employee?.costCenter && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Centro de Custo</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.costCenter}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.client && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Tomador</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.client}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.company && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Empresa</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.company}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.polo && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Polo</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.polo}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.categoriaFinanceira && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Categoria Financeira</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.categoriaFinanceira}</div>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card - Dados Bancários */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dados Bancários</h4>
                      {canManageEmployees && (
                        <button
                          onClick={() => {
                            setEditingEmployee(selectedEmployee);
                            setEditVisibleSections(['bank']);
                            setShowEditForm(true);
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedEmployee.employee?.bank && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Banco</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.bank}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.accountType && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Tipo de Conta</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.accountType}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.agency && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Agência</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.agency}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.operation && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Operação</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.operation}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.account && (
                        <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Conta</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.account}</div>
                        </div>
                      )}
                      {selectedEmployee.employee?.digit && (
                        <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Dígito</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.digit}</div>
                        </div>
                      )}
                        {selectedEmployee.employee?.pixKeyType && (
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Tipo de Chave</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee.pixKeyType}</div>
                          </div>
                        )}
                        {selectedEmployee.employee?.pixKey && (
                        <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Chave PIX</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">{selectedEmployee.employee.pixKey}</div>
                          </div>
                        )}
                      </div>
                    </div>

                  {/* Card - Remuneração e Benefícios */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Valores e Adicionais</h4>
                    {canManageEmployees && (
                      <button
                        onClick={() => {
                          setEditingEmployee(selectedEmployee);
                          setEditVisibleSections(['remuneration']);
                          setShowEditForm(true);
                        }}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Linha 1: Salário | Periculosidade */}
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Salário</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.salary != null ? `R$ ${Number(selectedEmployee.employee.salary).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Periculosidade</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.dangerPay != null ? `${Number(selectedEmployee.employee.dangerPay)}%` : '—'}</div>
                      </div>
                      {/* Linha 2: VA Diário | Insalubridade */}
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">VA Diário</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.dailyFoodVoucher != null ? `R$ ${Number(selectedEmployee.employee.dailyFoodVoucher).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Insalubridade</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.unhealthyPay != null ? `${Number(selectedEmployee.employee.unhealthyPay)}%` : '—'}</div>
                      </div>
                      {/* Linha 3: VT Diário | vazio */}
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">VT Diário</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.dailyTransportVoucher != null ? `R$ ${Number(selectedEmployee.employee.dailyTransportVoucher).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
                      </div>
                      <div className="hidden sm:block" />
                      {/* Linha 4: Salário Família | vazio */}
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Salário Família</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.employee?.familySalary != null ? `R$ ${Number(selectedEmployee.employee.familySalary).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
                      </div>
                      <div className="hidden sm:block" />
                    </div>
                  </div>
                </div>

                {/* Card - PIX */}
                {/* PIX movido para Dados Bancários */}
                  </>
                )}

                {detailsTab === 'remuneration' && (
                  <>
                {/* Seção de Acréscimos Salariais */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mb-4">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Acréscimos</h4>
                      <span className="px-1.5 py-0.5 text-[11px] rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                            {adjustments.length}
                          </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowAddAdjustmentForm(true); setIsAdjustmentsMinimized(false); }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar</span>
                      </button>
                      <button
                        onClick={() => setIsAdjustmentsMinimized(!isAdjustmentsMinimized)}
                        className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={isAdjustmentsMinimized ? "Expandir seção" : "Minimizar seção"}
                      >
                        {isAdjustmentsMinimized ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isAdjustmentsMinimized ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}`}>
                    <div className="px-4 pb-4 space-y-4">
                      {showAddAdjustmentForm && selectedEmployee.employee && (
                        <AdjustmentForm employeeId={selectedEmployee.employee.id} onSave={handleAddAdjustment} onCancel={() => setShowAddAdjustmentForm(false)} />
                      )}
                      {editingAdjustment && selectedEmployee.employee && (
                        <AdjustmentForm employeeId={selectedEmployee.employee.id} adjustment={editingAdjustment} onSave={handleUpdateAdjustment} onCancel={() => setEditingAdjustment(null)} />
                      )}
                      {adjustments.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50">Nenhum acréscimo cadastrado.</div>
                      ) : (
                        <AdjustmentsList adjustments={adjustments} onEdit={handleEditAdjustment} onDelete={handleDeleteAdjustment} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Seção de Descontos Salariais */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mb-6">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Descontos</h4>
                      <span className="px-1.5 py-0.5 text-[11px] rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800">
                            {discounts.length}
                          </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowAddDiscountForm(true); setIsDiscountsMinimized(false); }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar</span>
                      </button>
                      <button
                        onClick={() => setIsDiscountsMinimized(!isDiscountsMinimized)}
                        className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={isDiscountsMinimized ? "Expandir seção" : "Minimizar seção"}
                      >
                        {isDiscountsMinimized ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isDiscountsMinimized ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}`}>
                    <div className="px-4 pb-4 space-y-4">
                      {showAddDiscountForm && selectedEmployee.employee && (
                        <DiscountForm employeeId={selectedEmployee.employee.id} onSave={handleAddDiscount} onCancel={() => setShowAddDiscountForm(false)} />
                      )}
                      {editingDiscount && selectedEmployee.employee && (
                        <DiscountForm employeeId={selectedEmployee.employee.id} discount={editingDiscount} onSave={handleUpdateDiscount} onCancel={() => setEditingDiscount(null)} />
                      )}
                      {discounts.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50">Nenhum desconto cadastrado.</div>
                      ) : (
                        <DiscountsList discounts={discounts} onEdit={handleEditDiscount} onDelete={handleDeleteDiscount} />
                      )}
                    </div>
                  </div>
                </div>
                  </>
                )}

                {detailsTab === 'records' && (
                  <>
                {/* Header de Registros de Ponto */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                  {/* Título e Período */}
                  <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Registros de Ponto</h4>
                      {employeeRecordsData?.data && employeeRecordsData.data.length > 0 && (
                        <button
                          onClick={exportToExcel}
                          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 transition-all shadow-sm hover:shadow-md font-medium text-sm"
                        >
                          <Download className="w-4 h-4" />
                          <span>Exportar XLSX</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Controles e Filtros */}
                  <div className="px-6 py-5">
                    <div className="flex flex-col xl:flex-row xl:items-end gap-4">
                      {/* Filtros de Período */}
                      <div className="flex items-end gap-4 flex-1">
                        <div className="flex flex-col">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mês</label>
                          <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer transition-all text-sm font-medium min-w-[150px] shadow-sm"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundPosition: 'right 0.75rem center',
                              backgroundRepeat: 'no-repeat',
                              backgroundSize: '1.25em 1.25em',
                              paddingRight: '2.5rem'
                            }}
                          >
                            <option value={1}>Janeiro</option>
                            <option value={2}>Fevereiro</option>
                            <option value={3}>Março</option>
                            <option value={4}>Abril</option>
                            <option value={5}>Maio</option>
                            <option value={6}>Junho</option>
                            <option value={7}>Julho</option>
                            <option value={8}>Agosto</option>
                            <option value={9}>Setembro</option>
                            <option value={10}>Outubro</option>
                            <option value={11}>Novembro</option>
                            <option value={12}>Dezembro</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ano</label>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer transition-all text-sm font-medium min-w-[110px] shadow-sm"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundPosition: 'right 0.75rem center',
                              backgroundRepeat: 'no-repeat',
                              backgroundSize: '1.25em 1.25em',
                              paddingRight: '2.5rem'
                            }}
                          >
                            {Array.from({ length: 5 }, (_, i) => {
                              const year = new Date().getFullYear() - 2 + i;
                              return (
                                <option key={year} value={year}>
                                  {year}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      {canManageEmployees && (
                        <div className="flex items-end gap-2.5">
                          <button
                            onClick={() => setShowImportModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all shadow-sm hover:shadow-md font-medium text-sm"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Importar Pontos</span>
                          </button>
                          <button
                            onClick={() => setShowManualPointModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm hover:shadow-md font-medium text-sm"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Adicionar Ponto</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lista de registros */}
                {loadingRecords ? (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-12 bg-white dark:bg-gray-800 text-center">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 font-medium">Carregando registros...</p>
                  </div>
                ) : (
                  <div className="mt-4">
                    {employeeRecordsData?.data?.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-12 bg-white dark:bg-gray-800 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Clock className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Nenhum registro encontrado para este período</p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Selecione outro mês ou ano para visualizar os registros</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(groupRecordsByDay(employeeRecordsData?.data || []))
                          .sort(([a], [b]) => new Date(a.split('/').reverse().join('-')).getTime() - new Date(b.split('/').reverse().join('-')).getTime())
                          .map(([date, records]: [string, any[]]) => (
                          <div key={date} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{date}</span>
                              </div>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {records.length} registro{records.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                              {records.map((record: any, index: number) => {
                                const recordMenuId = `${date}-${index}-${record.id}`;
                                
                                // Função para obter o ícone baseado no tipo
                                const getTypeIcon = () => {
                                  switch (record.type) {
                                    case 'ENTRY':
                                      return <DoorOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                    case 'EXIT':
                                      return <DoorClosed className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                    case 'LUNCH_START':
                                      return <Utensils className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                    case 'LUNCH_END':
                                      return <UtensilsCrossed className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                    case 'BREAK_START':
                                    case 'BREAK_END':
                                      return <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                    case 'ABSENCE_JUSTIFIED':
                                      return <FileCheck className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                    default:
                                      return <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
                                  }
                                };
                                
                                return (
                                <div key={index} className="relative px-3 py-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                                      {getTypeIcon()}
                                      {record.type !== 'ABSENCE_JUSTIFIED' && (
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                          {(() => {
                                            const date = new Date(record.timestamp);
                                            const hours = date.getUTCHours().toString().padStart(2, '0');
                                            const minutes = date.getUTCMinutes().toString().padStart(2, '0');
                                            const seconds = date.getUTCSeconds().toString().padStart(2, '0');
                                            return `${hours}:${minutes}:${seconds}`;
                                          })()}
                                        </span>
                                      )}
                                      {record.type === 'ABSENCE_JUSTIFIED' && record.medicalCertificateDetails && (
                                        <button
                                          onClick={() => setViewingCertificate(viewingCertificate === `${date}-${index}` ? null : `${date}-${index}`)}
                                          className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                                          title="Ver detalhes do atestado"
                                        >
                                          <Eye className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    {canManageEmployees && (
                                      <div className="relative flex-shrink-0">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenRecordMenu(openRecordMenu === recordMenuId ? null : recordMenuId);
                                          }}
                                          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                          title="Mais ações"
                                        >
                                          <MoreVertical className="w-4 h-4" />
                                        </button>
                                        
                                        {/* Dropdown Menu */}
                                        {openRecordMenu === recordMenuId && (
                                          <>
                                            <div 
                                              className="fixed inset-0 z-10" 
                                              onClick={() => setOpenRecordMenu(null)}
                                            />
                                            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (record.photoUrl) {
                                                    window.open(record.photoUrl, '_blank');
                                                    setOpenRecordMenu(null);
                                                  }
                                                }}
                                                disabled={!record.photoUrl}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors text-sm ${
                                                  record.photoUrl 
                                                    ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer' 
                                                    : 'text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                                                }`}
                                              >
                                                <Camera className={`w-3.5 h-3.5 ${record.photoUrl ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                                <span>Ver Foto</span>
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleEditRecord(record);
                                                  setOpenRecordMenu(null);
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700"
                                              >
                                                <Edit className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                                <span>Editar</span>
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDeleteRecordConfirm(record.id);
                                                  setOpenRecordMenu(null);
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700"
                                              >
                                                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                                                <span>Remover</span>
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Detalhes do atestado médico para ausência justificada */}
                                  {record.type === 'ABSENCE_JUSTIFIED' && record.medicalCertificateDetails && viewingCertificate === `${date}-${index}` && (
                                    <div className="mt-2 p-2">
                                      <div className="flex items-center space-x-2 mb-1">
                                        <FileCheck className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Detalhes do Atestado</span>
                                      </div>
                                      <div className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                                        <div className="flex items-center space-x-2">
                                          <Calendar className="w-3 h-3" />
                                          <span>
                                            {new Date(record.medicalCertificateDetails.startDate).toLocaleDateString('pt-BR')} - {new Date(record.medicalCertificateDetails.endDate).toLocaleDateString('pt-BR')}
                                          </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <Clock className="w-3 h-3" />
                                          <span>{record.medicalCertificateDetails.days} dias</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <User className="w-3 h-3" />
                                          <span>Enviado em {new Date(record.medicalCertificateDetails.submittedAt).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        {record.medicalCertificateDetails.description && (
                                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            <strong>Obs:</strong> {record.medicalCertificateDetails.description}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {record.observation && (
                                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                                      <strong>Obs:</strong> {record.observation}
                                    </div>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                            
                            {/* Mostrar motivo de alterações apenas se houver */}
                            {records.some((record: any) => record.reason && !record.reason.includes('Localização registrada')) && (
                              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  <strong>Motivo de Alterações:</strong>
                                  <ul className="mt-1 space-y-1">
                                    {records
                                      .filter((record: any) => record.reason && !record.reason.includes('Localização registrada'))
                                      .map((record: any, index: number) => (
                                        <li key={index} className="flex items-start space-x-2">
                                          <span className="text-gray-500 dark:text-gray-400">•</span>
                                          <span>{record.reason}</span>
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de edição de registro */}
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={handleCancelEdit} />
            <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar Registro</h3>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de Registro
                  </label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="ENTRY">Entrada</option>
                    <option value="LUNCH_START">Almoço</option>
                    <option value="LUNCH_END">Retorno</option>
                    <option value="EXIT">Saída</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Data e Hora
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.timestamp}
                    onChange={(e) => setEditForm({ ...editForm, timestamp: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observação do Funcionário
                  </label>
                  <textarea
                    value={editForm.observation}
                    onChange={(e) => setEditForm({ ...editForm, observation: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Observação do funcionário..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Motivo da Alteração
                  </label>
                  <textarea
                    value={editForm.reason}
                    onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Motivo da alteração..."
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={handleSaveEdit}
                    disabled={updateRecordMutation.isPending}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span>{updateRecordMutation.isPending ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      
      {/* Modal de edição de funcionário */}
      {showEditForm && editingEmployee && (
        <EditEmployeeForm
          employee={editingEmployee}
          onClose={handleCloseEditForm}
          visibleSections={editVisibleSections}
          onEmployeeUpdated={(updatedEmployee) => {
            // Atualizar o funcionário selecionado se for o mesmo
            if (selectedEmployee && selectedEmployee.id === updatedEmployee.id) {
              setSelectedEmployee(updatedEmployee);
            }
            // Atualizar o funcionário em edição
            setEditingEmployee(updatedEmployee);
          }}
        />
      )}

      {/* Modal de criar ponto manualmente */}
      {showManualPointModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowManualPointModal(false)} />
          <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Adicionar Ponto Manualmente</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{selectedEmployee.name}</p>
              </div>
              <button
                onClick={() => setShowManualPointModal(false)}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tipo de Ponto
                </label>
                <select
                  value={manualPointData.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    // Definir horário padrão baseado no tipo
                    let defaultTime = '08:00';
                    if (type === 'ENTRY') {
                      defaultTime = '07:00';
                    } else if (type === 'LUNCH_START') {
                      defaultTime = '12:00';
                    } else if (type === 'LUNCH_END') {
                      defaultTime = '13:00';
                    } else if (type === 'EXIT') {
                      defaultTime = '17:00';
                    }
                    setManualPointData({ ...manualPointData, type, time: defaultTime });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="ENTRY">Entrada</option>
                  <option value="LUNCH_START">Início do Almoço</option>
                  <option value="LUNCH_END">Retorno do Almoço</option>
                  <option value="EXIT">Saída</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={manualPointData.date}
                  onChange={(e) => setManualPointData({ ...manualPointData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Horário
                </label>
                <input
                  type="time"
                  value={manualPointData.time}
                  onChange={(e) => setManualPointData({ ...manualPointData, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Observação (opcional)
                </label>
                <textarea
                  value={manualPointData.observation}
                  onChange={(e) => setManualPointData({ ...manualPointData, observation: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Observação sobre o ponto criado..."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setShowManualPointModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    createManualPointMutation.mutate({
                      date: manualPointData.date,
                      time: manualPointData.time,
                      type: manualPointData.type,
                      observation: manualPointData.observation || null
                    });
                  }}
                  disabled={createManualPointMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {createManualPointMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Criando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Criar Ponto</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de importar pontos */}
      {showImportModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowImportModal(false);
            setSelectedFile(null);
            setParsedRecords([]);
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importar Pontos de Planilha</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setSelectedFile(null);
                  setParsedRecords([]);
                }}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Upload de arquivo */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                  Planilha de Espelho de Ponto
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    id="file-upload"
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors duration-200"
                  >
                    Escolher arquivo
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedFile ? selectedFile.name : 'Nenhum arquivo escolhido'}
                  </span>
                </div>
              </div>

              {/* Botão Processar */}
              <button
                onClick={parseSpreadsheet}
                disabled={!selectedFile || isParsing}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors duration-200 shadow-sm hover:shadow-md"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Processar Planilha</span>
                  </>
                )}
              </button>

              {/* Preview dos Registros */}
              {parsedRecords.length > 0 && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          Preview dos Registros
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {parsedRecords.length} registro(s) encontrado(s)
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      Revise os registros antes de importar. Você pode remover registros indesejados.
                    </p>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/80 sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                              DATA
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                              HORÁRIO
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                              TIPO
                            </th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                              AÇÃO
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {parsedRecords.map((record, index) => {
                            const [year, month, day] = record.date.split('-');
                            const formattedDate = `${day}/${month}/${year}`;
                            
                            return (
                              <tr 
                                key={index} 
                                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                              >
                                <td className="px-6 py-3 whitespace-nowrap">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {formattedDate}
                                  </span>
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {record.time}
                                  </span>
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    {record.type === 'ENTRY' ? 'Entrada' : 
                                     record.type === 'LUNCH_START' ? 'Início Almoço' :
                                     record.type === 'LUNCH_END' ? 'Retorno Almoço' : 'Saída'}
                                  </span>
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-center">
                                  <button
                                    onClick={() => {
                                      setParsedRecords(prev => prev.filter((_, i) => i !== index));
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors duration-150"
                                    title="Remover registro"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Botão Importar */}
                  <div className="flex space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => {
                        setShowImportModal(false);
                        setSelectedFile(null);
                        setParsedRecords([]);
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (parsedRecords.length === 0) {
                          toast.error('Nenhum registro para importar');
                          return;
                        }
                        importRecordsMutation.mutate(parsedRecords);
                      }}
                      disabled={importRecordsMutation.isPending || parsedRecords.length === 0}
                      className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {importRecordsMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Importando...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>Importar {parsedRecords.length} registro(s)</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação para deletar registro */}
      {deleteRecordConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteRecordConfirm(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Remover Registro de Ponto
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Esta ação não pode ser desfeita
                  </p>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                Tem certeza que deseja remover este registro de ponto? Esta ação é permanente e não pode ser revertida.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteRecordConfirm(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteRecordMutation.mutate(deleteRecordConfirm);
                  }}
                  disabled={deleteRecordMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {deleteRecordMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Removendo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Remover</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
    </>
  );
}
