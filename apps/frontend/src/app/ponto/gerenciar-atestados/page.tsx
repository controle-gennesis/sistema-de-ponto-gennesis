'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MedicalCertificateList, type MedicalCertificateStatusTab } from '@/components/medical-certificate/MedicalCertificateList';
import { RegisterAbsenceModal } from '@/components/absence/RegisterAbsenceModal';
import { FileText, Users, Clock, CheckCircle, XCircle, Filter, Search, RotateCcw, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import api from '@/lib/api';
import { DEPARTMENTS_LIST, COMPANIES_LIST } from '@/constants/payrollFilters';
import { CARGOS_LIST } from '@/constants/cargos';

const CERTIFICATE_TYPE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'MEDICAL', label: 'Atestado Médico' },
  { value: 'DENTAL', label: 'Atestado Odontológico' },
  { value: 'PREVENTIVE', label: 'Exame Preventivo' },
  { value: 'ACCIDENT', label: 'Acidente de Trabalho' },
  { value: 'COVID', label: 'COVID-19' },
  { value: 'MATERNITY', label: 'Maternidade' },
  { value: 'PATERNITY', label: 'Paternidade' },
  { value: 'OTHER', label: 'Outros' },
]);
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions, filterOptionsWithAll } from '@/lib/selectOptionBuilders';

