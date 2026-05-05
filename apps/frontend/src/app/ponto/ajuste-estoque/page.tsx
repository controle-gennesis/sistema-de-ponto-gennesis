'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, History } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Material {
  id: string;
  name: string;
  unit: string;
}

interface MovementFormData {
  materialId: string;
  costCenterId: string;
  type: 'IN' | 'OUT';
  quantity: string;
  notes: string;
}

interface MovementPayload {
  materialId: string;
  costCenterId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  notes: string;
}

interface StockMovement {
  id: string;
  material: Material;
  costCenter?: { code: string; name: string } | null;
  type: 'IN' | 'OUT';
  quantity: number;
  notes?: string | null;
  user: { name: string };
  createdAt: string;
}

const ADJUSTMENT_MARKER = '[AJUSTE_ESTOQUE]';

export default function AjusteEstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  const [formData, setFormData] = useState<MovementFormData>({
    materialId: '',
    costCenterId: '',
    type: 'IN',
    quantity: '',
    notes: ''
  });

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

  const { data: materialsData } = useQuery({
    queryKey: ['construction-materials'],
    queryFn: async () => {
      const res = await api.get('/construction-materials', { params: { limit: 1000 } });
      return res.data;
    }
  });

  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers');
      return res.data;
    }
  });

  const { data: movementsData, isLoading: loadingMovements } = useQuery({
    queryKey: ['stock-adjustment-movements'],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 500 } });
      return res.data;
    }
  });

  const createMovementMutation = useMutation({
    mutationFn: async (data: MovementPayload) => {
      const res = await api.post('/stock/movements', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustment-movements'] });
      setFormData({
        materialId: '',
        costCenterId: '',
        type: 'IN',
        quantity: '',
        notes: ''
      });
      toast.success('Ajuste de estoque registrado com sucesso!');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao registrar ajuste de estoque';
      toast.error(msg);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQuantity = parseFloat(formData.quantity.replace(',', '.'));

    if (!formData.materialId || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    createMovementMutation.mutate({
      materialId: formData.materialId,
      costCenterId: formData.costCenterId,
      type: formData.type,
      quantity: parsedQuantity,
      notes: [ADJUSTMENT_MARKER, formData.notes.trim()].filter(Boolean).join('\n')
    });
  };

  const materials = materialsData?.data || [];
  const costCenters = Array.isArray(costCentersData?.data)
    ? costCentersData.data
    : Array.isArray(costCentersData)
    ? costCentersData
    : [];
  const selectedMaterial = materials.find((m: Material) => m.id === formData.materialId);
  const selectedUnit = selectedMaterial?.unit || '-';
  const movements: StockMovement[] = movementsData?.data || [];
  const adjustmentMovements = movements.filter((mov) => mov.notes?.includes(ADJUSTMENT_MARKER));

  const cleanAdjustmentNotes = (notes?: string | null) =>
    (notes || '')
      .replace(ADJUSTMENT_MARKER, '')
      .trim();

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/ajuste-estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Ajuste de Estoque</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Registre entradas e saídas para ajuste de saldo
            </p>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                Nova Movimentação
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'history'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                <History className="w-4 h-4" />
                Histórico
              </button>
            </nav>
          </div>

          {activeTab === 'new' && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Nova Movimentação de Ajuste</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo *</label>
                  <select
                    required
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'IN' | 'OUT' })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="IN">Entrada</option>
                    <option value="OUT">Saída</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Material *</label>
                  <select
                    required
                    value={formData.materialId}
                    onChange={(e) => setFormData({ ...formData, materialId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Selecione um material</option>
                    {materials.map((m: Material) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quantidade *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        inputMode="decimal"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="Ex.: 10,5"
                      />
                      <input
                        type="text"
                        value={selectedUnit}
                        readOnly
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                        aria-label="Unidade de Medida"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Centro de Custo</label>
                    <select
                      value={formData.costCenterId}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      disabled={loadingCostCenters}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                    >
                      <option value="">Não especificado</option>
                      {loadingCostCenters && <option disabled>Carregando centros de custo...</option>}
                      {!loadingCostCenters && costCenters.length === 0 && <option disabled>Nenhum centro de custo cadastrado</option>}
                      {costCenters.map((cc: any) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Observações</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Observações sobre o ajuste..."
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => router.push('/ponto/estoque')}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createMovementMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {createMovementMutation.isPending ? 'Registrando...' : 'Registrar Ajuste'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico de Ajustes
              </h3>
              {loadingMovements ? (
                <p className="text-center py-8 text-gray-500">Carregando...</p>
              ) : adjustmentMovements.length === 0 ? (
                <p className="text-center py-8 text-gray-500">Nenhum ajuste encontrado</p>
              ) : (
                <div className="space-y-3">
                  {adjustmentMovements.map((mov) => (
                    <div
                      key={mov.id}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            mov.type === 'IN' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                          }`}
                        >
                          {mov.type === 'IN' ? (
                            <ArrowUpCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowDownCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{mov.material.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {mov.type === 'IN' ? 'Entrada' : 'Saída'}: {mov.quantity} {mov.material.unit}
                          </p>
                          {mov.costCenter && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              CC: {mov.costCenter.code} - {mov.costCenter.name}
                            </p>
                          )}
                          {cleanAdjustmentNotes(mov.notes) && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{cleanAdjustmentNotes(mov.notes)}</p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                            {new Date(mov.createdAt).toLocaleString('pt-BR')} - {mov.user.name}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
