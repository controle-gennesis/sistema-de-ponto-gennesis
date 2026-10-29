'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Cake, Search, Calendar, Users, Mail, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

interface BirthdayEmployee {
  id: string;
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  position: string;
  birthDate: string;
  birthMonth?: number;
  birthDay: number;
  age: number;
  daysUntilBirthday: number;
  isTodayBirthday: boolean;
}

interface BirthdayStats {
  total: number;
  todayBirthdays: number;
  byDepartment: Record<string, number>;
}

interface BirthdayResponse {
  employees: BirthdayEmployee[];
  stats: BirthdayStats;
  month: number;
  year: number;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  ...MONTH_NAMES.map((month, index) => ({ value: String(index + 1), label: month })),
]);

export default function AniversariantesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const [selectedMonth, setSelectedMonth] = useState<string | number>(new Date().getMonth() + 1);
  const selectedYear = new Date().getFullYear(); // Sempre o ano atual
  const [searchTerm, setSearchTerm] = useState<string>('');
  const showAllBirthdays = true; // Sempre true para mostrar todos os aniversários do mês
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const currentMonthDefault = new Date().getMonth() + 1;
  const hasActiveFilter = selectedMonth !== currentMonthDefault;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Query para buscar aniversariantes
  const { data: birthdayData, isLoading: loadingBirthdays, error } = useQuery({
    queryKey: ['birthdays', selectedMonth, selectedYear, searchTerm, showAllBirthdays],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(selectedMonth !== 'all' && { month: selectedMonth.toString() }),
        year: selectedYear.toString(),
        ...(searchTerm && { search: searchTerm }),
        showAll: 'true' // Sempre mostrar todos os aniversários do mês
      });
      
      const res = await api.get(`/users/birthdays?${params}`);
      return res.data;
    },
    enabled: !!userData?.data
  });

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/aniversariantes">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  

  const birthdayResponse: BirthdayResponse = birthdayData?.data || {
    employees: [],
    stats: { total: 0, todayBirthdays: 0, byDepartment: {} },
    month: selectedMonth,
    year: selectedYear
  };

  const months = MONTH_NAMES;


  const getAgeText = (age: number) => {
    return age === 1 ? '1 ano' : `${age} anos`;
  };

  const getDaysText = (days: number, isToday: boolean) => {
    if (isToday) return 'Hoje!';
    if (days === 1) return 'Amanhã';
    return `Em ${days} dias`;
  };

  // Função para agrupar aniversariantes por mês
  const groupByMonth = (employees: BirthdayEmployee[]) => {
    const grouped: Record<number, BirthdayEmployee[]> = {};
    
    employees.forEach((employee) => {
      const month = employee.birthMonth || (selectedMonth !== 'all' && typeof selectedMonth === 'number' ? selectedMonth : new Date().getMonth() + 1);
      if (!grouped[month]) {
        grouped[month] = [];
      }
      grouped[month].push(employee);
    });

    // Ordenar por mês e dentro de cada mês por dia
    const sortedMonths = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    sortedMonths.forEach((month) => {
      grouped[month].sort((a, b) => a.birthDay - b.birthDay);
    });

    return { grouped, sortedMonths };
  };

  const sendBirthdayMessage = (employee: BirthdayEmployee) => {
    const subject = `Parabéns pelo seu aniversário! 🎉`;
    const body = `Olá ${employee.name},\n\nFeliz aniversário! Que este novo ano de vida seja repleto de alegrias, conquistas e momentos especiais.\n\nUm abraço da equipe Gennesis Engenharia!`;
    
    const mailtoLink = `mailto:${employee.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  return (
    <ProtectedRoute route="/ponto/aniversariantes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <PageStack>
        <ListPageHeader
          title="Aniversariantes"
          description={
            selectedMonth === 'all'
              ? `Todos os meses - ${selectedYear}`
              : `${months[typeof selectedMonth === 'number' ? selectedMonth - 1 : 0]} ${selectedYear}`
          }
        />

        {/* Estatísticas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <FilterStatCard
            label="Aniversariantes este mês"
            count={birthdayResponse.stats.total}
            icon={Users}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
          />
          <FilterStatCard
            label="Aniversariantes hoje"
            count={birthdayResponse.stats.todayBirthdays}
            icon={Calendar}
            iconBg="bg-green-100 dark:bg-green-900/30"
            iconColor="text-green-600 dark:text-green-400"
          />
        </div>

        {/* Busca e filtros */}
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                  <Cake className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Aniversariantes
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Funcionários que fazem aniversário no período
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className={cadastroListClasses.searchFilterGroup}>
                  <div className={cadastroListClasses.searchFieldInGroup}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar aniversariante..."
                      className={`${FORM_FIELD_INPUT_CLS} h-10 pl-9`}
                    />
                  </div>
                  <div className={cadastroListClasses.filterIconButtonWrap}>
                    <button
                      type="button"
                      onClick={() => setIsFiltersOpen(true)}
                      className={`${cadastroListClasses.filterIconButton} transition-colors ${
                        hasActiveFilter
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      aria-label="Abrir filtros"
                      title={hasActiveFilter ? 'Filtros (ativos)' : 'Filtros'}
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveFilter ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Lista de Aniversariantes */}
        <Card>
          <CardContent className="p-6">
            {loadingBirthdays ? (
              <CadastroListLoading message="Carregando aniversariantes..." />
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600 dark:text-red-400">Erro ao carregar aniversariantes</p>
              </div>
            ) : birthdayResponse.employees.length === 0 ? (
              <div className="text-center py-8">
                <Cake className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Nenhum aniversariante encontrado
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {selectedMonth === 'all' 
                    ? `Não há funcionários fazendo aniversário` 
                    : `Não há funcionários fazendo aniversário em ${typeof selectedMonth === 'number' ? months[selectedMonth - 1] : ''} ${selectedYear}`}
                </p>
              </div>
            ) : selectedMonth === 'all' ? (
              // Renderização agrupada por mês quando "Todos" está selecionado
              (() => {
                const { grouped, sortedMonths } = groupByMonth(birthdayResponse.employees);
                return (
                  <div className="space-y-6">
                    {sortedMonths.map((month) => (
                      <div key={month} className="space-y-4">
                        {/* Header do mês */}
                        <div className="flex items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                            {months[month - 1]}
                          </h3>
                          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                            {grouped[month].length}
                          </span>
                        </div>

                        {/* Grid de cards do mês */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {grouped[month].map((employee) => (
                            <Card
                              key={employee.id}
                              className={`relative transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
                                employee.isTodayBirthday
                                  ? 'border-blue-300 dark:border-blue-600 bg-gradient-to-br from-blue-50 dark:from-blue-900/30 to-blue-50 dark:to-blue-900/30'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600'
                              }`}
                            >
                              {/* Badge de hoje */}
                              {employee.isTodayBirthday && (
                                <div className="absolute -top-2 -right-2 bg-pink-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                                  HOJE!
                                </div>
                              )}

                              <CardContent className="p-6">
                                <div className="text-center">
                                  {/* Avatar */}
                                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-xl font-bold text-blue-500 dark:text-blue-400 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400`}>
                                    {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>

                                  {/* Nome */}
                                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                    {employee.name}
                                  </h3>

                                  {/* Departamento */}
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    {employee.department}
                                  </p>

                                  {/* Data de aniversário */}
                                  <div className="flex items-center justify-center space-x-2 mb-2">
                                    <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      {employee.birthDay} de {months[month - 1]}
                                    </span>
                                  </div>

                                  {/* Idade */}
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    {getAgeText(employee.age)}
                                  </p>

                                  {/* Dias restantes */}
                                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4 ${
                                    employee.isTodayBirthday
                                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                                  }`}>
                                    {getDaysText(employee.daysUntilBirthday, employee.isTodayBirthday)}
                                  </div>

                                  {/* Botão de parabéns */}
                                  <button
                                    onClick={() => sendBirthdayMessage(employee)}
                                    className="w-full bg-blue-500 dark:bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-all duration-200 flex items-center justify-center space-x-2"
                                  >
                                    <Mail className="w-4 h-4" />
                                    <span>Enviar Parabéns</span>
                                  </button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              // Renderização normal quando um mês específico está selecionado
              <div className="space-y-4">
                {/* Header do mês */}
                {typeof selectedMonth === 'number' && (
                  <div className="flex items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                      {months[selectedMonth - 1]}
                    </h3>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {birthdayResponse.employees.length}
                    </span>
                  </div>
                )}

                {/* Grid de cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {birthdayResponse.employees.map((employee) => (
                  <Card
                    key={employee.id}
                    className={`relative transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
                      employee.isTodayBirthday
                        ? 'border-blue-300 dark:border-blue-600 bg-gradient-to-br from-blue-50 dark:from-blue-900/30 to-blue-50 dark:to-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600'
                    }`}
                  >
                    {/* Badge de hoje */}
                    {employee.isTodayBirthday && (
                      <div className="absolute -top-2 -right-2 bg-pink-500 dark:bg-pink-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                        HOJE!
                      </div>
                    )}

                    <CardContent className="p-6">
                      <div className="text-center">
                        {/* Avatar */}
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-xl font-bold text-blue-500 dark:text-blue-400 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400`}>
                          {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>

                        {/* Nome */}
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          {employee.name}
                        </h3>

                        {/* Departamento */}
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {employee.department}
                        </p>

                        {/* Data de aniversário */}
                        <div className="flex items-center justify-center space-x-2 mb-2">
                          <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {employee.birthDay} de {employee.birthMonth ? months[employee.birthMonth - 1] : (typeof selectedMonth === 'number' ? months[selectedMonth - 1] : '')}
                          </span>
                        </div>

                        {/* Idade */}
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {getAgeText(employee.age)}
                        </p>

                        {/* Dias restantes */}
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4 ${
                          employee.isTodayBirthday
                            ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                        }`}>
                          {getDaysText(employee.daysUntilBirthday, employee.isTodayBirthday)}
                        </div>

                        {/* Botão de parabéns */}
                        <button
                          onClick={() => sendBirthdayMessage(employee)}
                          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:transition-all duration-200 flex items-center justify-center space-x-2"
                        >
                          <Mail className="w-4 h-4" />
                          <span>Enviar Parabéns</span>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </PageStack>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Aniversariantes"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Mês
              </label>
              <StringSingleSelectDropdown
                value={String(selectedMonth)}
                onChange={(value) => {
                  setSelectedMonth(value === 'all' ? 'all' : parseInt(value));
                }}
                options={MONTH_FILTER_OPTIONS}
                allowEmpty={false}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthDefault)}
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
          </div>
        </Modal>

      </MainLayout>
    </ProtectedRoute>
  );
}