const STATUS_LIST_HEADER: Record<
  MedicalCertificateStatusTab,
  { title: string; subtitle: string; Icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Todos os registros',
    subtitle: 'Todas as ausências registradas',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  PENDING: {
    title: 'Ausências pendentes',
    subtitle: 'Ausências aguardando análise',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  APPROVED: {
    title: 'Ausências aprovadas',
    subtitle: 'Ausências já aprovadas',
    Icon: CheckCircle,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  REJECTED: {
    title: 'Ausências rejeitadas',
    subtitle: 'Ausências que foram rejeitadas',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  CANCELLED: {
    title: 'Ausências canceladas',
    subtitle: 'Ausências que foram canceladas',
    Icon: XCircle,
    iconBg: 'bg-gray-100 dark:bg-gray-700',
    iconColor: 'text-gray-600 dark:text-gray-300',
  },
};

export default function AtestadosPage() {
  const [statusTab, setStatusTab] = useState<MedicalCertificateStatusTab>('all');
  const listHeader = STATUS_LIST_HEADER[statusTab];
  const ListHeaderIcon = listHeader.Icon;
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    department: '',
    position: '',
    company: '',
    month: 0, // 0 = todos os meses (sem filtro)
    year: 0 // 0 = todos os anos (sem filtro)
  });

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/auth/login';
  };

  // Buscar estatísticas dos atestados
  const { data: statsData } = useQuery({
    queryKey: ['medical-certificates-stats'],
    queryFn: async () => {
      const response = await api.get('/medical-certificates');
      const certificates = response.data.data.certificates || [];
      
      const stats = {
        total: certificates.length,
        pending: certificates.filter((c: any) => c.status === 'PENDING').length,
        approved: certificates.filter((c: any) => c.status === 'APPROVED').length,
        rejected: certificates.filter((c: any) => c.status === 'REJECTED').length
      };
      
      return stats;
    }
  });

  const stats = statsData || { total: 0, pending: 0, approved: 0, rejected: 0 };

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

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const monthFilterSelectOptions = useMemo(
    () => [
      { value: '0', label: 'Todos os meses', searchText: 'Todos os meses' },
      ...monthOptions.map((m) => ({ value: String(m.value), label: m.label })),
    ],
    []
  );
  const yearFilterSelectOptions = useMemo(
    () => [
      { value: '0', label: 'Todos os anos', searchText: 'Todos os anos' },
      ...yearOptions.map((y) => ({ value: String(y), label: String(y) })),
    ],
    [yearOptions]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, search: e.target.value });
  };

  const handleTypeChange = (value: string) => {
    setFilters({ ...filters, type: value });
  };

  const handleMonthChange = (value: string) => {
    setFilters({ ...filters, month: parseInt(value) });
  };

  const handleYearChange = (value: string) => {
    setFilters({ ...filters, year: parseInt(value) });
  };

  const handleDepartmentChange = (value: string) => {
    setFilters({ ...filters, department: value });
  };

  const handlePositionChange = (value: string) => {
    setFilters({ ...filters, position: value });
  };

  const handleCompanyChange = (value: string) => {
    setFilters({ ...filters, company: value });
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      type: 'all',
      department: '',
      position: '',
      company: '',
      month: 0, // 0 = todos os meses (sem filtro)
      year: 0 // 0 = todos os anos (sem filtro)
    });
  };

  const hasAdvancedFilters = !!(
    filters.type !== 'all' ||
    filters.department ||
    filters.position ||
    filters.company ||
    filters.month ||
    filters.year
  );

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/gerenciar-atestados">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  

  return (
    <ProtectedRoute route="/ponto/gerenciar-atestados">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <PageStack>
        <ListPageHeader
          title="Gerenciar Atestados"
          description="Registre faltas e acompanhe as ausências dos funcionários"
        />

        {/* Estatísticas */}
        <div className={pageStatCardsGridClass}>
          <FilterStatCard
            label="Total"
            count={stats.total}
            icon={Users}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
            isActive={statusTab === 'all'}
            onClick={() => setStatusTab('all')}
          />
          <FilterStatCard
            label="Pendentes"
            count={stats.pending}
            icon={Clock}
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconColor="text-amber-600 dark:text-amber-400"
            isActive={statusTab === 'PENDING'}
            onClick={() => setStatusTab('PENDING')}
          />
          <FilterStatCard
            label="Aprovados"
            count={stats.approved}
            icon={CheckCircle}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
            isActive={statusTab === 'APPROVED'}
            onClick={() => setStatusTab('APPROVED')}
          />
          <FilterStatCard
            label="Rejeitados"
            count={stats.rejected}
            icon={XCircle}
            iconBg="bg-red-100 dark:bg-red-900/30"
            iconColor="text-red-600 dark:text-red-400"
            isActive={statusTab === 'REJECTED'}
            onClick={() => setStatusTab('REJECTED')}
          />
        </div>

        {/* Lista de Atestados */}
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                  <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{listHeader.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
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
                      placeholder="Buscar nome, email ou CPF..."
                      className={`${FORM_FIELD_INPUT_CLS} h-10 pl-9`}
                    />
                  </div>
                  <div className={cadastroListClasses.filterIconButtonWrap}>
                    <button
                      type="button"
                      onClick={() => setIsFiltersOpen(true)}
                      className={`${cadastroListClasses.filterIconButton} transition-colors ${
                        hasAdvancedFilters
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      title={hasAdvancedFilters ? 'Filtros (ativos)' : 'Filtros'}
                      aria-label="Abrir filtros"
                    >
                      <Filter className="h-4 w-4" />
                      {hasAdvancedFilters ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAbsenceModal(true)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Nova Falta</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <MedicalCertificateList showActions={true} statusFilter={statusTab} filters={filters} />
          </CardContent>
        </Card>
      </PageStack>


      <Modal
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        title="Filtros — Gerenciar Atestados"
        size="md"
      >
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tipo
                    </label>
                    <StringSingleSelectDropdown
                      className="w-full"
                      value={filters.type}
                      onChange={handleTypeChange}
                      options={CERTIFICATE_TYPE_FILTER_OPTIONS}
                      allowEmpty={false}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Setor
                    </label>
                    <StringSingleSelectDropdown
                        className="w-full"
                        value={filters.department}
                        onChange={handleDepartmentChange}
                        options={DEPARTMENTS_LIST}
                        emptyOptionLabel="Todos os setores"
                      />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cargo
                    </label>
                    <StringSingleSelectDropdown
                      className="w-full"
                      value={filters.position}
                      onChange={handlePositionChange}
                      options={CARGOS_LIST}
                      emptyOptionLabel="Todos os cargos"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Empresa
                    </label>
                    <StringSingleSelectDropdown
                      className="w-full"
                      value={filters.company}
                      onChange={handleCompanyChange}
                      options={COMPANIES_LIST}
                      emptyOptionLabel="Todas as empresas"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Mês
                    </label>
                    <StringSingleSelectDropdown
                        className="w-full"
                        value={String(filters.month)}
                        onChange={handleMonthChange}
                        options={monthFilterSelectOptions}
                        allowEmpty={false}
                      />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ano
                    </label>
                    <StringSingleSelectDropdown
                        className="w-full"
                        value={String(filters.year)}
                        onChange={handleYearChange}
                        options={yearFilterSelectOptions}
                        allowEmpty={false}
                      />
                  </div>
                </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Aplicar
            </button>
          </div>
      </Modal>

      {/* Modal de Registrar Falta */}
      <RegisterAbsenceModal
        isOpen={showAbsenceModal}
        onClose={() => setShowAbsenceModal(false)}
      />
    </MainLayout>
    </ProtectedRoute>
  );
}