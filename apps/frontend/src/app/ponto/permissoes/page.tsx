'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent } from '@/components/ui/Card';
import api from '@/lib/api';

const CONTRACTS_MODULE_KEY = pathToModuleKey('/ponto/contratos');

type ModuleItem = { key: string; name: string; href: string };
type UserItem = {
  id: string;
  name: string;
  email: string;
  employee?: { position?: string; department?: string };
};
type PermissionItem = { module: string; action: string };
type ContractOption = { id: string; name: string; number: string };

export default function PermissoesPage() {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(new Set());
  const [contractsOpen, setContractsOpen] = useState(false);

  const { data: userData, isLoading: loadingMe } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: modulesData } = useQuery({
    queryKey: ['permission-modules'],
    queryFn: async () => (await api.get('/permissions/modules')).data?.data,
  });

  const { data: usersData, isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['permission-users'],
    queryFn: async () => (await api.get('/permissions/users')).data?.data as UserItem[],
    retry: false,
  });

  const { data: userPermissionData, refetch: refetchSelectedPermissions } = useQuery({
    queryKey: ['permission-user', selectedUserId],
    queryFn: async () => (await api.get(`/permissions/users/${selectedUserId}`)).data?.data,
    enabled: !!selectedUserId,
  });

  const { data: contractsList = [] } = useQuery({
    queryKey: ['permission-contracts-list'],
    queryFn: async () => (await api.get('/permissions/contracts')).data?.data as ContractOption[],
    enabled: !!selectedUserId && !userPermissionData?.isAdmin,
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });

  React.useEffect(() => {
    if (!userPermissionData?.permissions) {
      setSelectedSet(new Set());
      setSelectedContractIds(new Set());
      return;
    }
    const next = new Set<string>(
      (userPermissionData.permissions as PermissionItem[])
        .filter((p) => p.action === PERMISSION_ACCESS_ACTION)
        .map((p) => p.module)
    );
    setSelectedSet(next);
    const ids = (userPermissionData as { allowedContractIds?: string[] }).allowedContractIds ?? [];
    setSelectedContractIds(new Set(ids));
  }, [userPermissionData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions = Array.from(selectedSet).map((module) => ({ module }));
      await api.put(`/permissions/users/${selectedUserId}`, {
        permissions,
        allowedContractIds: Array.from(selectedContractIds),
      });
    },
    onSuccess: async () => {
      toast.success('Permissões salvas com sucesso.');
      await refetchSelectedPermissions();
      await refetchUsers();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao salvar permissões.');
    },
  });

  const modules: ModuleItem[] = modulesData?.modules || [];
  const users: UserItem[] = usersData || [];
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  const toggleModule = (moduleKey: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) {
        next.delete(moduleKey);
        if (moduleKey === CONTRACTS_MODULE_KEY) {
          setSelectedContractIds(new Set());
          setContractsOpen(false);
        }
      } else {
        next.add(moduleKey);
      }
      return next;
    });
  };

  const toggleContract = (contractId: string) => {
    setSelectedContractIds((prev) => {
      const n = new Set(prev);
      if (n.has(contractId)) n.delete(contractId);
      else n.add(contractId);
      return n;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  if (loadingMe || loadingUsers) {
    return <Loading message="Carregando permissões..." fullScreen size="lg" />;
  }

  const me = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  return (
    <MainLayout userRole={me.role} userName={me.name} onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciamento de Permissões</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Marque os submenus que o usuário poderá acessar por completo. Em <strong>Contratos</strong>, escolha quais
            contratos liberar (a lista atualiza automaticamente).
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Selecione um usuário
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setContractsOpen(false);
              }}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            >
              <option value="">Escolha um usuário...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} - {user.email}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {selectedUserId && (
          <Card>
            <CardContent className="p-6">
              {userPermissionData?.isAdmin ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
                  Este usuário é Administrador e possui acesso total automático.
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedUser?.name}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedUser?.employee?.position || 'Sem cargo'} -{' '}
                      {selectedUser?.employee?.department || 'Sem departamento'}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left text-sm p-2 border-b">Submenu / módulo</th>
                          <th className="text-center text-sm p-2 border-b w-32">Acesso total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((module) => (
                          <React.Fragment key={module.key}>
                            <tr>
                              <td className="p-2 border-b text-sm align-top">
                                <div className="flex items-start gap-2">
                                  {module.key === CONTRACTS_MODULE_KEY ? (
                                    <button
                                      type="button"
                                      onClick={() => setContractsOpen((o) => !o)}
                                      className="mt-0.5 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600"
                                      title="Contratos autorizados"
                                      aria-expanded={contractsOpen}
                                    >
                                      {contractsOpen ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                  ) : (
                                    <span className="w-5 shrink-0" />
                                  )}
                                  <div>
                                    <span className="font-medium">{module.name}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{module.href}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2 border-b text-center align-top">
                                <input
                                  type="checkbox"
                                  checked={selectedSet.has(module.key)}
                                  onChange={() => toggleModule(module.key)}
                                  aria-label={`Acesso total a ${module.name}`}
                                />
                              </td>
                            </tr>
                            {module.key === CONTRACTS_MODULE_KEY && contractsOpen && (
                              <tr>
                                <td colSpan={2} className="p-3 border-b bg-gray-50 dark:bg-gray-900/50">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                    Marque os contratos que este usuário poderá abrir. A lista é atualizada
                                    automaticamente quando novos contratos forem cadastrados.
                                  </p>
                                  {!selectedSet.has(CONTRACTS_MODULE_KEY) ? (
                                    <p className="text-sm text-amber-700 dark:text-amber-400">
                                      Ative a permissão &quot;Contratos&quot; acima para poder autorizar contratos.
                                    </p>
                                  ) : contractsList.length === 0 ? (
                                    <p className="text-sm text-gray-500">Nenhum contrato cadastrado ainda.</p>
                                  ) : (
                                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                                      {contractsList.map((c) => (
                                        <label
                                          key={c.id}
                                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-2 py-1"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedContractIds.has(c.id)}
                                            onChange={() => toggleContract(c.id)}
                                          />
                                          <span className="font-mono text-xs text-gray-500">{c.number}</span>
                                          <span>{c.name}</span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !selectedUserId}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {saveMutation.isPending ? 'Salvando...' : 'Salvar permissões'}
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
