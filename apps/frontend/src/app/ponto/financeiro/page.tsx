'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Calendar, Building2, Filter, Loader2, FileCode, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { COMPANIES_LIST, COST_CENTERS_LIST } from '@/constants/payrollFilters';

export default function FinanceiroPage() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    company: '',
    costCenter: '',
    month: currentMonth,
    year: currentYear
  });

  const [showPreview, setShowPreview] = useState(false);

  // Verificar status da folha
  const { data: payrollStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['payroll-status', filters.month, filters.year],
    queryFn: async () => {
      const res = await api.get(`/payroll/status?month=${filters.month}&year=${filters.year}`);
      return res.data;
    }
  });

  const isFinalized = payrollStatus?.data?.isFinalized || false;
  const { isDepartmentFinanceiro, userPosition } = usePermissions();
  
  // Verificar se o usuário pode reabrir a folha (Financeiro ou Administrador)
  const canReopenPayroll = isDepartmentFinanceiro || userPosition === 'Administrador';

  // Função para reabrir a folha
  const handleReopenPayroll = async () => {
    if (!confirm('Tem certeza que deseja reabrir esta folha de pagamento? O Departamento Pessoal poderá fazer correções.')) {
      return;
    }

    try {
      await api.post('/payroll/reopen', {
        month: filters.month,
        year: filters.year
      });
      
      await refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['payroll-status'] });
      alert('Folha de pagamento reaberta com sucesso! O Departamento Pessoal pode fazer correções.');
    } catch (error: any) {
      console.error('Erro ao reabrir folha:', error);
      alert(error.response?.data?.message || 'Erro ao reabrir folha de pagamento. Tente novamente.');
    }
  };

  const { data: borderData, isLoading, error, refetch } = useQuery({
    queryKey: ['border-data', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.company) params.append('company', filters.company);
      if (filters.costCenter) params.append('costCenter', filters.costCenter);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());
      
      const res = await api.get(`/border/data?${params.toString()}`);
      return res.data;
    },
    enabled: false // Não buscar automaticamente
  });

  const handleGeneratePDF = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.company) params.append('company', filters.company);
      if (filters.costCenter) params.append('costCenter', filters.costCenter);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());

      const response = await api.get(`/border/pdf?${params.toString()}`, {
        responseType: 'blob'
      });

      // Criar link para download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bordero-pagamento-${filters.month.toString().padStart(2, '0')}-${filters.year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar borderô. Tente novamente.');
    }
  };

  const handleGenerateCNAB = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.company) params.append('company', filters.company);
      if (filters.costCenter) params.append('costCenter', filters.costCenter);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());

      const response = await api.get(`/border/cnab400?${params.toString()}`, {
        responseType: 'blob'
      });

      // Criar link para download
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/plain; charset=ISO-8859-1' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CNAB400-${filters.month.toString().padStart(2, '0')}-${filters.year}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao gerar CNAB400:', error);
      alert('Erro ao gerar arquivo CNAB400. Tente novamente.');
    }
  };


  const handlePreview = async () => {
    setShowPreview(true);
    try {
      await refetch();
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    }
  };

  const totalAmount = borderData?.data?.reduce((sum: number, item: any) => sum + item.amount, 0) || 0;

  return (
    <ProtectedRoute route="/ponto/financeiro">
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Módulo Financeiro
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Gere borderôs de pagamento em PDF e arquivos CNAB400 para envio ao banco
            </p>
            {!isFinalized && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                  ⚠️ A folha de pagamento ainda não foi finalizada pelo Departamento Pessoal. 
                  Aguarde a finalização para gerar os documentos de pagamento.
                </p>
              </div>
            )}
            {isFinalized && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-between">
                <p className="text-green-800 dark:text-green-200 text-sm">
                  ✅ Folha de pagamento finalizada. Você pode gerar os documentos de pagamento.
                </p>
                {canReopenPayroll && (
                  <button
                    onClick={handleReopenPayroll}
                    className="ml-4 flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
                    title="Reabrir folha de pagamento para correções"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reabrir Folha</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <Card className="mb-6">
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Filtro de Empresa */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Empresa
                  </label>
                  <select
                    value={filters.company}
                    onChange={(e) => setFilters({ ...filters, company: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">Todas as empresas</option>
                    {COMPANIES_LIST.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Centro de Custo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Centro de Custo
                  </label>
                  <select
                    value={filters.costCenter}
                    onChange={(e) => setFilters({ ...filters, costCenter: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">Todos os centros de custo</option>
                    {COST_CENTERS_LIST.map((costCenter) => (
                      <option key={costCenter} value={costCenter}>
                        {costCenter}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Mês */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mês
                  </label>
                  <select
                    value={filters.month}
                    onChange={(e) => setFilters({ ...filters, month: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {new Date(2024, month - 1).toLocaleString('pt-BR', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Ano */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ano
                  </label>
                  <select
                    value={filters.year}
                    onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                  >
                    {Array.from({ length: 10 }, (_, i) => currentYear - 2 + i).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex gap-4 flex-wrap">
                <button
                  onClick={handlePreview}
                  disabled={isLoading || !isFinalized}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!isFinalized ? 'Aguarde a finalização da folha pelo DP' : 'Visualizar dados do borderô'}
                >
                  <FileText className="w-5 h-5" />
                  Visualizar Dados
                </button>
                <button
                  onClick={handleGeneratePDF}
                  disabled={isLoading || !isFinalized}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!isFinalized ? 'Aguarde a finalização da folha pelo DP' : 'Gerar borderô em PDF'}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Gerar Borderô PDF
                    </>
                  )}
                </button>
                <button
                  onClick={handleGenerateCNAB}
                  disabled={isLoading || !isFinalized}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!isFinalized ? 'Aguarde a finalização da folha pelo DP' : 'Gerar arquivo CNAB400 para Itaú'}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Gerar CNAB400 (Itaú)
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Preview dos dados */}
          {showPreview && borderData?.data && borderData.data.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Preview dos Dados
                </h3>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Período: {new Date(filters.year, filters.month - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total de funcionários: {borderData.data.length}
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    Valor Total: R$ {totalAmount.toFixed(2).replace('.', ',')}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Data
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Nome
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Valor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Banco
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Agência
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Conta
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {borderData.data.map((item: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.date}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                            R$ {item.amount.toFixed(2).replace('.', ',')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.bank || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.agency || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.account ? `${item.account}${item.digit ? '-' + item.digit : ''}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white text-right">
                          R$ {totalAmount.toFixed(2).replace('.', ',')}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="mt-6 border-red-500">
              <CardContent className="pt-6">
                <p className="text-red-600 dark:text-red-400">
                  Erro ao carregar dados: {error instanceof Error ? error.message : 'Erro desconhecido'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
