'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, Calendar, Filter, Download, Search, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { DEPARTMENTS_LIST, CLIENTS_LIST, POLOS_LIST } from '@/constants/payrollFilters';
import { useCostCenters } from '@/hooks/useCostCenters';
import { CARGOS_LIST } from '@/constants/cargos';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const BANK_HOURS_STATUS_OPTIONS = labeledToSelectOptions([
  { value: 'positive', label: 'Positivo' },
  { value: 'negative', label: 'Negativo' },
  { value: 'zero', label: 'Neutro' },
]);

interface BankHoursData {
  employeeId: string;
  employeeName: string;
  employeeCpf: string;
  department: string;
  position: string;
  costCenter?: string;
  client?: string;
  hireDate: string;
  actualStartDate: string;
  totalWorkedHours: number;
  totalExpectedHours: number;
  bankHours: number;
  overtimeHours: number;
  overtimeMultipliedHours: number;
  pendingHours: number;
  lastUpdate: string;
}

interface BankHoursFilters {
  search?: string;
  department?: string;
  position?: string;
  costCenter?: string;
  client?: string;
  polo?: string;
  status?: string;
  startDate: string;
  endDate: string;
}

function BankHoursPageContent() {
  const { costCentersList } = useCostCenters();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const [filters, setFilters] = useState<BankHoursFilters>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
    const today = new Date();
    return {
      search: '',
      department: 'Departamento Pessoal',
      position: '',
      costCenter: '',
      client: '',
      polo: '',
      status: '',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleDepartmentChange = (value: string) => {
    setFilters(prev => ({ ...prev, department: value }));
  };

  const handlePositionChange = (value: string) => {
    setFilters(prev => ({ ...prev, position: value }));
  };

  const handleCostCenterChange = (value: string) => {
    setFilters(prev => ({ ...prev, costCenter: value }));
  };

  const handleClientChange = (value: string) => {
    setFilters(prev => ({ ...prev, client: value }));
  };

  const handlePoloChange = (value: string) => {
    setFilters(prev => ({ ...prev, polo: value }));
  };

  const handleStatusChange = (value: string) => {
    setFilters(prev => ({ ...prev, status: value }));
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, startDate: e.target.value }));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, endDate: e.target.value }));
  };

  const clearFilters = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
    const today = new Date();
    setFilters({
      search: '',
      department: '',
      position: '',
      costCenter: '',
      client: '',
      status: '',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    });
  };

  const clearAdvancedFilters = () => {
    setFilters(prev => ({
      ...prev,
      department: '',
      position: '',
      costCenter: '',
      client: '',
      status: ''
    }));
  };

  const { data: bankHoursData, isLoading: loadingBankHours, error: bankHoursError } = useQuery({
    queryKey: ['bank-hours', filters],
    queryFn: async () => {
      try {
        const res = await api.get('/bank-hours/employees', {
          params: { 
            search: filters.search,
            department: filters.department,
            position: filters.position,
            costCenter: filters.costCenter,
            client: filters.client,
            polo: filters.polo,
            status: filters.status,
            startDate: filters.startDate, 
            endDate: filters.endDate
          }
        });
        console.log('📊 Resposta da API banco de horas:', res.data);
        return res.data;
      } catch (error: any) {
        console.error('❌ Erro ao buscar banco de horas:', error);
        console.error('❌ Detalhes do erro:', error.response?.data || error.message);
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000
  });

  const formatHours = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    const sign = hours >= 0 ? '+' : '-';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatHoursNoSign = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (bankHours: number) => {
    if (bankHours > 0) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    if (bankHours < 0) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
    return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
  };

  const getStatusText = (bankHours: number) => {
    if (bankHours > 0) return 'Positivo';
    if (bankHours < 0) return 'Negativo';
    return 'Neutro';
  };

  const exportToExcel = () => {
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }

    // Preparar dados para exportação
    const exportData = filteredData.map((employee: BankHoursData) => ({
      'Data Inicial': filters.startDate,
      'Data Final': filters.endDate,
      'Funcionário': employee.employeeName,
      'CPF': employee.employeeCpf,
      'Setor': employee.department,
      'Cargo': employee.position,
      'Centro de Custo': employee.costCenter || '-',
      'Tomador': employee.client || '-',
      'Horas Esperadas': formatHoursNoSign(employee.totalExpectedHours),
      'Horas Trabalhadas': formatHoursNoSign(employee.totalWorkedHours),
      'Horas Extras (ponderadas)': formatHoursNoSign(employee.overtimeMultipliedHours),
      'Horas Devidas': formatHoursNoSign(employee.pendingHours),
      'Saldo Atual': formatHours(employee.bankHours)
    }));

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 12 }, // Data Inicial
      { wch: 12 }, // Data Final
      { wch: 20 }, // Funcionário
      { wch: 15 }, // CPF
      { wch: 15 }, // Setor
      { wch: 15 }, // Cargo
      { wch: 15 }, // Centro de Custo
      { wch: 15 }, // Tomador
      { wch: 15 }, // Horas Trabalhadas
      { wch: 15 }, // Horas Esperadas
      { wch: 15 }, // Banco de Horas
      { wch: 20 }, // Horas Extras (Multiplicadas)
      { wch: 10 }  // Status
    ];
    ws['!cols'] = colWidths;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Banco de Horas');

    // Gerar nome do arquivo com período
    const formatDateForFileName = (dateString: string) => {
      // Parsear a data manualmente para evitar problemas de timezone
      // dateString está no formato "YYYY-MM-DD"
      const [year, month, day] = dateString.split('-').map(Number);
      return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
    };

    const startDateFormatted = formatDateForFileName(filters.startDate);
    const endDateFormatted = formatDateForFileName(filters.endDate);
    const fileName = `Banco_Horas_${startDateFormatted}_a_${endDateFormatted}.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, fileName);
  };



  if (loadingUser || !userData) {
    return (
      <Loading 
        message="Carregando banco de horas..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  const filteredData = bankHoursData?.data || [];

  // Log para debug
  console.log('📊 bankHoursData:', bankHoursData);
  console.log('📊 filteredData:', filteredData);
  console.log('📊 filteredData length:', filteredData?.length);
  console.log('❌ Erro banco de horas:', bankHoursError);

  const hasAdvancedFilters = !!(
    filters.department ||
    filters.position ||
    filters.costCenter ||
    filters.client ||
    filters.polo ||
    filters.status
  );

  return (
    <MainLayout
      userRole={user.role}
      userName={user.name}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Controle de Banco de Horas
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Acompanhamento do banco de horas de todos os funcionários
          </p>
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                  <Clock className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Banco de Horas
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Cálculo do banco de horas de todos os funcionários
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className={cadastroListClasses.searchFilterGroup}>
                  <div className={cadastroListClasses.searchFieldInGroup}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={handleSearchChange}
                      placeholder="Buscar funcionário..."
                      className={`${FORM_FIELD_INPUT_CLS} h-10 pl-9`}
                    />
                  </div>
                  <div className={cadastroListClasses.filterIconButtonWrap}>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className={`${cadastroListClasses.filterIconButton} transition-colors ${
                        showAdvancedFilters || hasAdvancedFilters
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                      aria-label="Filtros avançados"
                    >
                      <Filter className="h-4 w-4" />
                      {hasAdvancedFilters ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                  </div>
                </div>
                <div className="relative w-full sm:w-[10.5rem]">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={handleStartDateChange}
                    title="Data inicial"
                    aria-label="Data inicial"
                    className={`${FORM_FIELD_INPUT_CLS} h-10 pl-9`}
                  />
                </div>
                <div className="relative w-full sm:w-[10.5rem]">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={handleEndDateChange}
                    title="Data final"
                    aria-label="Data final"
                    className={`${FORM_FIELD_INPUT_CLS} h-10 pl-9`}
                  />
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-red-600 transition-colors hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
                  title="Limpar todos os filtros"
                  aria-label="Limpar filtros"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={exportToExcel}
                  className="flex h-10 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 sm:px-4"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/30 sm:p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Filtros específicos
                  </h4>
                  <button
                    type="button"
                    onClick={clearAdvancedFilters}
                    className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Limpar avançados
                  </button>
                </div>

                <div className="space-y-3">
                  <h5 className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Informações básicas
                  </h5>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Setor
                      </label>
                      <StringSingleSelectDropdown
                        value={filters.department ?? ''}
                        onChange={handleDepartmentChange}
                        options={DEPARTMENTS_LIST || []}
                        emptyOptionLabel="Todos os setores"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Cargo
                      </label>
                      <StringSingleSelectDropdown
                        value={filters.position ?? ''}
                        onChange={handlePositionChange}
                        options={CARGOS_LIST || []}
                        emptyOptionLabel="Todos os cargos"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Status do Banco
                      </label>
                      <StringSingleSelectDropdown
                        value={filters.status ?? ''}
                        onChange={handleStatusChange}
                        options={BANK_HOURS_STATUS_OPTIONS}
                        emptyOptionLabel="Todos os status"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Informações financeiras
                  </h5>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Centro de Custo
                      </label>
                      <StringSingleSelectDropdown
                        value={filters.costCenter ?? ''}
                        onChange={handleCostCenterChange}
                        options={costCentersList}
                        emptyOptionLabel="Todos os centros de custo"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Tomador
                      </label>
                      <StringSingleSelectDropdown
                        value={filters.client ?? ''}
                        onChange={handleClientChange}
                        options={CLIENTS_LIST || []}
                        emptyOptionLabel="Todos os tomadores"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Polo
                      </label>
                      <StringSingleSelectDropdown
                        value={filters.polo ?? ''}
                        onChange={handlePoloChange}
                        options={POLOS_LIST || []}
                        emptyOptionLabel="Todos os polos"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className={`${cadastroListClasses.cardContent} p-0 sm:p-0`}>
            <div className={cadastroListClasses.tableScroll}>
              <table className={`${cadastroListClasses.table} min-w-[56rem]`}>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={cadastroListClasses.th}>Funcionário</th>
                    <th className={`${cadastroListClasses.thCenter} hidden sm:table-cell`}>Setor</th>
                    <th className={`${cadastroListClasses.thCenter} hidden md:table-cell`}>
                      Centro de Custo
                    </th>
                    <th className={`${cadastroListClasses.thCenter} hidden lg:table-cell`}>Tomador</th>
                    <th className={`${cadastroListClasses.thCenter} hidden lg:table-cell`}>
                      Horas Esperadas
                    </th>
                    <th className={`${cadastroListClasses.thCenter} hidden lg:table-cell`}>
                      Horas Trabalhadas
                    </th>
                    <th className={cadastroListClasses.thCenter}>Horas Extras</th>
                    <th className={cadastroListClasses.thCenter}>Horas Devidas</th>
                    <th className={cadastroListClasses.thCenter}>Saldo Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {bankHoursError ? (
                    <tr>
                      <td colSpan={9} className={`${cadastroListClasses.tdCenter} py-8`}>
                        <div className="text-red-600 dark:text-red-400">
                          <p className="font-semibold">Erro ao carregar dados</p>
                          <p className="mt-1 text-sm">
                            {bankHoursError instanceof Error && bankHoursError.message.includes('CORS')
                              ? 'Erro de CORS: Verifique a configuração do servidor'
                              : bankHoursError instanceof Error
                                ? bankHoursError.message
                                : 'Não foi possível conectar ao servidor. Tente novamente mais tarde.'}
                          </p>
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Verifique o console do navegador para mais detalhes.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : loadingBankHours ? (
                    <tr>
                      <td colSpan={9} className={`${cadastroListClasses.tdCenter} py-8`}>
                        <CadastroListLoading message="Carregando banco de horas..." />
                      </td>
                    </tr>
                  ) : !Array.isArray(filteredData) || filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={`${cadastroListClasses.tdCenter} py-8`}>
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="mt-1 text-sm">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((employee: BankHoursData) => (
                      <tr key={employee.employeeId} className={listTableRowClasses.tr}>
                        <td className={cadastroListClasses.tdTruncate}>
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.employeeName}
                            </span>
                            <div className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                              {employee.employeeCpf}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 sm:hidden">
                              {employee.department &&
                                `${employee.department} • ${employee.costCenter || 'N/A'}`}
                            </div>
                          </div>
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} hidden sm:table-cell`}>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {employee.position || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} hidden md:table-cell`}>
                          {employee.costCenter || 'N/A'}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} hidden lg:table-cell`}>
                          {employee.client || 'N/A'}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} hidden lg:table-cell`}>
                          {formatHoursNoSign(employee.totalExpectedHours)}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} hidden lg:table-cell`}>
                          {formatHoursNoSign(employee.totalWorkedHours)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatHoursNoSign(employee.overtimeMultipliedHours)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatHoursNoSign(employee.pendingHours)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <span
                            className={`text-sm font-bold ${
                              employee.bankHours >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {formatHours(employee.bankHours)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredData.length > 0 && (
              <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-800/50 sm:px-6">
                <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
                    <span>
                      <strong>Período:</strong>{' '}
                      {new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR')} até{' '}
                      {new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <span>
                      <strong>Total de funcionários:</strong> {filteredData.length}
                    </span>
                  </div>
                  {filters.department && (
                    <span>
                      <strong>Setor:</strong> {filters.department}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

export default function BankHoursPage() {
  return (
    <ProtectedRoute route="/ponto/banco-horas">
      <BankHoursPageContent />
    </ProtectedRoute>
  );
}
