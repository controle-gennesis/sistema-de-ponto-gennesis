'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Users, Search, Filter, ChevronDown, ChevronUp, X, Building2, FileText, Calendar, ListPlus, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';
import { PayrollEmployee, PayrollFilters } from '@/types';
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

export default function AlocacaoPage() {
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCurrentMonth, setModalCurrentMonth] = useState(new Date().getMonth());
  const [modalCurrentYear, setModalCurrentYear] = useState(new Date().getFullYear());
  
  // Estado para armazenar dados reais de cada funcionário
  const [employeeDataMap, setEmployeeDataMap] = useState<Record<string, any>>({});
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: employeesResponse, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-alocacao', filters],
    queryFn: async () => {
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
      return res.data;
    }
  });

  // Query para buscar dados do funcionário selecionado
  const { data: employeeData, isLoading: loadingEmployeeData } = useQuery({
    queryKey: ['employee-cost-center', selectedEmployee?.id, modalCurrentMonth, modalCurrentYear],
    queryFn: async () => {
      console.log('=== API CALL STARTED ===');
      console.log('selectedEmployee?.id:', selectedEmployee?.id);
      console.log('modalCurrentMonth:', modalCurrentMonth);
      console.log('modalCurrentYear:', modalCurrentYear);
      
      if (!selectedEmployee?.id) {
        console.log('No employee ID - returning null');
        return null;
      }
      
      const res = await api.get(`/time-records/employee/${selectedEmployee.id}/cost-center?month=${modalCurrentMonth + 1}&year=${modalCurrentYear}`);
      console.log('API Response:', res.data);
      console.log('API Response Employee:', res.data?.data?.employee);
      console.log('API Response Employee AdmissionDate:', res.data?.data?.employee?.admissionDate);
      console.log('API Response Employee HireDate:', res.data?.data?.employee?.hireDate);
      return res.data;
    },
    enabled: !!selectedEmployee?.id && isModalOpen
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleViewDetails = (employee: PayrollEmployee) => {
    console.log('=== MODAL OPENING ===');
    console.log('Employee from table:', JSON.stringify(employee, null, 2));
    console.log('Employee admissionDate:', employee.admissionDate);
    console.log('Employee hireDate:', (employee as any).hireDate);
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  // Função para buscar dados reais de um funcionário
  const fetchEmployeeData = async (employeeId: string) => {
    if (employeeDataMap[employeeId]) {
      return employeeDataMap[employeeId];
    }
    
    try {
      const response = await api.get(`/time-records/employee/${employeeId}/cost-center?month=${filters.month}&year=${filters.year}`);
      const data = response.data;
      
      setEmployeeDataMap(prev => ({
        ...prev,
        [employeeId]: data
      }));
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar dados do funcionário:', error);
      return null;
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
  };

  const handlePreviousMonth = () => {
    if (modalCurrentMonth === 0) {
      setModalCurrentMonth(11);
      setModalCurrentYear(modalCurrentYear - 1);
    } else {
      setModalCurrentMonth(modalCurrentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (modalCurrentMonth === 11) {
      setModalCurrentMonth(0);
      setModalCurrentYear(modalCurrentYear + 1);
    } else {
      setModalCurrentMonth(modalCurrentMonth + 1);
    }
  };

  const getModalMonthName = (monthNumber: number) => {
    const date = new Date();
    date.setMonth(monthNumber);
    const monthName = date.toLocaleString('pt-BR', { month: 'long' });
    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINAL_DE_SEMANA':
        return 'bg-gray-400';
      case 'FALTA':
        return 'bg-red-500';
      case 'ATESTADO':
        return 'bg-yellow-500';
      case 'FERIAS':
        return 'bg-green-500';
      case 'NAO_ADMITIDO':
        return 'bg-gray-300';
      case 'FUTURO':
        return 'bg-gray-200';
      default:
        return 'bg-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'FINAL_DE_SEMANA':
        return 'Final de Semana';
      case 'FALTA':
        return 'Falta';
      case 'ATESTADO':
        return 'Atestado';
      case 'FERIAS':
        return 'Férias';
      case 'NAO_ADMITIDO':
        return 'Não Admitido';
      case 'FUTURO':
        return '-';
      default:
        return 'N/A';
    }
  };

  const getTextColor = (status: string) => {
    // Se for um centro de custo específico (não um status especial)
    if (status && !['FINAL_DE_SEMANA', 'FALTA', 'ATESTADO', 'FERIAS', 'NAO_ADMITIDO', 'FUTURO'].includes(status)) {
      return 'text-blue-600 font-semibold'; // Cor padrão para centros de custo
    }
    
    switch (status) {
      case 'FINAL_DE_SEMANA':
        return 'text-gray-400';
      case 'FALTA':
        return 'text-red-600 font-semibold';
      case 'ATESTADO':
        return 'text-yellow-600 font-semibold';
      case 'FERIAS':
        return 'text-green-600 font-semibold';
      case 'NAO_ADMITIDO':
        return 'text-gray-400';
      case 'FUTURO':
        return 'text-gray-300';
      default:
        return 'text-blue-600 font-semibold'; // Cor padrão para centros de custo
    }
  };

  // Função para determinar o status de um dia específico
  const getDayStatus = (day: number, month: number, year: number) => {
    console.log('=== getDayStatus called ===');
    console.log('selectedEmployee:', selectedEmployee);
    console.log('employeeData:', employeeData);
    
    if (!selectedEmployee || !employeeData?.data) {
      console.log('Missing data - returning FUTURO');
      return { status: 'FUTURO', costCenter: null };
    }

    const date = new Date(year, month, day);
    const dateString = date.toISOString().split('T')[0];
    const today = new Date();
    // Buscar admissionDate do employeeData (que vem da API), não do selectedEmployee (que vem da tabela)
    const employeeFromApi = employeeData?.data?.employee;
    const admissionDate = employeeFromApi?.admissionDate ? new Date(employeeFromApi.admissionDate) : 
                          employeeFromApi?.hireDate ? new Date(employeeFromApi.hireDate) : null;
    
    // Debug: verificar se admissionDate está chegando
    console.log('EmployeeFromApi:', employeeFromApi);
    console.log('AdmissionDate from API:', admissionDate, 'Date:', date, 'DateString:', dateString);
    console.log('Date <= AdmissionDate:', admissionDate ? date <= admissionDate : false, 'Date < AdmissionDate:', admissionDate ? date < admissionDate : false);

    // Verificar se é futuro
    if (date > today) {
      return { status: 'FUTURO', costCenter: null };
    }

    // Verificar se funcionário estava admitido na data (incluindo o dia da admissão)
    if (admissionDate) {
      const admissionDateString = admissionDate.toISOString().split('T')[0];
      console.log('Comparing dates:', dateString, '<', admissionDateString, 'Result:', dateString < admissionDateString);
      console.log('Is admission day:', dateString === admissionDateString);
      
      if (dateString < admissionDateString) {
        // Se é final de semana antes da admissão, mostrar como final de semana
        if (date.getDay() === 0 || date.getDay() === 6) {
          return { status: 'FINAL_DE_SEMANA', costCenter: null };
        }
        // Se é dia útil antes da admissão, mostrar como não admitido
        return { status: 'NAO_ADMITIDO', costCenter: null };
      }
      
      // Se é exatamente o dia da admissão
      if (dateString === admissionDateString) {
        // Buscar dados do dia da admissão para ver se trabalhou
        const dayData = employeeData.data.days?.find((d: any) => d.date === dateString);
        
        if (dayData && dayData.points && dayData.points.length > 0) {
          // Se trabalhou, mostrar o centro de custo normalmente
          const costCenter = dayData.points[0].costCenter;
          return { status: costCenter, costCenter };
        } else {
          // Se não trabalhou no dia da admissão, mostrar como falta normalmente
          return { status: 'FALTA', costCenter: null };
        }
      }
    }

    // Verificar se é final de semana após admissão
    if (date.getDay() === 0 || date.getDay() === 6) {
      return { status: 'FINAL_DE_SEMANA', costCenter: null };
    }

    // Buscar dados do dia específico
    const dayData = employeeData.data.days?.find((d: any) => d.date === dateString);
    
    if (dayData) {
      // Verificar se está em férias
      if (dayData.isOnVacation) {
        return { status: 'FERIAS', costCenter: null };
      }
      
      // Verificar se está com atestado médico
      if (dayData.hasMedicalCertificate) {
        return { status: 'ATESTADO', costCenter: null };
      }
      
      // Se tem pontos, usar o centro de custo do primeiro ponto
      if (dayData.points && dayData.points.length > 0) {
        const costCenter = dayData.points[0].costCenter;
        return { status: costCenter, costCenter };
      }
      
      // Se não tem pontos mas deveria ter (dia útil após admissão)
      return { status: 'FALTA', costCenter: null };
    }

    // Se não encontrou dados para o dia
    return { status: 'FALTA', costCenter: null };
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

  const getMonthName = (monthNumber: number) => {
    const date = new Date();
    date.setMonth(monthNumber - 1);
    return date.toLocaleString('pt-BR', { month: 'long' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  const employees = employeesResponse?.data?.employees || [];

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
    <ProtectedRoute route="/relatorios/alocacao">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Alocação de Funcionários</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600">Visualize a alocação de todos os funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="border-b-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-900" />
                <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              </div>
              <div className="flex items-center space-x-4">
                {!isFiltersMinimized && (
                  <>
                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="flex items-center justify-center w-8 h-8 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
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
                  className="flex items-center justify-center w-8 h-8 text-gray-900 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
                <label className="block text-sm font-medium text-gray-700">
                  Buscar Funcionário
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={handleSearchChange}
                    placeholder="Digite nome, CPF, matrícula, setor, empresa ou qualquer informação..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              {/* Filtros de Período - Sempre Visíveis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mês
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select
                      value={filters.month}
                      onChange={handleMonthChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ano
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select
                      value={filters.year}
                      onChange={handleYearChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                    <h4 className="text-sm font-medium text-gray-700">Filtros Específicos</h4>
                  </div>
                  
                  {/* Grupo 1: Informações Básicas */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Informações Básicas</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Setor
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.department}
                            onChange={handleDepartmentChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Cargo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.position}
                            onChange={handlePositionChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Empresa
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.company}
                            onChange={handleCompanyChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                    <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Informações Financeiras</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Centro de Custo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.costCenter}
                            onChange={handleCostCenterChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tomador
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.client}
                            onChange={handleClientChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Polo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.polo}
                            onChange={handlePoloChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Modalidade
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.modality}
                            onChange={handleModalityChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                    <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Informações Bancárias</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Banco
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.bank}
                            onChange={handleBankChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tipo de Conta
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.accountType}
                            onChange={handleAccountTypeChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Alocação de Funcionários</h3>
                  <p className="text-sm text-gray-600">Dados de alocação dos funcionários</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-white z-10 border-r border-gray-200">
                      Funcionário
                    </th>
                    {/* Colunas dos dias do mês */}
                    {Array.from({ length: getDaysInMonth(filters.year, filters.month - 1) }, (_, i) => {
                      const day = i + 1;
                      const date = new Date(filters.year, filters.month - 1, day);
                      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                      const dayName = dayNames[date.getDay()];
                      
                      return (
                        <th key={day} className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-16">
                          <div>{dayName}</div>
                          <div>({day}/{filters.month})</div>
                        </th>
                      );
                    })}
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-white z-10 border-l border-gray-200">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingEmployees ? (
                    <tr>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                          <span className="text-gray-600">Carregando funcionários...</span>
                        </div>
                      </td>
                      <td colSpan={getDaysInMonth(filters.year, filters.month - 1)} className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                          <span className="text-gray-600">Carregando funcionários...</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white z-10 border-l border-gray-200">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                          <span className="text-gray-600">Carregando funcionários...</span>
                        </div>
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200">
                        <div className="text-gray-500">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                      <td colSpan={getDaysInMonth(filters.year, filters.month - 1)} className="px-6 py-8 text-center">
                        <div className="text-gray-500">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white z-10 border-l border-gray-200">
                        <div className="text-gray-500">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee: PayrollEmployee) => (
                      <tr key={employee.id} className="hover:transition-colors">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {employee.name}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400">
                              {employee.polo || 'N/A'}
                            </div>
                          </div>
                        </td>
                        {/* Células dos dias do mês - DADOS REAIS DO FUNCIONÁRIO */}
                        {Array.from({ length: getDaysInMonth(filters.year, filters.month - 1) }, (_, i) => {
                          const day = i + 1;
                          const month = filters.month - 1;
                          const year = filters.year;
                          const date = new Date(year, month, day);
                          const today = new Date();
                          const dateString = date.toISOString().split('T')[0];
                          
                          let cellClass = 'px-1 py-2 text-center text-xs ';
                          let cellContent = '';
                          
                          // Verificar se é futuro
                          if (date > today) {
                            cellClass += 'text-gray-400';
                            cellContent = '-';
                          }
                          // Verificar se é final de semana
                          else if (date.getDay() === 0 || date.getDay() === 6) {
                            cellClass += 'text-gray-400';
                            cellContent = 'FDS';
                          }
                          // Para dias úteis, usar dados reais baseados no funcionário
                          else {
                            // Buscar dados reais do funcionário
                            const employeeData = employeeDataMap[employee.id];
                            
                            // Verificar se funcionário estava admitido na data
                            const admissionDate = employeeData?.data?.employee?.admissionDate ? 
                                                 new Date(employeeData.data.employee.admissionDate) : 
                                                 employee.admissionDate ? new Date(employee.admissionDate) : null;
                            
                            if (admissionDate) {
                              const admissionDateString = admissionDate.toISOString().split('T')[0];
                              
                              // Se é antes da admissão
                              if (dateString < admissionDateString) {
                                cellClass += 'text-gray-400';
                                cellContent = 'N/A';
                              }
                              // Se é dia da admissão ou depois
                              else {
                                if (employeeData?.data?.days) {
                                  // Encontrar dados do dia específico
                                  const dayData = employeeData.data.days.find((d: any) => d.date === dateString);
                                  
                                  if (dayData) {
                                    // Verificar se está em férias
                                    if (dayData.isOnVacation) {
                                      cellClass += 'text-green-600';
                                      cellContent = 'FÉRIAS';
                                    }
                                    // Verificar se está com atestado médico
                                    else if (dayData.hasMedicalCertificate) {
                                      cellClass += 'text-yellow-600';
                                      cellContent = 'ATESTADO';
                                    }
                                    // Se tem pontos, usar o centro de custo do primeiro ponto
                                    else if (dayData.points && dayData.points.length > 0) {
                                      const costCenter = dayData.points[0].costCenter;
                                      cellClass += 'text-blue-600';
                                      cellContent = costCenter || 'N/A';
                                    }
                                    // Se não tem pontos mas deveria ter (dia útil após admissão)
                                    else {
                                      cellClass += 'text-red-600';
                                      cellContent = 'Falta';
                                    }
                                  } else {
                                    // Se não encontrou dados para o dia, mostrar falta
                                    cellClass += 'text-red-600';
                                    cellContent = 'Falta';
                                  }
                                } else {
                                  // Se não tem dados do funcionário ainda, mostrar indicador de carregamento
                                  cellClass += 'text-gray-400';
                                  cellContent = '...';
                                  
                                  // Buscar dados do funcionário em background
                                  fetchEmployeeData(employee.id);
                                }
                              }
                            } else {
                              // Se não tem data de admissão, usar lógica padrão
                              if (employeeData?.data?.days) {
                                const dayData = employeeData.data.days.find((d: any) => d.date === dateString);
                                
                                if (dayData) {
                                  if (dayData.isOnVacation) {
                                    cellClass += 'text-green-600';
                                    cellContent = 'FÉRIAS';
                                  } else if (dayData.hasMedicalCertificate) {
                                    cellClass += 'text-yellow-600';
                                    cellContent = 'ATESTADO';
                                  } else if (dayData.points && dayData.points.length > 0) {
                                    const costCenter = dayData.points[0].costCenter;
                                    cellClass += 'text-blue-600';
                                    cellContent = costCenter || 'N/A';
                                  } else {
                                    cellClass += 'text-red-600';
                                    cellContent = 'Falta';
                                  }
                                } else {
                                  cellClass += 'text-red-600';
                                  cellContent = 'Falta';
                                }
                              } else {
                                // Se não tem dados do funcionário ainda, mostrar indicador de carregamento
                                cellClass += 'text-gray-400';
                                cellContent = '...';
                                fetchEmployeeData(employee.id);
                              }
                            }
                          }
                          
                          return (
                            <td key={day} className={cellClass}>
                              {cellContent}
                            </td>
                          );
                        })}
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white z-10 border-l border-gray-200">
                          <button
                            onClick={() => handleViewDetails(employee)}
                            className="p-2 text-yellow-600 hover:text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors"
                            title="Ver Centro de Custo"
                          >
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Estatísticas */}
            {employees.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center space-x-6">
                    <span>
                      <strong>Período:</strong> {getMonthName(filters.month)} de {filters.year}
                    </span>
                    <span>
                      <strong>Total de funcionários:</strong> {employees.length}
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

        {/* Modal de Centro de Custo */}
        {isModalOpen && selectedEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={handleCloseModal} />
            <div className="relative w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
              <button
                onClick={handleCloseModal}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
              
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Centro de Custo - {selectedEmployee.name}
                </h3>
                <p className="text-sm text-gray-600">
                  CPF: {selectedEmployee.cpf} | Setor: {selectedEmployee.department}
                </p>
              </div>

              {/* Navegação do Mês */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={handlePreviousMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h4 className="text-lg font-semibold text-gray-900">
                  {getModalMonthName(modalCurrentMonth)} de {modalCurrentYear}
                </h4>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Calendário */}
              {loadingEmployeeData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">Carregando dados...</span>
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1 mb-6">
                {/* Cabeçalho dos dias da semana */}
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 bg-gray-50">
                    {day}
                  </div>
                ))}
                
                {/* Dias do mês */}
                {Array.from({ length: getFirstDayOfMonth(modalCurrentYear, modalCurrentMonth) }, (_, i) => (
                  <div key={`empty-${i}`} className="p-2 h-12"></div>
                ))}
                
                {Array.from({ length: getDaysInMonth(modalCurrentYear, modalCurrentMonth) }, (_, i) => {
                  const day = i + 1;
                  const date = new Date(modalCurrentYear, modalCurrentMonth, day);
                  
                  // Usar dados reais do funcionário
                  const dayStatus = getDayStatus(day, modalCurrentMonth, modalCurrentYear);
                  
                  // Debug: verificar status do dia
                  console.log('Day:', day, 'Status:', dayStatus.status, 'CostCenter:', dayStatus.costCenter);
                  
                  return (
                    <div
                      key={day}
                      className={`p-1 h-16 border border-gray-200 rounded-lg flex flex-col items-center justify-center text-xs font-medium cursor-pointer hover:bg-gray-50 ${
                        dayStatus.status === 'NAO_ADMITIDO' ? 'bg-gray-100 border-gray-300' : ''
                      } ${
                        dayStatus.status === 'FINAL_DE_SEMANA' ? 'bg-gray-100 border-gray-300' : ''
                      }`}
                      title={`${day} - ${getStatusLabel(dayStatus.status)}${dayStatus.costCenter ? ` (${dayStatus.costCenter})` : ''}`}
                    >
                      <div className="text-gray-600 mb-1">{day}</div>
                      <div className={`text-xs text-center leading-tight ${getTextColor(dayStatus.costCenter || dayStatus.status)}`}>
                        {dayStatus.status === 'NAO_ADMITIDO' ? 'Não Admitido' : (dayStatus.costCenter || getStatusLabel(dayStatus.status))}
                      </div>
                    </div>
                  );
                })}
                </div>
              )}

              {/* Legenda removida */}
            </div>
          </div>
        )}
      </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
