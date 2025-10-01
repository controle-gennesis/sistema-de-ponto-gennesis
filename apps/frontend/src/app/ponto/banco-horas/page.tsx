'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, Users, TrendingUp, Calendar, Filter, Download, Search, Building2, User, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import { DEPARTMENTS_LIST, COST_CENTERS_LIST, CLIENTS_LIST } from '@/constants/payrollFilters';
import { CARGOS_LIST } from '@/constants/cargos';
import * as XLSX from 'xlsx';
import api from '@/lib/api';

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
  status?: string;
  startDate: string;
  endDate: string;
}

export default function BankHoursPage() {
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
      department: '',
      position: '',
      costCenter: '',
      client: '',
      status: '',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

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

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, position: e.target.value }));
  };

  const handleCostCenterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, costCenter: e.target.value }));
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, client: e.target.value }));
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, status: e.target.value }));
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

  // Listener para abrir modal de alterar senha via sidebar
  useEffect(() => {
    const handleOpenChangePasswordModal = () => {
      setIsChangePasswordOpen(true);
    };

    window.addEventListener('openChangePasswordModal', handleOpenChangePasswordModal);
    
    return () => {
      window.removeEventListener('openChangePasswordModal', handleOpenChangePasswordModal);
    };
  }, []);

  const { data: bankHoursData, isLoading: loadingBankHours } = useQuery({
    queryKey: ['bank-hours', filters],
    queryFn: async () => {
      const res = await api.get('/bank-hours/employees', {
        params: { 
          search: filters.search,
          department: filters.department,
          position: filters.position,
          costCenter: filters.costCenter,
          client: filters.client,
          status: filters.status,
          startDate: filters.startDate, 
          endDate: filters.endDate
        }
      });
      return res.data;
    }
  });

  const formatHours = (hours: number) => {
    const sign = hours >= 0 ? '+' : '';
    return `${sign}${hours.toFixed(1)}h`;
  };

  const formatTime = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    const sign = hours >= 0 ? '+' : '-';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (bankHours: number) => {
    if (bankHours > 0) return 'text-green-600 bg-green-100';
    if (bankHours < 0) return 'text-red-600 bg-red-100';
    return 'text-gray-600 bg-gray-100';
  };

  const getStatusText = (bankHours: number) => {
    if (bankHours > 0) return 'Positivo';
    if (bankHours < 0) return 'Negativo';
    return 'Neutro';
  };

  const exportToExcel = () => {
    if (!filteredData || filteredData.length === 0) {
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
      'Horas Trabalhadas': formatTime(employee.totalWorkedHours),
      'Horas Esperadas': formatTime(employee.totalExpectedHours),
      'Banco de Horas': formatTime(employee.bankHours),
      'Horas Extras (Multiplicadas)': formatTime(employee.overtimeMultipliedHours),
      'Status': getStatusText(employee.bankHours)
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

    // Gerar nome do arquivo
    const fileName = `banco-horas.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, fileName);
  };



  if (loadingUser || !userData) {
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

  const filteredData = bankHoursData?.data || [];

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Controle de Banco de Horas</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">Acompanhamento do banco de horas de todos os funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              </div>
              <div className="flex items-center space-x-8">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="flex items-center space-x-1 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <span>Filtros Avançados</span>
                  {showAdvancedFilters ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={clearFilters}
                  className="flex items-center space-x-1 text-sm text-red-600 hover:text-red-800 transition-colors"
                >
                  <span>Limpar</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              {/* Campo de Busca Principal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    Data Inicial
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={handleStartDateChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Final
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={handleEndDateChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>


              {/* Filtros Avançados - Condicionais */}
              {showAdvancedFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Filtros Específicos</h4>
                    <button
                      onClick={clearAdvancedFilters}
                      className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                    >
                      Limpar Filtros Avançados
                    </button>
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
                          Status do Banco
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <select
                            value={filters.status}
                            onChange={handleStatusChange}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                          >
                            <option value="">Todos os status</option>
                            <option value="positive">Positivo</option>
                            <option value="negative">Negativo</option>
                            <option value="neutral">Neutro</option>
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
                            <option value="">Todos os centros de custo</option>
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
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Funcionários</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredData.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Banco Positivo</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {filteredData.filter((emp: BankHoursData) => emp.bankHours > 0).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-red-100 rounded-lg flex-shrink-0">
                  <Clock className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Banco Negativo</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {filteredData.filter((emp: BankHoursData) => emp.bankHours < 0).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Tabela de Banco de Horas */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Banco de Horas</h3>
                  <p className="text-sm text-gray-600">Cálculo do banco de horas de todos os funcionários</p>
                </div>
              </div>
              <button 
                onClick={exportToExcel}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm sm:text-base"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar XLSX</span>
                <span className="sm:hidden">Exportar</span>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingBankHours ? (
              <div className="text-center py-8">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                <p className="text-gray-600">Carregando dados...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm">Funcionário</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden sm:table-cell">Setor</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden md:table-cell">Centro de Custo</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell">Tomador</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell">Horas Trabalhadas</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell">Horas Esperadas</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm">Banco de Horas</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden xl:table-cell">Horas Extras</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((employee: BankHoursData) => (
                      <tr key={employee.employeeId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 sm:px-4">
                          <div>
                            <p className="font-medium text-gray-900 text-sm sm:text-base">{employee.employeeName}</p>
                            <p className="text-xs sm:text-sm text-gray-500">{employee.employeeCpf}</p>
                            <div className="text-xs text-gray-400 sm:hidden mt-1">
                              {employee.department && `${employee.department} • ${employee.costCenter || 'N/A'}`}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center hidden sm:table-cell">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{employee.department}</p>
                            <p className="text-xs text-gray-500">{employee.position}</p>
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden md:table-cell">{employee.costCenter || '-'}</td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden lg:table-cell">{employee.client || '-'}</td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden lg:table-cell">{formatTime(employee.totalWorkedHours)}</td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden lg:table-cell">{formatTime(employee.totalExpectedHours)}</td>
                        <td className="py-3 px-2 sm:px-4 text-center">
                          <span className={`font-medium text-sm ${employee.bankHours >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatTime(employee.bankHours)}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center hidden xl:table-cell">
                          <span className="font-medium text-orange-600 text-sm">
                            {formatTime(employee.overtimeMultipliedHours)}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(employee.bankHours)}`}>
                            {getStatusText(employee.bankHours)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de alterar senha */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={() => {
          setIsChangePasswordOpen(false);
          // Invalidar query para recarregar dados do usuário
          queryClient.invalidateQueries({ queryKey: ['user'] });
        }}
      />
    </MainLayout>
  );
}
