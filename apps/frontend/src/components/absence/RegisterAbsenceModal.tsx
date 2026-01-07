'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, User, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface RegisterAbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Employee {
  id: string;
  employeeId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export function RegisterAbsenceModal({ isOpen, onClose }: RegisterAbsenceModalProps) {
  const [formData, setFormData] = useState({
    employeeId: '',
    date: '',
    startDate: '',
    endDate: '',
    reason: '',
    observation: '',
    isMultiple: false
  });

  const queryClient = useQueryClient();

  // Buscar lista de funcionários
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-for-absence'],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: {
          page: 1,
          limit: 10000,
          status: 'all'
        }
      });
      const users = res.data?.data || [];
      
      // Filtrar apenas usuários que têm employee associado, excluindo cargo de Administrador
      const employees = users
        .filter((user: any) => {
          if (!user.employee || !user.employee.id) {
            return false;
          }
          if (user.employee.position === 'Administrador') {
            return false;
          }
          return true;
        })
        .map((user: any) => ({
          id: user.employee.id,
          employeeId: user.employee.employeeId || '',
          user: {
            id: user.id,
            name: user.name || '',
            email: user.email || ''
          }
        }))
        .sort((a: Employee, b: Employee) => a.user.name.localeCompare(b.user.name));
      
      return employees;
    },
    enabled: isOpen
  });

  const employees: Employee[] = employeesData || [];

  // Mutation para registrar falta única
  const registerSingleAbsence = useMutation({
    mutationFn: async (data: { employeeId: string; date: string; reason?: string; observation?: string }) => {
      const res = await api.post('/time-records/absence', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Falta registrada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['time-records'] });
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      handleClose();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erro ao registrar falta';
      toast.error(message);
    }
  });

  // Mutation para registrar múltiplas faltas
  const registerMultipleAbsences = useMutation({
    mutationFn: async (data: { employeeId: string; startDate: string; endDate: string; reason?: string; observation?: string }) => {
      const res = await api.post('/time-records/absence/multiple', data);
      return res.data;
    },
    onSuccess: (data) => {
      const message = data.message || 'Faltas registradas com sucesso!';
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ['time-records'] });
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      handleClose();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erro ao registrar faltas';
      toast.error(message);
    }
  });

  const handleClose = () => {
    setFormData({
      employeeId: '',
      date: '',
      startDate: '',
      endDate: '',
      reason: '',
      observation: '',
      isMultiple: false
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employeeId) {
      toast.error('Selecione um funcionário');
      return;
    }

    if (formData.isMultiple) {
      if (!formData.startDate || !formData.endDate) {
        toast.error('Preencha as datas de início e fim');
        return;
      }

      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      if (end < start) {
        toast.error('Data de fim deve ser posterior à data de início');
        return;
      }

      registerMultipleAbsences.mutate({
        employeeId: formData.employeeId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason || undefined,
        observation: formData.observation || undefined
      });
    } else {
      if (!formData.date) {
        toast.error('Selecione uma data');
        return;
      }

      registerSingleAbsence.mutate({
        employeeId: formData.employeeId,
        date: formData.date,
        reason: formData.reason || undefined,
        observation: formData.observation || undefined
      });
    }
  };

  if (!isOpen) return null;

  const selectedEmployee = employees.find(emp => emp.id === formData.employeeId);
  const isLoading = registerSingleAbsence.isPending || registerMultipleAbsences.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Registrar Falta
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Registre faltas para funcionários (mesmo os que não precisam bater ponto)
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seleção de funcionário */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Funcionário *
              </label>
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Selecione um funcionário</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeId} - {employee.user.name}
                    </option>
                  ))}
                </select>
              )}
              {selectedEmployee && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {selectedEmployee.user.email}
                </p>
              )}
            </div>

            {/* Tipo de registro */}
            <div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isMultiple}
                  onChange={(e) => setFormData({ ...formData, isMultiple: e.target.checked })}
                  className="w-4 h-4 text-blue-600 dark:text-blue-500 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Registrar múltiplas faltas (período)
                </span>
              </label>
            </div>

            {/* Data única ou período */}
            {formData.isMultiple ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Data de Início *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Data de Fim *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    required
                    max={new Date().toISOString().split('T')[0]}
                    min={formData.startDate}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Data da Falta *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>
            )}

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Motivo
              </label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Ex: Falta sem justificativa, Falta por motivo pessoal..."
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            {/* Observação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Observação
              </label>
              <textarea
                value={formData.observation}
                onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
                placeholder="Observações adicionais (opcional)"
                rows={3}
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              />
            </div>

            {/* Botões */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Registrar Falta</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

