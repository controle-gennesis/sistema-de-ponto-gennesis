'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { DollarSign, Search, Filter, Download, Calculator, Calendar, Clock, BadgeDollarSign, FileSpreadsheet, Building2, FileText, ChevronDown, ChevronUp, X, ListPlus , RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { PayrollDetailModal } from '@/components/payroll/PayrollDetailModal';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';
import { PayrollEmployee, PayrollFilters, MonthlyPayrollData } from '@/types';
import { 
  DEPARTMENTS_LIST, 
  COMPANIES_LIST, 
  MODALITIES_LIST, 
  BANKS_LIST, 
  ACCOUNT_TYPES_LIST,
  COST_CENTERS_LIST,
  CLIENTS_LIST,
  POLOS_LIST
} from '@/constants/payrollFilters';
import { CARGOS_LIST } from '@/constants/cargos';
import * as XLSX from 'xlsx';

export default function FolhaPagamentoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Obter mês e ano atual
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const [filters, setFilters] = useState<PayrollFilters>({
    search: '',
    department: '',
    company: '',
    position: '',
    costCenter: '',
    client: '',
    modality: '',
    bank: '',
    accountType: '',
    polo: '',
    month: currentMonth,
    year: currentYear
  });
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true); // Minimizados por padrão

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: payrollResponse, isLoading: loadingPayroll, error: payrollError } = useQuery({
    queryKey: ['payroll-monthly', filters],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.department) params.append('department', filters.department);
        if (filters.company) params.append('company', filters.company);
        if (filters.position) params.append('position', filters.position);
        if (filters.costCenter) params.append('costCenter', filters.costCenter);
        if (filters.client) params.append('client', filters.client);
        if (filters.modality) params.append('modality', filters.modality);
        if (filters.bank) params.append('bank', filters.bank);
        if (filters.accountType) params.append('accountType', filters.accountType);
        if (filters.polo) params.append('polo', filters.polo);
        params.append('month', filters.month.toString());
        params.append('year', filters.year.toString());
        
        const res = await api.get(`/payroll/employees?${params.toString()}`);
        console.log('📊 Resposta da API folha de pagamento:', res.data);
        return res.data;
      } catch (error: any) {
        console.error('❌ Erro ao buscar folha de pagamento:', error);
        console.error('❌ Detalhes do erro:', error.response?.data || error.message);
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000
  });

  // Buscar feriados do mês
  const { data: holidaysData } = useQuery({
    queryKey: ['holidays', filters.year, filters.month],
    queryFn: async () => {
      const params: any = { year: filters.year };
      if (filters.month) params.month = filters.month;
      const res = await api.get('/holidays', { params });
      return res.data;
    }
  });

  const holidays = holidaysData?.data || [];

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, department: e.target.value }));
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, company: e.target.value }));
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, position: e.target.value }));
  };

  const handleCostCenterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, costCenter: e.target.value }));
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, client: e.target.value }));
  };

  const handlePoloChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, polo: e.target.value }));
  };

  const handleModalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, modality: e.target.value }));
  };

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, bank: e.target.value }));
  };

  const handleAccountTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, accountType: e.target.value }));
  };

  const handleViewDetails = (employee: PayrollEmployee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, month: parseInt(e.target.value) }));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, year: parseInt(e.target.value) }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      department: '',
      company: '',
      position: '',
      costCenter: '',
      client: '',
      modality: '',
      bank: '',
      accountType: '',
      month: currentMonth,
      year: currentYear
    });
  };

  const clearAdvancedFilters = () => {
    setFilters(prev => ({
      ...prev,
      department: '',
      company: '',
      position: '',
      costCenter: '',
      client: '',
      modality: '',
      bank: '',
      accountType: ''
    }));
  };

  // Função auxiliar para converter polo para estado
  const poloToState = (polo?: string | null): string | undefined => {
    if (!polo) return undefined;
    const poloUpper = polo.toUpperCase();
    if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
    if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
    return undefined;
  };

  // Função auxiliar para calcular DSR por faltas considerando feriados
  // Se há N feriados no mês: as primeiras N faltas descontam 2 DSR cada (1 DSR + 1 feriado)
  // As faltas restantes descontam apenas 1 DSR cada
  const calcularDSRPorFaltas = (salarioBase: number, faltas: number, holidays: any[], diasDoMes: number): number => {
    if (faltas <= 0) return 0;

    // Verificar quantos feriados úteis há no mês (segunda a sábado)
    const feriadosUteis = holidays.filter((holiday: any) => {
      const holidayDate = new Date(holiday.date);
      const dayOfWeek = holidayDate.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 6; // Segunda a sábado
    });

    const quantidadeFeriados = feriadosUteis.length;

    if (quantidadeFeriados === 0) {
      // Sem feriados no mês: todas as faltas descontam apenas 1 DSR
      return (salarioBase / 30) * faltas;
    } else {
      // Com feriados no mês:
      // - As primeiras N faltas (N = quantidade de feriados) descontam 2 DSR cada
      // - As faltas restantes descontam apenas 1 DSR cada
      const faltasComFeriado = Math.min(faltas, quantidadeFeriados);
      const faltasSemFeriado = Math.max(0, faltas - quantidadeFeriados);
      
      const dsrFaltasComFeriado = (salarioBase / 30) * faltasComFeriado * 2; // 1 DSR + 1 feriado
      const dsrFaltasSemFeriado = (salarioBase / 30) * faltasSemFeriado; // Apenas 1 DSR
      
      return dsrFaltasComFeriado + dsrFaltasSemFeriado;
    }
  };

  const exportToExcel = async () => {
    if (!payrollData || !Array.isArray(payrollData.employees) || payrollData.employees.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    // Buscar feriados do mês
    let holidays: any[] = [];
    try {
      const params: any = { year: filters.year };
      if (filters.month) params.month = filters.month;
      const res = await api.get('/holidays', { params });
      holidays = res.data?.data || [];
    } catch (error) {
      console.error('Erro ao buscar feriados:', error);
      // Continuar sem feriados se houver erro
    }

    const diasDoMes = new Date(filters.year, filters.month, 0).getDate();

    // Preparar dados para exportação - cada campo em coluna separada
    const exportData = payrollData.employees.map(employee => {
      // Cálculos auxiliares
      const salarioBase = employee.salary;
      const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
      const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
      const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
      const diasParaDesconto = 30; // Padrão
      const descontoPorFaltas = (salarioBase / 30) * faltas;
      
      // Calcular número de dias do mês atual (para outros cálculos)
      const diasDoMes = new Date(filters.year, filters.month, 0).getDate();
      
      // Buscar feriados do estado do funcionário
      const employeeState = poloToState(employee.polo);
      const employeeHolidays = employeeState 
        ? holidays.filter((h: any) => !h.state || h.state === employeeState || h.state === null)
        : holidays;
      
      const dsrPorFalta = calcularDSRPorFaltas(salarioBase, faltas, employeeHolidays, diasDoMes);
      const percentualVA = employee.polo === 'BRASÍLIA' ? (employee.totalFoodVoucher || 0) * 0.09 : 0;
      const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
      const valorHorasExtras = (employee.he50Value || 0) + (employee.he100Value || 0);
      const diasUteis = employee.totalWorkingDays || 0;
      const diasNaoUteis = diasDoMes - diasUteis;
      const valorDSRHE = diasUteis > 0 ? 
        ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) + 
        ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)
        : 0;
      const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
        ? 0 
        : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
      
      // Função para calcular INSS
      const calcularINSS = (baseINSS: number): number => {
        if (baseINSS <= 0) return 0;
        if (baseINSS <= 1518) {
          return baseINSS * 0.075;
        } else if (baseINSS <= 2793) {
          return (1518 * 0.075) + ((baseINSS - 1518) * 0.09);
        } else if (baseINSS <= 4190) {
          return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((baseINSS - 2793) * 0.12);
        } else if (baseINSS <= 8157) {
          return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((baseINSS - 4190) * 0.14);
        } else {
          return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((8157 - 4190) * 0.14);
        }
      };
      
      const inssMensal = calcularINSS(baseINSSMensal);
      const irrfMensal = employee.irrfMensal || 0;
      const totalProventos = salarioBase + employee.familySalary + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + (employee.totalTransportVoucher || 0);
      const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFalta + percentualVA + percentualVT + inssMensal + irrfMensal;
      const liquidoReceber = totalProventos - totalDescontos;
      const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);

      return {
        // Dados Pessoais
        'Nome': employee.name || '',
        'CPF': employee.cpf || '',
        'Matrícula': employee.employeeId || '',
        'Função': employee.position || '',
        'Setor': employee.department || '',
        'Empresa': employee.company || '',
        'Polo': employee.polo || '',
        'Centro de Custo': employee.costCenter || '',
        'Cliente': employee.client || '',
        'Modalidade': employee.modality || '',
        
        // Dados Bancários (separados)
        'Banco': employee.bank || '',
        'Tipo de Conta': employee.accountType || '',
        'Agência': employee.agency || '',
        'Operação': employee.operation || '',
        'Conta': employee.account || '',
        'Dígito': employee.digit || '',
        
        // Dados PIX (separados)
        'Tipo PIX': employee.pixKeyType || '',
        'Chave PIX': employee.pixKey || '',
        
        // Valores Base
        'Salário Base': salarioBase,
        'Salário Família': employee.familySalary || 0,
        'Periculosidade': periculosidade,
        'Insalubridade': insalubridade,
        
        // Horas Extras
        'HE 50% (Horas)': employee.he50Hours || 0,
        'HE 50% (Valor)': employee.he50Value || 0,
        'HE 100% (Horas)': employee.he100Hours || 0,
        'HE 100% (Valor)': employee.he100Value || 0,
        'DSR HE': valorDSRHE,
        'Total Horas Extras': valorHorasExtras,
        
        // VA e VT
        'VA Diário': employee.dailyFoodVoucher || 0,
        'VT Diário': employee.dailyTransportVoucher || 0,
        'Total VA': employee.totalFoodVoucher || 0,
        'Total VT': employee.totalTransportVoucher || 0,
        'Total VA+VT': (employee.totalFoodVoucher || 0) + (employee.totalTransportVoucher || 0),
        
        // Presença
        'Dias Trabalhados': employee.daysWorked || 0,
        'Total Dias Úteis': employee.totalWorkingDays || 0,
        'Faltas': faltas,
        
        // Descontos
        'Desconto por Faltas': descontoPorFaltas,
        'DSR por Falta': dsrPorFalta,
        '% VA': percentualVA,
        '% VT': percentualVT,
        'INSS Mensal': inssMensal,
        'IRRF Mensal': irrfMensal,
        'Descontos Adicionais': employee.totalDiscounts || 0,
        'Total Descontos': totalDescontos,
        
        // Acréscimos
        'Acréscimos': employee.totalAdjustments || 0,
        
        // Totais
        'Total Proventos': totalProventos,
        
        // FGTS
        'FGTS': employee.fgts || 0,
        'FGTS Férias': employee.fgtsFerias || 0,
        'FGTS Total': employee.fgtsTotal || 0,
        
        // INSS Total
        'INSS Total': employee.inssTotal || 0,
        
        // IRRF Total
        'IRRF Total': employee.irrfTotal || 0,
        
        // Férias
        'Dias de Férias': employee.vacationDays || 0,
        'Base INSS Férias': employee.baseInssFerias || 0,
        'INSS Férias': employee.inssFerias || 0,
        
        // Valores Líquidos (no final)
        'Líquido': liquidoReceber,
        'Líquido Total': liquidoComAcrescimos
      };
    });

    // Criar planilha
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Ajustar largura das colunas
    const colWidths = [
      { wch: 25 }, // Nome
      { wch: 15 }, // CPF
      { wch: 12 }, // Matrícula
      { wch: 20 }, // Função
      { wch: 20 }, // Setor
      { wch: 20 }, // Empresa
      { wch: 15 }, // Polo
      { wch: 20 }, // Centro de Custo
      { wch: 20 }, // Cliente
      { wch: 15 }, // Modalidade
      { wch: 20 }, // Banco
      { wch: 15 }, // Tipo de Conta
      { wch: 10 }, // Agência
      { wch: 10 }, // Operação
      { wch: 12 }, // Conta
      { wch: 8 },  // Dígito
      { wch: 15 }, // Tipo PIX
      { wch: 30 }, // Chave PIX
      { wch: 15 }, // Salário Base
      { wch: 15 }, // Salário Família
      { wch: 15 }, // Periculosidade
      { wch: 15 }, // Insalubridade
      { wch: 12 }, // HE 50% Horas
      { wch: 15 }, // HE 50% Valor
      { wch: 12 }, // HE 100% Horas
      { wch: 15 }, // HE 100% Valor
      { wch: 12 }, // DSR HE
      { wch: 15 }, // Total Horas Extras
      { wch: 12 }, // VA Diário
      { wch: 12 }, // VT Diário
      { wch: 12 }, // Total VA
      { wch: 12 }, // Total VT
      { wch: 12 }, // Total VA+VT
      { wch: 12 }, // Dias Trabalhados
      { wch: 12 }, // Total Dias Úteis
      { wch: 10 }, // Faltas
      { wch: 15 }, // Desconto por Faltas
      { wch: 12 }, // DSR por Falta
      { wch: 10 }, // % VA
      { wch: 10 }, // % VT
      { wch: 12 }, // INSS Mensal
      { wch: 12 }, // IRRF Mensal
      { wch: 15 }, // Descontos Adicionais
      { wch: 15 }, // Total Descontos
      { wch: 12 }, // Acréscimos
      { wch: 15 }, // Total Proventos
      { wch: 12 }, // FGTS
      { wch: 12 }, // FGTS Férias
      { wch: 12 }, // FGTS Total
      { wch: 12 }, // INSS Total
      { wch: 12 }, // IRRF Total
      { wch: 12 }, // Dias de Férias
      { wch: 15 }, // Base INSS Férias
      { wch: 12 }, // INSS Férias
      { wch: 15 }, // Líquido
      { wch: 18 }  // Líquido Total
    ];
    ws['!cols'] = colWidths;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Folha de Pagamento');

    // Gerar nome do arquivo
    const monthName = payrollData.period.monthName;
    const year = payrollData.period.year;
    const fileName = `Folha_Pagamento_${monthName}_${year}.xlsx`;

    // Baixar arquivo
    XLSX.writeFile(wb, fileName);
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  const payrollData: MonthlyPayrollData | null = payrollResponse?.data || null;
  const employees: PayrollEmployee[] = payrollData?.employees || [];
  
  // Log para debug
  console.log('📊 payrollResponse:', payrollResponse);
  console.log('📊 payrollData:', payrollData);
  console.log('📊 employees:', employees);
  console.log('📊 employees length:', employees?.length);
  console.log('❌ Erro folha de pagamento:', payrollError);
  
  const uniqueDepartments = Array.from(
    new Set((employees || []).map(emp => emp.department).filter(Boolean))
  ).sort();

  // Opções de mês e ano
  const monthOptions = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <ProtectedRoute route="/ponto/folha-pagamento">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Folha de Pagamento</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Gerencie e visualize informações salariais dos funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="border-b-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
                    </button>
                    <button
                      onClick={clearFilters}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Buscar Funcionário
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={handleSearchChange}
                    placeholder="Digite nome, CPF, matrícula, setor, empresa ou qualquer informação..."
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Filtros de Período - Sempre Visíveis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mês
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <select
                      value={filters.month}
                      onChange={handleMonthChange}
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      {monthOptions.map(month => (
                        <option key={month.value} value={month.value}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ano
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <select
                      value={filters.year}
                      onChange={handleYearChange}
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                    >
                      {yearOptions.map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.department}
                            onChange={handleDepartmentChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os setores</option>
                            {DEPARTMENTS_LIST.map(dept => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.position}
                            onChange={handlePositionChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os cargos</option>
                            {CARGOS_LIST.map(cargo => (
                              <option key={cargo} value={cargo}>
                                {cargo}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Empresa
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.company}
                            onChange={handleCompanyChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todas as empresas</option>
                            {COMPANIES_LIST.map(company => (
                              <option key={company} value={company}>
                                {company}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grupo 2: Informações Financeiras */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Financeiras</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Centro de Custo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.costCenter}
                            onChange={handleCostCenterChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os centros</option>
                            {COST_CENTERS_LIST.map(center => (
                              <option key={center} value={center}>
                                {center}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tomador
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.client}
                            onChange={handleClientChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os tomadores</option>
                            {CLIENTS_LIST.map(client => (
                              <option key={client} value={client}>
                                {client}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Polo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.polo}
                            onChange={handlePoloChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os polos</option>
                            {POLOS_LIST.map(polo => (
                              <option key={polo} value={polo}>
                                {polo}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Modalidade
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.modality}
                            onChange={handleModalityChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todas as modalidades</option>
                            {MODALITIES_LIST.map(modality => (
                              <option key={modality} value={modality}>
                                {modality}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grupo 3: Informações Bancárias */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Bancárias</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Banco
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.bank}
                            onChange={handleBankChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os bancos</option>
                            {BANKS_LIST.map(bank => (
                              <option key={bank} value={bank}>
                                {bank}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tipo de Conta
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.accountType}
                            onChange={handleAccountTypeChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos os tipos</option>
                            {ACCOUNT_TYPES_LIST.map(type => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Lista de Funcionários */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Folha de Pagamento</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Dados de remuneração dos funcionários</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={exportToExcel}
                  disabled={!payrollData || payrollData.employees.length === 0}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                  title="Exportar para Excel"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                      Setor
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                      Empresa
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Centro de <br/>Custo 
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Tomador
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Líquido Total
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {payrollError ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="text-red-600 dark:text-red-400">
                          <p className="font-semibold">Erro ao carregar dados</p>
                          <p className="text-sm mt-1">
                            {payrollError instanceof Error && payrollError.message.includes('CORS')
                              ? 'Erro de CORS: Verifique a configuração do servidor'
                              : payrollError instanceof Error
                              ? payrollError.message
                              : 'Não foi possível conectar ao servidor. Tente novamente mais tarde.'}
                          </p>
                          <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                            Verifique o console do navegador para mais detalhes.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : loadingPayroll ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                          <span className="text-gray-600 dark:text-gray-400">Carregando folha de pagamento...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !Array.isArray(employees) || employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.name}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              {employee.cpf || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 sm:hidden">
                              {employee.department && `${employee.department} • ${employee.company || 'N/A'}`}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {employee.employeeId || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden sm:table-cell">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {employee.position || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {employee.modality || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden md:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.company || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.costCenter || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.client || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            R$ {(() => {
                              const salarioBase = employee.salary;
                              const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
                              const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
                              const salarioFamilia = employee.familySalary || 0;
                              const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
                              
                              // Calcular número de dias do mês para desconto de faltas
                              // Usa 30 como padrão, ou 31 apenas se for o mês de admissão E o mês de admissão tiver 31 dias
                              let diasParaDesconto = 30; // Padrão
                              if (employee.admissionDate) {
                                const admissionDate = new Date(employee.admissionDate);
                                const mesAdmissao = admissionDate.getMonth() + 1; // getMonth() retorna 0-11
                                const anoAdmissao = admissionDate.getFullYear();
                                
                                // Só usa 31 dias se for o mês de admissão e o mês tiver 31 dias
                                if (filters.month === mesAdmissao && filters.year === anoAdmissao) {
                                  const diasMesAdmissao = new Date(anoAdmissao, mesAdmissao, 0).getDate();
                                  if (diasMesAdmissao === 31) {
                                    diasParaDesconto = 31;
                                  }
                                }
                              }
                              
                              // Calcular número de dias do mês atual (para outros cálculos)
                              const diasDoMes = new Date(filters.year, filters.month, 0).getDate();
                              
                              const descontoPorFaltas = (salarioBase / 30) * faltas;
                              
                              // Buscar feriados do estado do funcionário para calcular DSR
                              const employeeState = poloToState(employee.polo);
                              const employeeHolidays = employeeState 
                                ? holidays.filter((h: any) => !h.state || h.state === employeeState || h.state === null)
                                : holidays;
                              
                              const dsrPorFalta = calcularDSRPorFaltas(salarioBase, faltas, employeeHolidays, diasDoMes);
                              
                              // Cálculos de %VA e %VT baseados no polo
                              const percentualVA = employee.polo === 'BRASÍLIA' ? (employee.totalFoodVoucher || 0) * 0.09 : 0;
                              const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
                              
                              const totalHorasExtras = (employee.he50Hours || 0) + (employee.he100Hours || 0);
                              const diasUteis = employee.totalWorkingDays || 0;
                              const diasNaoUteis = diasDoMes - diasUteis;
                              const dsrHE = diasUteis > 0 ? (totalHorasExtras / diasUteis) * diasNaoUteis : 0;
                              const valorDSRHE = diasUteis > 0 ? 
                                ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) + 
                                ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)
                                : 0;
                              
                              const valorHorasExtras = (employee.he50Value || 0) + (employee.he100Value || 0);
                              const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
                                ? 0 
                                : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
                              
                              const calcularINSS = (baseINSS: number): number => {
                                if (baseINSS <= 0) return 0;
                                
                                if (baseINSS <= 1518) {
                                  return baseINSS * 0.075;
                                } else if (baseINSS <= 2793) {
                                  return (1518 * 0.075) + ((baseINSS - 1518) * 0.09);
                                } else if (baseINSS <= 4190) {
                                  return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((baseINSS - 2793) * 0.12);
                                } else if (baseINSS <= 8157) {
                                  return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((baseINSS - 4190) * 0.14);
                                } else {
                                  return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((8157 - 4190) * 0.14);
                                }
                              };

                              const inssMensal = calcularINSS(baseINSSMensal);
                              const irrfMensal = employee.irrfMensal || 0;
                              
                              const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + (employee.totalTransportVoucher || 0);
                              const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFalta + percentualVA + percentualVT + inssMensal + irrfMensal;
                              const liquidoReceber = totalProventos - totalDescontos;
                              const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);
                              
                              return liquidoComAcrescimos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleViewDetails(employee)}
                              className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                              title="Ver detalhes"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Estatísticas */}
            {employees.length > 0 && payrollData && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-6">
                    <span>
                      <strong>Período:</strong> {payrollData.period.monthName} de {payrollData.period.year}
                    </span>
                  <span>
                      <strong>Total de funcionários:</strong> {payrollData.totals.totalEmployees}
                  </span>
                  </div>
                  {filters.department && (
                    <span>
                      <strong>Setor:</strong> {filters.department}
                    </span>
                  )}
                  {filters.company && (
                    <span>
                      <strong>Empresa:</strong> {filters.company}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      {selectedEmployee && (
        <PayrollDetailModal
          employee={selectedEmployee}
          month={filters.month}
          year={filters.year}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
      </MainLayout>
    </ProtectedRoute>
  );
}
