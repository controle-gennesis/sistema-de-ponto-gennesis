'use client';

import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

interface PointCorrectionCardProps {
  onSuccess?: () => void;
}

const pointTypes = [
  { value: 'ENTRY', label: 'Entrada' },
  { value: 'LUNCH_START', label: 'Início do Almoço' },
  { value: 'LUNCH_END', label: 'Fim do Almoço' },
  { value: 'EXIT', label: 'Saída' }
];

export const PointCorrectionCard: React.FC<PointCorrectionCardProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    justification: '',
    originalDate: '',
    originalTime: '',
    originalType: 'ENTRY',
    correctedDate: '',
    correctedTime: '',
    correctedType: 'ENTRY'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/solicitacoes', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-corrections'] });
      setFormData({
        title: '',
        description: '',
        justification: '',
        originalDate: '',
        originalTime: '',
        originalType: 'ENTRY',
        correctedDate: '',
        correctedTime: '',
        correctedType: 'ENTRY'
      });
      toast.success('Solicitação enviada com sucesso!');
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('Erro ao enviar solicitação:', error);
      toast.error(error.response?.data?.error || 'Erro ao enviar solicitação');
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.justification) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.justification.length < 20) {
      toast.error('A justificativa deve ter pelo menos 20 caracteres');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await submitMutation.mutateAsync(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações básicas */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Título da Solicitação *
              </label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Ex: Correção de entrada do dia 15/10"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descrição do Problema *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Descreva o que aconteceu..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Justificativa Detalhada * (mínimo 20 caracteres)
              </label>
              <textarea
                value={formData.justification}
                onChange={(e) => handleInputChange('justification', e.target.value)}
                placeholder="Explique detalhadamente por que a correção é necessária..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                rows={4}
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.justification.length}/20 caracteres mínimos
              </p>
            </div>
          </div>

          {/* Dados originais (incorretos) */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
              Dados Originais (Incorretos)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Data *
                </label>
                <Input
                  type="date"
                  value={formData.originalDate}
                  onChange={(e) => handleInputChange('originalDate', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Horário *
                </label>
                <Input
                  type="time"
                  value={formData.originalTime}
                  onChange={(e) => handleInputChange('originalTime', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tipo de Ponto *
                </label>
                <select
                  value={formData.originalType}
                  onChange={(e) => handleInputChange('originalType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                >
                  {pointTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Dados corrigidos */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
              Dados Corrigidos (Solicitados)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Data *
                </label>
                <Input
                  type="date"
                  value={formData.correctedDate}
                  onChange={(e) => handleInputChange('correctedDate', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Horário *
                </label>
                <Input
                  type="time"
                  value={formData.correctedTime}
                  onChange={(e) => handleInputChange('correctedTime', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tipo de Ponto *
                </label>
                <select
                  value={formData.correctedType}
                  onChange={(e) => handleInputChange('correctedType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                >
                  {pointTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  title: '',
                  description: '',
                  justification: '',
                  originalDate: '',
                  originalTime: '',
                  originalType: 'ENTRY',
                  correctedDate: '',
                  correctedTime: '',
                  correctedType: 'ENTRY'
                });
              }}
            >
              Limpar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </div>
        </form>
  );
};
