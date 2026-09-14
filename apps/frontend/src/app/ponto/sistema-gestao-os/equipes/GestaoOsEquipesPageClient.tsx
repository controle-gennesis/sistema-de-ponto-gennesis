'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FolderKanban,
  MapPin,
  Plus,
  Power,
  Search,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { formatCpfInput } from '@/lib/cpf';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  GestaoOsLocationTree,
  GestaoOsTeam,
  GestaoOsTeamMemberRole,
  TEAM_MEMBER_ROLE_LABELS
} from '../gestaoOsTypes';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const TEAM_MEMBER_ROLE_OPTIONS = labeledToSelectOptions([
  { value: 'LEADER', label: TEAM_MEMBER_ROLE_LABELS.LEADER },
  { value: 'MEMBER', label: TEAM_MEMBER_ROLE_LABELS.MEMBER }
]);

const TEAMS_QUERY_KEY = ['gestao-os-cadastros', 'teams'] as const;

type Technician = {
  id: string;
  name: string;
  email?: string | null;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
};

function formatPersonCpf(cpf?: string | null) {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length === 11) return formatCpfInput(digits);
  return cpf?.trim() || '—';
}

function personInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function PersonIdentity({
  name,
  cpf,
  profilePhotoUrl
}: {
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
}) {
  const photoHref = resolveApiMediaUrl(profilePhotoUrl ?? null);
  const initials = personInitials(name);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ${
          photoHref ? 'bg-gray-200 dark:bg-gray-700' : 'bg-red-600 text-white'
        }`}
      >
        {photoHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoHref}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium tracking-tight text-gray-900 dark:text-gray-100">
          {name}
        </span>
        <span className="truncate text-[11px] font-normal leading-tight text-gray-500 dark:text-gray-400">
          {formatPersonCpf(cpf)}
        </span>
      </span>
    </span>
  );
}

type TeamFormMember = { userId: string; role: GestaoOsTeamMemberRole };

type TeamFormState = {
  name: string;
  code: string;
  shift: string;
  description: string;
  managerUserId: string;
  members: TeamFormMember[];
  buildingIds: string[];
};

function emptyForm(): TeamFormState {
  return {
    name: '',
    code: '',
    shift: '',
    description: '',
    managerUserId: '',
    members: [],
    buildingIds: []
  };
}

export default function GestaoOsEquipesPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useCadastroCrudPermissions(
    '/ponto/sistema-gestao-os/equipes'
  );
  const showActions = canEdit || canDelete;
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GestaoOsTeam | null>(null);
  const [viewing, setViewing] = useState<GestaoOsTeam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GestaoOsTeam | null>(null);
  const [formData, setFormData] = useState<TeamFormState>(() => emptyForm());
  const [memberSearch, setMemberSearch] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);
  const [addingBuildings, setAddingBuildings] = useState(false);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setMemberSearch('');
    setBuildingSearch('');
    setAddingMembers(false);
    setAddingBuildings(false);
  }, []);

  const { requestClose: requestCloseForm, confirmUi: formConfirmUi } = useModalCloseConfirm(
    closeForm,
    { isParentOpen: showForm }
  );

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const {
    data: teams = [],
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsTeam[] }>(
        '/gestao-os/cadastros/teams'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['gestao-os-technicians'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Technician[] }>('/gestao-os/technicians');
      return res.data?.data ?? [];
    }
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['gestao-os-locations'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsLocationTree }>(
        '/gestao-os/locations'
      );
      return res.data?.data ?? [];
    }
  });

  const buildings = useMemo(
    () => locations.map((b) => ({ id: b.id, name: b.name, code: b.code ?? null })),
    [locations]
  );

  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((team) => {
      const haystack = [
        team.name,
        team.code,
        team.shift,
        team.manager?.name,
        ...team.members.map((m) => m.user?.name),
        ...team.buildings.map((b) => b.building?.name)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [teams, searchTerm]);

  const totals = useMemo(
    () => ({
      active: teams.filter((t) => t.isActive).length,
      members: teams.reduce((acc, t) => acc + t.members.length, 0),
      open: teams.reduce((acc, t) => acc + (t.openCount ?? 0), 0),
      overdue: teams.reduce((acc, t) => acc + (t.overdueCount ?? 0), 0)
    }),
    [teams]
  );

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(rows);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-teams'] });
  };

  type TeamPayload = {
    name: string;
    code: string | null;
    shift: string | null;
    description: string | null;
    managerUserId: string | null;
    members: TeamFormMember[];
    buildingIds: string[];
  };

  const buildPayload = (): TeamPayload => ({
    name: formData.name.trim(),
    code: formData.code.trim() || null,
    shift: formData.shift.trim() || null,
    description: formData.description.trim() || null,
    managerUserId: formData.managerUserId || null,
    members: formData.members,
    buildingIds: formData.buildingIds
  });

  const createMutation = useMutation({
    mutationFn: async (body: TeamPayload) => {
      await api.post('/gestao-os/cadastros/teams', { ...body, companyId: null });
    },
    onSuccess: () => {
      toast.success('Equipe cadastrada.');
      setFormData(emptyForm());
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao cadastrar equipe.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TeamPayload }) => {
      await api.patch(`/gestao-os/cadastros/teams/${id}`, data);
    },
    onSuccess: () => {
      toast.success('Equipe atualizada.');
      setFormData(emptyForm());
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar equipe.');
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/gestao-os/cadastros/teams/${id}`, { isActive });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.isActive ? 'Equipe ativada.' : 'Equipe desativada.');
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar status.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete<{ success: boolean; data?: { deactivated?: boolean } }>(
        `/gestao-os/cadastros/teams/${id}`
      );
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(
        data?.deactivated
          ? 'Equipe possui OS vinculadas e foi apenas desativada.'
          : 'Equipe excluída.'
      );
      setDeleteTarget(null);
      setViewing(null);
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir equipe.');
    }
  });

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm());
    setAddingMembers(false);
    setAddingBuildings(false);
    setShowForm(true);
  };

  const openEdit = (row: GestaoOsTeam) => {
    setViewing(null);
    setEditing(row);
    setFormData({
      name: row.name ?? '',
      code: row.code ?? '',
      shift: row.shift ?? '',
      description: row.description ?? '',
      managerUserId: row.managerUserId ?? '',
      members: row.members.map((m) => ({ userId: m.userId, role: m.role })),
      buildingIds: row.buildings.map((b) => b.buildingId)
    });
    setAddingMembers(false);
    setAddingBuildings(false);
    setShowForm(true);
  };

  const setMemberRole = (userId: string, role: GestaoOsTeamMemberRole) => {
    setFormData((prev) => ({
      ...prev,
      members: prev.members.map((m) => (m.userId === userId ? { ...m, role } : m))
    }));
  };

  const managerOptions = useMemo(
    () => labeledToSelectOptions(technicians.map((t) => ({ value: t.id, label: t.name }))),
    [technicians]
  );

  const technicianById = useMemo(() => {
    const map = new Map(technicians.map((t) => [t.id, t]));
    return map;
  }, [technicians]);

  const buildingById = useMemo(() => {
    const map = new Map(buildings.map((b) => [b.id, b]));
    return map;
  }, [buildings]);

  const filteredTechnicians = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter((t) =>
      [t.name, t.email, t.cpf].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [technicians, memberSearch]);

  const filteredBuildings = useMemo(() => {
    const q = buildingSearch.trim().toLowerCase();
    if (!q) return buildings;
    return buildings.filter((b) =>
      [b.name, b.code].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [buildings, buildingSearch]);

  const selectedMemberIds = useMemo(
    () => new Set(formData.members.map((m) => m.userId)),
    [formData.members]
  );

  const selectedBuildingIds = useMemo(
    () => new Set(formData.buildingIds),
    [formData.buildingIds]
  );

  const toggleMember = (userId: string, checked: boolean) => {
    if (checked) {
      setFormData((prev) => {
        if (prev.members.some((m) => m.userId === userId)) return prev;
        return {
          ...prev,
          members: [...prev.members, { userId, role: 'MEMBER' }]
        };
      });
      return;
    }
    setFormData((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.userId !== userId)
    }));
  };

  const removeMember = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.userId !== userId)
    }));
  };

  const toggleBuilding = (buildingId: string, checked: boolean) => {
    if (checked) {
      setFormData((prev) => {
        if (prev.buildingIds.includes(buildingId)) return prev;
        return { ...prev, buildingIds: [...prev.buildingIds, buildingId] };
      });
      return;
    }
    setFormData((prev) => ({
      ...prev,
      buildingIds: prev.buildingIds.filter((id) => id !== buildingId)
    }));
  };

  const removeBuilding = (buildingId: string) => {
    setFormData((prev) => ({
      ...prev,
      buildingIds: prev.buildingIds.filter((id) => id !== buildingId)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome da equipe é obrigatório.');
      return;
    }
    if (!formData.members.length) {
      toast.error('Selecione pelo menos um integrante.');
      return;
    }
    const payload = buildPayload();
    if (editing) {
      if (!canEdit) {
        toast.error('Você não tem permissão para editar.');
        return;
      }
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      if (!canCreate) {
        toast.error('Você não tem permissão para criar.');
        return;
      }
      createMutation.mutate(payload);
    }
  };

  const loadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar as equipes.');
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/equipes">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Equipes de Serviço
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Monte equipes com seus integrantes e defina as localidades que cada uma atende.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FilterStatCard
              label="Equipes ativas"
              count={totals.active}
              icon={CheckCircle2}
              iconBg="bg-emerald-100 dark:bg-emerald-900/30"
              iconColor="text-emerald-600 dark:text-emerald-400"
            />
            <FilterStatCard
              label="Integrantes alocados"
              count={totals.members}
              icon={Users}
              iconBg="bg-sky-100 dark:bg-sky-900/30"
              iconColor="text-sky-600 dark:text-sky-400"
            />
            <FilterStatCard
              label="OS em andamento"
              count={totals.open}
              icon={FolderKanban}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
            />
            <FilterStatCard
              label="OS em atraso"
              count={totals.overdue}
              icon={AlertTriangle}
              iconBg="bg-rose-100 dark:bg-rose-900/30"
              iconColor="text-rose-600 dark:text-rose-400"
            />
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Users className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Equipes de Serviço
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : `${rows.length} registro(s)`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar por equipe, gestor, integrante ou local..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={openCreate}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Nova Equipe
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                  <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
                </div>
              ) : isLoading ? (
                <CadastroListLoading message="Carregando equipes..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={Users}
                  title="Nenhuma equipe encontrada"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre uma equipe para começar a agendar atendimentos'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="equipe"
                    itemLabelPlural="equipes"
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-14 whitespace-nowrap !px-2 sm:!px-3`}>
                            ID
                          </th>
                          <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Equipe</th>
                          <th className={cadastroListClasses.th}>Gestor</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>Integrantes</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>Localidades</th>
                          <th className={`${cadastroListClasses.thCenter} w-32`}>OS abertas</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>Status</th>
                          {showActions ? (
                            <th className={cadastroListClasses.thRight}>Ação</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((row, index) => (
                          <tr
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => setViewing(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setViewing(row);
                              }
                            }}
                          >
                            <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                              {formatCadastroListId(null, index + 1)}
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                              <ListRowNavigableLabel className="block truncate">
                                {row.name}
                              </ListRowNavigableLabel>
                              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                {[row.code, row.shift].filter(Boolean).join(' · ') || '—'}
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdMuted}>
                              {row.manager?.name || '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{row.members.length}</td>
                            <td className={cadastroListClasses.tdCenter}>{row.buildings.length}</td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {row.openCount ?? 0}
                              </span>
                              {(row.overdueCount ?? 0) > 0 ? (
                                <span className="ml-1 text-xs font-medium text-red-600 dark:text-red-400">
                                  ({row.overdueCount} em atraso)
                                </span>
                              ) : null}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  row.isActive
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {row.isActive ? 'Ativa' : 'Inativa'}
                              </span>
                            </td>
                            {showActions ? (
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(row.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={canEdit ? () => openEdit(rowForActionMenu) : undefined}
                  onDelete={canDelete ? () => setDeleteTarget(rowForActionMenu) : undefined}
                  extraItems={
                    canEdit
                      ? [
                          {
                            label: rowForActionMenu.isActive ? 'Desativar' : 'Ativar',
                            icon: <Power className="h-4 w-4 shrink-0" />,
                            tone: rowForActionMenu.isActive ? 'danger' : 'success',
                            onClick: () =>
                              toggleActiveMutation.mutate({
                                id: rowForActionMenu.id,
                                isActive: !rowForActionMenu.isActive
                              })
                          }
                        ]
                      : []
                  }
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseForm} />
            <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar Equipe' : 'Nova Equipe'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseForm}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nome da equipe *
                    </label>
                    <input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex.: Equipe Limpeza — Campus Central"
                      className={FORM_FIELD_INPUT_CLS}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Código
                    </label>
                    <input
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="Ex.: EQ-01"
                      className={FORM_FIELD_INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Turno / jornada
                    </label>
                    <input
                      value={formData.shift}
                      onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                      placeholder="Ex.: Diurno 07h-15h"
                      className={FORM_FIELD_INPUT_CLS}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Gestor da equipe
                    </label>
                    <StringSingleSelectDropdown
                      value={formData.managerUserId}
                      onChange={(v) => setFormData({ ...formData, managerUserId: v })}
                      options={managerOptions}
                      placeholder="Sem gestor definido"
                      emptyOptionLabel="Sem gestor definido"
                      allowEmpty
                      searchPlaceholder="Buscar gestor..."
                      emptyOptionsMessage="Nenhum funcionário disponível."
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Observações
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Escopo da equipe, materiais, particularidades..."
                      className={FORM_FIELD_TEXTAREA_CLS}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Integrantes ({formData.members.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setMemberSearch('');
                        setAddingMembers(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </button>
                  </div>

                  {formData.members.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Nenhum integrante adicionado.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                      {formData.members.map((member) => {
                        const tech = technicianById.get(member.userId);
                        return (
                          <li
                            key={member.userId}
                            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <PersonIdentity
                                name={tech?.name || 'Funcionário'}
                                cpf={tech?.cpf}
                                profilePhotoUrl={tech?.profilePhotoUrl}
                              />
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <div className="w-36">
                                <StringSingleSelectDropdown
                                  value={member.role}
                                  onChange={(v) =>
                                    setMemberRole(member.userId, v as GestaoOsTeamMemberRole)
                                  }
                                  options={TEAM_MEMBER_ROLE_OPTIONS}
                                  allowEmpty={false}
                                  disableSearch
                                  matchTriggerWidth
                                  menuAlign="end"
                                  placeholder="Função"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeMember(member.userId)}
                                className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                                aria-label="Remover integrante"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Localidades atendidas ({formData.buildingIds.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setBuildingSearch('');
                        setAddingBuildings(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </button>
                  </div>
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    A primeira localidade vinculada sugere a equipe automaticamente na abertura da
                    OS, mas ela pode ser trocada no agendamento.
                  </p>

                  {formData.buildingIds.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma localidade adicionada.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                      {formData.buildingIds.map((buildingId) => {
                        const building = buildingById.get(buildingId);
                        return (
                          <li
                            key={buildingId}
                            className="flex items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {building?.name || 'Localidade'}
                              </p>
                              {building?.code ? (
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                  {building.code}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBuilding(buildingId)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                              aria-label="Remover localidade"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={requestCloseForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {addingMembers ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setAddingMembers(false);
                setMemberSearch('');
              }}
            />
            <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Adicionar integrantes
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setAddingMembers(false);
                    setMemberSearch('');
                  }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Buscar funcionário..."
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                </div>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {filteredTechnicians.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {technicians.length === 0
                        ? 'Nenhum funcionário disponível.'
                        : 'Nenhum funcionário encontrado.'}
                    </p>
                  ) : (
                    filteredTechnicians.map((tech) => {
                      const checked = selectedMemberIds.has(tech.id);
                      return (
                        <label
                          key={tech.id}
                          className="group flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                        >
                          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleMember(tech.id, e.target.checked)}
                              className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <CheckboxIndicator checked={checked} />
                          </span>
                          <PersonIdentity
                            name={tech.name}
                            cpf={tech.cpf}
                            profilePhotoUrl={tech.profilePhotoUrl}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setAddingMembers(false);
                    setMemberSearch('');
                  }}
                  className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Concluir
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {addingBuildings ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setAddingBuildings(false);
                setBuildingSearch('');
              }}
            />
            <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Adicionar localidades
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setAddingBuildings(false);
                    setBuildingSearch('');
                  }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={buildingSearch}
                    onChange={(e) => setBuildingSearch(e.target.value)}
                    placeholder="Buscar localidade..."
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                </div>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {filteredBuildings.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {buildings.length === 0
                        ? 'Nenhuma localidade disponível.'
                        : 'Nenhuma localidade encontrada.'}
                    </p>
                  ) : (
                    filteredBuildings.map((building) => {
                      const checked = selectedBuildingIds.has(building.id);
                      return (
                        <label
                          key={building.id}
                          className="group flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                        >
                          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleBuilding(building.id, e.target.checked)}
                              className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <CheckboxIndicator checked={checked} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                              {building.name}
                            </span>
                            {building.code ? (
                              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                {building.code}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setAddingBuildings(false);
                    setBuildingSearch('');
                  }}
                  className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Concluir
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {viewing ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {viewing.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { label: 'Código', value: viewing.code || '—' },
                    { label: 'Turno / jornada', value: viewing.shift || '—' },
                    { label: 'Gestor', value: viewing.manager?.name || '—' },
                    { label: 'Status', value: viewing.isActive ? 'Ativa' : 'Inativa' }
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {item.label}
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{item.value}</p>
                    </div>
                  ))}
                </div>

                {viewing.description ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Observações
                    </p>
                    <p className="whitespace-pre-line text-sm text-gray-900 dark:text-gray-100">
                      {viewing.description}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      OS em andamento
                    </p>
                    <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {viewing.openCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      OS em atraso
                    </p>
                    <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
                      {viewing.overdueCount ?? 0}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Integrantes ({viewing.members.length})
                  </p>
                  {viewing.members.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum integrante vinculado.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                      {viewing.members.map((member) => (
                        <li
                          key={member.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <PersonIdentity
                              name={member.user?.name || 'Funcionário'}
                              cpf={member.user?.cpf}
                              profilePhotoUrl={member.user?.profilePhotoUrl}
                            />
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              member.role === 'LEADER'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {TEAM_MEMBER_ROLE_LABELS[member.role]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Localidades atendidas ({viewing.buildings.length})
                  </p>
                  {viewing.buildings.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma localidade vinculada.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {viewing.buildings.map((link) => (
                        <li
                          key={link.id}
                          className="flex items-start gap-2 text-sm text-gray-900 dark:text-gray-100"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <span>
                            {link.building?.name}
                            {link.building?.address ? (
                              <span className="block text-xs text-gray-500 dark:text-gray-400">
                                {link.building.address}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openEdit(viewing)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setViewing(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {deleteTarget ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir {deleteTarget.name}?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Se a equipe tiver OS vinculadas, ela será apenas desativada para preservar o
                histórico.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {formConfirmUi}
      </MainLayout>
    </ProtectedRoute>
  );
}
