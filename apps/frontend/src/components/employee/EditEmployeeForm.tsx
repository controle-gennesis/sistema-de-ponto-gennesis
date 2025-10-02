'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, X, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TOMADORES_LIST } from '@/constants/tomadores';
import { CARGOS_LIST } from '@/constants/cargos';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface EmployeeFormData {
  // Dados do usuário
  name: string;
  email: string;
  cpf: string;
  isActive: boolean;
  
  // Dados do funcionário
  employeeId: string;
  sector: string;
  position: string;
  hireDate: string;
  birthDate: string;
  salary: string;
  isRemote: boolean;
  workStartTime: string;
  workEndTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
  toleranceMinutes: string;
  costCenter: string;
  client: string;
  dailyFoodVoucher: string;
  dailyTransportVoucher: string;
  
  // Novos campos - Dados da Empresa
  company: string;
  
  // Novos campos - Dados Bancários
  bank: string;
  accountType: string;
  agency: string;
  operation: string;
  account: string;
  digit: string;
  
  // Novos campos - Dados PIX
  pixKeyType: string;
  pixKey: string;
  
  // Novos campos - Modalidade e Adicionais
  modality: 'MEI' | 'CLT' | 'ESTAGIARIO' | '';
  familySalary: string;
  dangerPay: string; // Porcentagem de periculosidade (0-100)
  unhealthyPay: string; // Porcentagem de insalubridade (0-100)
}

interface Employee {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  isActive: boolean;
  employee?: {
    id: string;
    employeeId: string;
    department: string;
    position: string;
    hireDate: string;
    birthDate?: string;
    salary: number;
    isRemote: boolean;
    workSchedule: any;
    costCenter?: string;
    client?: string;
    dailyFoodVoucher?: number;
    dailyTransportVoucher?: number;
    company?: string;
    bank?: string;
    accountType?: string;
    agency?: string;
    operation?: string;
    account?: string;
    digit?: string;
    pixKeyType?: string;
    pixKey?: string;
    modality?: string;
    familySalary?: number;
    dangerPay?: number;
    unhealthyPay?: number;
  };
}

interface EditEmployeeFormProps {
  employee: Employee;
  onClose: () => void;
}

