'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { Checkbox } from '@/components/ui/Checkbox';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Plus, 
  Edit, 
  Trash2, 
  Download,
  Upload,
  RefreshCw,
  Filter,
  Search,
  X,
  Check,
  AlertCircle,
  MapPin,
  Building2,
  Flag,
  ChevronDown,
  ChevronUp,
  RotateCcw
} from 'lucide-react';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'NATIONAL' | 'STATE' | 'MUNICIPAL' | 'OPTIONAL' | 'COMPANY';
  isRecurring: boolean;
  state?: string;
  city?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const HOLIDAY_TYPE_OPTIONS = labeledToSelectOptions([
  { value: 'NATIONAL', label: 'Nacional' },
  { value: 'STATE', label: 'Estadual' },
  { value: 'MUNICIPAL', label: 'Municipal' },
  { value: 'OPTIONAL', label: 'Ponto Facultativo' },
  { value: 'COMPANY', label: 'Empresa' },
]);

const HOLIDAY_TYPE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos os tipos' },
  { value: 'NATIONAL', label: 'Nacional' },
  { value: 'STATE', label: 'Estadual' },
  { value: 'MUNICIPAL', label: 'Municipal' },
  { value: 'OPTIONAL', label: 'Ponto Facultativo' },
  { value: 'COMPANY', label: 'Empresa' },
]);

const HOLIDAY_STATE_OPTIONS = labeledToSelectOptions([
  { value: 'DF', label: 'Distrito Federal (DF) - Brasília' },
  { value: 'GO', label: 'Goiás (GO)' },
]);

function GerenciarFeriadosPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const yearFilterOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    []
  );
  const monthFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos os meses', searchText: 'Todos os meses' },
      ...Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        return {
          value: String(month),
          label: new Date(2000, month - 1).toLocaleDateString('pt-BR', { month: 'long' }),
        };
      }),
    ],
    []
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const hasAdvancedFilters = selectedMonth != null || !!filterType || selectedYear !== new Date().getFullYear();
  const [formData, setFormData] = useState<{
    name: string;
    date: string;
    type: Holiday['type'];
    isRecurring: boolean;
    state?: string;
    city: string;
    description: string;
    isActive: boolean;
  }>({
    name: '',
    date: '',
    type: 'NATIONAL',
    isRecurring: false,
    state: undefined,
    city: '',
    description: '',
    isActive: true,
  });
  const [importYear, setImportYear] = useState(new Date().getFullYear());

  // Buscar dados do usuário
  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  // Buscar feriados
  const { data: holidaysData, isLoading } = useQuery({
    queryKey: ['holidays', selectedYear, selectedMonth, filterType],
    queryFn: async () => {
      const params: any = { year: selectedYear };
      if (selectedMonth) params.month = selectedMonth;
      if (filterType) params.type = filterType;
      // Não filtrar por isActive na página de gerenciamento - mostrar todos
      
      const res = await api.get('/holidays', { params });
      console.log('Feriados recebidos:', res.data);
      return res.data;
    },
  });

  const holidays: Holiday[] = holidaysData?.data || [];

  // Filtrar por termo de busca
  const filteredHolidays = holidays.filter(holiday =>
    textMatchesSearch(holiday.name, searchTerm) ||
    textMatchesSearch(holiday.description, searchTerm)
  );

  const PAGE_SIZE = 10;
  const listRange = getCadastroListRange(page, PAGE_SIZE, filteredHolidays.length);
  const currentPage = Math.min(page, listRange.totalPages);
  const pagedHolidays = filteredHolidays.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Mutation para criar feriado
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/holidays', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Feriado criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar feriado');
    },
  });

  // Mutation para atualizar feriado
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/holidays/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Feriado atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsModalOpen(false);
      setEditingHoliday(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar feriado');
    },
  });

  // Mutation para deletar feriado
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/holidays/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Feriado deletado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: () => {
      toast.error('Erro ao deletar feriado');
    },
  });

  // Mutation para importar feriados nacionais
  const importMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await api.post('/holidays/import/national', { year });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.count} feriados nacionais importados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsImportModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao importar feriados');
    },
  });

  // Mutation para gerar feriados recorrentes
  const generateRecurringMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await api.post('/holidays/generate/recurring', { year });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.count} feriados recorrentes gerados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao gerar feriados');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      date: '',
      type: 'NATIONAL',
      isRecurring: false,
      state: undefined,
      city: '',
      description: '',
      isActive: true,
    });
    setEditingHoliday(null);
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: holiday.date.split('T')[0],
      type: holiday.type,
      isRecurring: holiday.isRecurring,
      state: holiday.state,
      city: holiday.city || '',
      description: holiday.description || '',
      isActive: holiday.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date) {
      toast.error('Informe a data do feriado');
      return;
    }
    // Limpar campos vazios antes de enviar
    const dataToSend = {
      ...formData,
      state: formData.state || undefined,
      city: formData.city || undefined,
      description: formData.description || undefined,
    };
    
    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este feriado?')) {
      deleteMutation.mutate(id);
    }
  };

  const getTypeLabel = (type: Holiday['type']) => {
    const labels: Record<Holiday['type'], string> = {
      NATIONAL: 'Nacional',
      STATE: 'Estadual',
      MUNICIPAL: 'Municipal',
      OPTIONAL: 'Ponto Facultativo',
      COMPANY: 'Empresa',
    };
    return labels[type];
  };

  const getTypeIcon = (type: Holiday['type']) => {
    switch (type) {
      case 'NATIONAL':
        return <Flag className="w-4 h-4 text-blue-500" />;
      case 'STATE':
        return <MapPin className="w-4 h-4 text-green-500" />;
      case 'MUNICIPAL':
        return <Building2 className="w-4 h-4 text-purple-500" />;
      case 'OPTIONAL':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'COMPANY':
        return <Building2 className="w-4 h-4 text-orange-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStateName = (stateCode?: string) => {
    if (!stateCode) return null;
    const states: Record<string, string> = {
      'DF': 'Distrito Federal (Brasília)',
      'GO': 'Goiás',
    };
    return states[stateCode] || stateCode;
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={() => {
        localStorage.removeItem('token');
        router.push('/auth/login');
      }}
    >
      <PageStack>
        <ListPageHeader
          title="Gerenciar Feriados"
          description="Gerencie o calendário de feriados da empresa"
        />

        {/* Lista de Feriados */}
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <Calendar className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feriados ({filteredHolidays.length})</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Calendário de feriados da empresa</p>
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
                      placeholder="Buscar feriado..."
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
                      title="Filtros"
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
                  onClick={() => generateRecurringMutation.mutate(selectedYear)}
                  disabled={generateRecurringMutation.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  title="Gerar feriados recorrentes"
                >
                  <RefreshCw className={`h-4 w-4 ${generateRecurringMutation.isPending ? 'animate-spin' : ''}`} />
                  <span>Gerar Recorrentes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  title="Importar feriados nacionais"
                >
                  <Upload className="h-4 w-4" />
                  <span>Importar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(true);
                  }}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  title="Criar novo feriado"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Novo Feriado</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {isLoading ? (
              <CadastroListLoading message="Carregando feriados..." />
            ) : filteredHolidays.length === 0 ? (
              <CadastroListEmpty
                icon={Calendar}
                title="Nenhum feriado encontrado"
                hint="Ajuste os filtros ou cadastre um novo feriado."
              />
            ) : (
              <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={filteredHolidays.length}
                itemLabel="feriado"
                itemLabelPlural="feriados"
                currentPage={currentPage}
                totalPages={listRange.totalPages}
              />
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={cadastroListClasses.th}>Data</th>
                      <th className={cadastroListClasses.th}>Nome</th>
                      <th className={cadastroListClasses.thCenter}>Tipo</th>
                      <th className={cadastroListClasses.thCenter}>Localização</th>
                      <th className={cadastroListClasses.thCenter}>Recorrente</th>
                      <th className={cadastroListClasses.thCenter}>Status</th>
                      <th className={cadastroListClasses.thRight}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {pagedHolidays.map((holiday) => (
                      <tr key={holiday.id} className={listTableRowClasses.tr}>
                        <td className={`${cadastroListClasses.td} whitespace-nowrap font-medium`}>
                          {formatDate(holiday.date)}
                        </td>
                        <td className={cadastroListClasses.td}>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{holiday.name}</span>
                          {holiday.description && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{holiday.description}</div>
                          )}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <div className="flex items-center justify-center gap-2">
                            {getTypeIcon(holiday.type)}
                            <span>{getTypeLabel(holiday.type)}</span>
                          </div>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {holiday.city ? (
                            <span>{holiday.city}, {getStateName(holiday.state) || holiday.state}</span>
                          ) : holiday.state ? (
                            <span>{getStateName(holiday.state)}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">Nacional</span>
                          )}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {holiday.isRecurring ? (
                            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Check className="h-4 w-4" />
                              <span>Sim</span>
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">Não</span>
                          )}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {holiday.isActive ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(holiday)}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                              title="Editar feriado"
                              aria-label="Editar feriado"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(holiday.id)}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-red-600 transition-colors hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
                              title="Excluir feriado"
                              aria-label="Excluir feriado"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPagination
                currentPage={currentPage}
                totalPages={listRange.totalPages}
                onPageChange={setPage}
              />
              </>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Gerenciar Feriados"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
              <StringSingleSelectDropdown
                value={String(selectedYear)}
                onChange={(v) => setSelectedYear(parseInt(v))}
                options={yearFilterOptions}
                allowEmpty={false}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
              <StringSingleSelectDropdown
                value={selectedMonth != null ? String(selectedMonth) : ''}
                onChange={(v) => setSelectedMonth(v ? parseInt(v) : undefined)}
                options={monthFilterOptions}
                allowEmpty={false}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
              <StringSingleSelectDropdown
                value={filterType}
                onChange={setFilterType}
                options={HOLIDAY_TYPE_FILTER_OPTIONS}
                allowEmpty={false}
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedYear(new Date().getFullYear());
                  setSelectedMonth(undefined);
                  setFilterType('');
                  setPage(1);
                }}
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

        {/* Modal de Criar/Editar Feriado */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            resetForm();
          }}
          title={editingHoliday ? 'Editar Feriado' : 'Novo Feriado'}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome do Feriado *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Ex: Dia do Trabalhador"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data *
              </label>
              <DatePickerField
                value={formData.date}
                onChange={(date) => setFormData({ ...formData, date })}
                placeholder="dd/mm/aaaa"
                aria-label="Data do feriado"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo *
              </label>
              <StringSingleSelectDropdown
                value={formData.type}
                onChange={(newType) => {
                  const currentState: string = formData.state || '';
                  setFormData({
                    ...formData,
                    type: newType as Holiday['type'],
                    state: newType === 'STATE' ? currentState : undefined,
                  });
                }}
                options={HOLIDAY_TYPE_OPTIONS}
                allowEmpty={false}
              />
            </div>

            {formData.type === 'STATE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Estado *
                </label>
                <StringSingleSelectDropdown
                  value={formData.state || ''}
                  onChange={(newState) => {
                    setFormData({ ...formData, state: newState || undefined });
                  }}
                  options={HOLIDAY_STATE_OPTIONS}
                  placeholder="Selecione um estado"
                  emptyOptionLabel="Selecione um estado"
                />
              </div>
            )}

            {formData.type === 'MUNICIPAL' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cidade *
                </label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Ex: São Paulo"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descrição
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={FORM_FIELD_TEXTAREA_CLS}
                rows={3}
                placeholder="Descrição adicional do feriado"
              />
            </div>

            <Checkbox
              checked={formData.isRecurring}
              onChange={(checked) => setFormData({ ...formData, isRecurring: checked })}
              label="Feriado recorrente (todos os anos)"
            />

            <Checkbox
              checked={formData.isActive}
              onChange={(checked) => setFormData({ ...formData, isActive: checked })}
              label="Ativo"
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingHoliday ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal de Importação */}
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Importar Feriados Nacionais"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Importe automaticamente todos os feriados nacionais do Brasil para o ano selecionado.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ano
              </label>
              <Input
                type="number"
                value={importYear}
                onChange={(e) => setImportYear(parseInt(e.target.value))}
                min={2020}
                max={2100}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => importMutation.mutate(importYear)}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? 'Importando...' : 'Importar'}
              </Button>
            </div>
          </div>
        </Modal>
      </PageStack>
    </MainLayout>
  );
}

export default function GerenciarFeriadosPage() {
  return (
    <ProtectedRoute route="/ponto/gerenciar-feriados">
      <GerenciarFeriadosPageContent />
    </ProtectedRoute>
  );
}