export function EditEmployeeForm({ employee, onClose }: EditEmployeeFormProps) {
  // Lista de setores disponíveis
  const sectors = [
    'Projetos',
    'Contratos e Licitações',
    'Suprimentos',
    'Jurídico',
    'Departamento Pessoal',
    'Engenharia',
    'Administrativo',
    'Financeiro'
  ];

  // Lista de cargos disponíveis
  const positions = CARGOS_LIST;

  // Lista de empresas
  const companies = [
    'ABRASIL',
    'GÊNNESIS',
    'MÉTRICA'
  ];

  // Lista de bancos
  const banks = [
    'BANCO DO BRASIL',
    'BRADESCO',
    'C6',
    'CAIXA ECONÔMICA',
    'CEF',
    'INTER',
    'ITAÚ',
    'NUBANK',
    'PICPAY',
    'SANTANDER'
  ];

  // Lista de tipos de conta
  const accountTypes = [
    'CONTA SALÁRIO',
    'CONTA CORRENTE',
    'POUPANÇA'
  ];

  // Lista de tipos de chave PIX
  const pixKeyTypes = [
    'ALEATÓRIA',
    'CELULAR',
    'CNPJ',
    'CPF',
    'E-MAIL'
  ];

  // Inicializar dados do formulário com dados do funcionário
  const [formData, setFormData] = useState<EmployeeFormData>({
    name: employee.name || '',
    email: employee.email || '',
    cpf: employee.cpf || '',
    isActive: employee.isActive ?? true,
    employeeId: employee.employee?.employeeId || '',
    sector: employee.employee?.department || '',
    position: employee.employee?.position || '',
    hireDate: employee.employee?.hireDate ? new Date(employee.employee.hireDate).toISOString().split('T')[0] : '',
    birthDate: employee.employee?.birthDate ? new Date(employee.employee.birthDate).toISOString().split('T')[0] : '',
    salary: employee.employee?.salary !== undefined && employee.employee?.salary !== null ? employee.employee.salary.toString() : '',
    isRemote: employee.employee?.isRemote ?? false,
    workStartTime: employee.employee?.workSchedule?.startTime || '07:00',
    workEndTime: employee.employee?.workSchedule?.endTime || '17:00',
    lunchStartTime: employee.employee?.workSchedule?.lunchStartTime || '12:00',
    lunchEndTime: employee.employee?.workSchedule?.lunchEndTime || '13:00',
    toleranceMinutes: employee.employee?.workSchedule?.toleranceMinutes?.toString() || '10',
    costCenter: employee.employee?.costCenter || '',
    client: employee.employee?.client || '',
    dailyFoodVoucher: employee.employee?.dailyFoodVoucher !== undefined && employee.employee?.dailyFoodVoucher !== null ? employee.employee.dailyFoodVoucher.toString() : '33.40',
    dailyTransportVoucher: employee.employee?.dailyTransportVoucher !== undefined && employee.employee?.dailyTransportVoucher !== null ? employee.employee.dailyTransportVoucher.toString() : '11.00',
    company: employee.employee?.company || '',
    bank: employee.employee?.bank || '',
    accountType: employee.employee?.accountType || '',
    agency: employee.employee?.agency || '',
    operation: employee.employee?.operation || '',
    account: employee.employee?.account || '',
    digit: employee.employee?.digit || '',
    pixKeyType: employee.employee?.pixKeyType || '',
    pixKey: employee.employee?.pixKey || '',
    modality: (employee.employee?.modality as any) || '',
    familySalary: employee.employee?.familySalary !== undefined && employee.employee?.familySalary !== null ? employee.employee.familySalary.toString() : '0.00',
    dangerPay: employee.employee?.dangerPay !== undefined && employee.employee?.dangerPay !== null ? employee.employee.dangerPay.toString() : '0',
    unhealthyPay: employee.employee?.unhealthyPay !== undefined && employee.employee?.unhealthyPay !== null ? employee.employee.unhealthyPay.toString() : '0'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  // Função para validar CPF
  const isValidCPF = (cpf: string): boolean => {
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    // Validar dígitos verificadores
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10))) return false;
    
    return true;
  };

  // Função para validar email
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Função para validar formulário
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!formData.cpf.trim()) {
      newErrors.cpf = 'CPF é obrigatório';
    } else if (!isValidCPF(formData.cpf)) {
      newErrors.cpf = 'CPF inválido';
    }

    if (!formData.sector.trim()) {
      newErrors.sector = 'Departamento é obrigatório';
    }

    if (!formData.position.trim()) {
      newErrors.position = 'Cargo é obrigatório';
    }

    if (!formData.hireDate) {
      newErrors.hireDate = 'Data de admissão é obrigatória';
    }

    if (!formData.salary.trim()) {
      newErrors.salary = 'Salário é obrigatório';
    } else if (isNaN(parseFloat(formData.salary)) || parseFloat(formData.salary) <= 0) {
      newErrors.salary = 'Salário deve ser um valor válido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Função para lidar com mudanças nos inputs
  const handleInputChange = (field: keyof EmployeeFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Mutation para atualizar funcionário
  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const response = await api.put(`/users/${employee.id}`, {
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        isActive: data.isActive,
        employeeData: {
          department: data.sector,
          position: data.position,
          hireDate: data.hireDate,
          birthDate: data.birthDate,
          salary: parseFloat(data.salary),
          isRemote: data.isRemote,
          workSchedule: {
            startTime: data.workStartTime,
            endTime: data.workEndTime,
            lunchStartTime: data.lunchStartTime,
            lunchEndTime: data.lunchEndTime,
            toleranceMinutes: parseInt(data.toleranceMinutes),
            workDays: [1, 2, 3, 4, 5]
          },
          costCenter: data.costCenter,
          client: data.client,
          dailyFoodVoucher: parseFloat(data.dailyFoodVoucher),
          dailyTransportVoucher: parseFloat(data.dailyTransportVoucher),
          company: data.company,
          bank: data.bank,
          accountType: data.accountType,
          agency: data.agency,
          operation: data.operation,
          account: data.account,
          digit: data.digit,
          pixKeyType: data.pixKeyType,
          pixKey: data.pixKey,
          modality: data.modality,
          familySalary: parseFloat(data.familySalary),
          dangerPay: parseFloat(data.dangerPay),
          unhealthyPay: parseFloat(data.unhealthyPay)
        }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Funcionário atualizado com sucesso!');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar funcionário');
    }
  });

  // Função para submeter formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateEmployeeMutation.mutateAsync(formData);
    } catch (error) {
      console.error('Erro ao atualizar funcionário:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Edit className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Editar Funcionário</h3>
              <p className="text-sm text-gray-600">Atualize os dados do funcionário</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Dados Pessoais */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Pessoais</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Digite o nome completo"
                    />
                    {errors.name && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="email@exemplo.com"
                    />
                    {errors.email && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CPF *
                    </label>
                    <input
                      type="text"
                      value={formData.cpf}
                      onChange={(e) => handleInputChange('cpf', e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.cpf ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="000.000.000-00"
                    />
                    {errors.cpf && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.cpf}
                      </p>
                    )}
                  </div>


                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.isActive ? 'active' : 'inactive'}
                      onChange={(e) => handleInputChange('isActive', e.target.value === 'active')}
                      className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Dados Profissionais */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Profissionais</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Matrícula
                    </label>
                    <input
                      type="text"
                      value={formData.employeeId}
                      disabled
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
                      placeholder="Matrícula não pode ser alterada"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Departamento *
                    </label>
                    <select
                      value={formData.sector}
                      onChange={(e) => handleInputChange('sector', e.target.value)}
                      className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                        errors.sector ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Selecione o departamento</option>
                      {sectors.map(sector => (
                        <option key={sector} value={sector}>{sector}</option>
                      ))}
                    </select>
                    {errors.sector && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.sector}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cargo *
                    </label>
                    <select
                      value={formData.position}
                      onChange={(e) => handleInputChange('position', e.target.value)}
                      className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                        errors.position ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Selecione o cargo</option>
                      {positions.map(position => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                    {errors.position && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.position}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Admissão *
                    </label>
                    <input
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) => handleInputChange('hireDate', e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.hireDate ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.hireDate && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.hireDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => handleInputChange('birthDate', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Salário *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.salary}
                      onChange={(e) => handleInputChange('salary', e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.salary ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0.00"
                    />
                    {errors.salary && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.salary}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Campos VA e VT */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Vale Alimentação e Transporte</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      VA Diário (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.dailyFoodVoucher}
                      onChange={(e) => handleInputChange('dailyFoodVoucher', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="33.40"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      VT Diário (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.dailyTransportVoucher}
                      onChange={(e) => handleInputChange('dailyTransportVoucher', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="11.00"
                    />
                  </div>
                </div>
              </div>

              {/* Dados da Empresa */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados da Empresa</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Empresa
                    </label>
                    <select
                      value={formData.company}
                      onChange={(e) => handleInputChange('company', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      <option value="">Selecione a empresa</option>
                      {companies.map(company => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Centro de Custo
                    </label>
                    <select
                      value={formData.costCenter}
                      onChange={(e) => handleInputChange('costCenter', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      <option value="">Selecione um centro de custo</option>
                      <option value="SEDES">SEDES</option>
                      <option value="DF - ADM LOCAL">DF - ADM LOCAL</option>
                      <option value="ITAMARATY - SERVIÇOS EVENTUAIS">ITAMARATY - SERVIÇOS EVENTUAIS</option>
                      <option value="ITAMARATY - MÃO DE OBRA">ITAMARATY - MÃO DE OBRA</option>
                      <option value="SES GDF - LOTE 14">SES GDF - LOTE 14</option>
                      <option value="SES GDF - LOTE 10">SES GDF - LOTE 10</option>
                      <option value="ADM CENTRAL ENGPAC">ADM CENTRAL ENGPAC</option>
                      <option value="DIRETOR">DIRETOR</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tomador
                    </label>
                    <select
                      value={formData.client}
                      onChange={(e) => handleInputChange('client', e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      <option value="">Selecione um tomador</option>
                      {TOMADORES_LIST.map((tomador) => (
                        <option key={tomador} value={tomador}>
                          {tomador}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>
        </form>
      </div>
    </div>
  );
}
