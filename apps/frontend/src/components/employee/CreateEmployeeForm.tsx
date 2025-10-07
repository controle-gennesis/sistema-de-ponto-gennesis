'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, X, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
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
  password: string;
  
  // Dados do funcionário
  employeeId: string;
  sector: string;
  position: string;
  hireDate: string;
  birthDate: string;
  hireTime: string;
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
  
  // Novos campos - Polo e Categoria Financeira
  polo: 'BRASÍLIA' | 'GOIÁS' | '';
  categoriaFinanceira: 'GASTO' | 'DESPESA' | '';
}

interface CreateEmployeeFormProps {
  onClose: () => void;
}

export function CreateEmployeeForm({ onClose }: CreateEmployeeFormProps) {
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

  // Lista de centros de custo
  const costCenters = [
    'SEDES',
    'DF - ADM LOCAL',
    'ITAMARATY - SERVIÇOS EVENTUAIS',
    'ITAMARATY - MÃO DE OBRA',
    'SES GDF - LOTE 14',
    'SES GDF - LOTE 10',
    'ADM CENTRAL ENGPAC',
    'DIRETOR'
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

  // Função para gerar matrícula aleatória
  const generateEmployeeId = () => {
    // Gera um número de 6 dígitos com prefixo baseado no ano atual
    const currentYear = new Date().getFullYear().toString().slice(-2); // Últimos 2 dígitos do ano
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4 dígitos aleatórios
    return `${currentYear}${randomNumber}`; // Ex: 24001, 24002, etc.
  };

  const [formData, setFormData] = useState<EmployeeFormData>({
    name: '',
    email: '',
    cpf: '',
    password: '',
    employeeId: generateEmployeeId(),
    sector: '',
    position: '',
    hireDate: new Date().toISOString().split('T')[0],
    birthDate: '',
    hireTime: '07:00',
    salary: '',
    isRemote: false,
    workStartTime: '07:00',
    workEndTime: '17:00',
    lunchStartTime: '12:00',
    lunchEndTime: '13:00',
    toleranceMinutes: '10',
    costCenter: '',
    client: '',
    dailyFoodVoucher: '33.40',
    dailyTransportVoucher: '11.00',
    // Novos campos
    company: '',
    bank: '',
    accountType: '',
    agency: '',
    operation: '',
    account: '',
    digit: '',
    pixKeyType: '',
    pixKey: '',
    // Novos campos - Modalidade e Adicionais
    modality: '',
    familySalary: '0.00',
    dangerPay: '0', // 0% por padrão
    unhealthyPay: '0', // 0% por padrão
    
    // Novos campos - Polo e Categoria Financeira
    polo: '',
    categoriaFinanceira: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [tomadorSearch, setTomadorSearch] = useState('');
  const [showTomadorDropdown, setShowTomadorDropdown] = useState(false);
  
  // Estados para busca de outros campos
  const [costCenterSearch, setCostCenterSearch] = useState('');
  const [showCostCenterDropdown, setShowCostCenterDropdown] = useState(false);
  
  const [positionSearch, setPositionSearch] = useState('');
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  
  const [sectorSearch, setSectorSearch] = useState('');
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  
  // Estados para busca de campos restantes
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  
  const [bankSearch, setBankSearch] = useState('');
  const [showBankDropdown, setShowBankDropdown] = useState(false);

  const queryClient = useQueryClient();

  // Filtrar tomadores baseado na busca
  const filteredTomadores = TOMADORES_LIST.filter(tomador =>
    tomador.toLowerCase().includes(tomadorSearch.toLowerCase())
  );

  // Filtrar centros de custo baseado na busca
  const filteredCostCenters = costCenters.filter(costCenter =>
    costCenter.toLowerCase().includes(costCenterSearch.toLowerCase())
  );

  // Filtrar cargos baseado na busca
  const filteredPositions = positions.filter(position =>
    position.toLowerCase().includes(positionSearch.toLowerCase())
  );

  // Filtrar setores baseado na busca
  const filteredSectors = sectors.filter(sector =>
    sector.toLowerCase().includes(sectorSearch.toLowerCase())
  );

  // Filtrar empresas baseado na busca
  const filteredCompanies = companies.filter(company =>
    company.toLowerCase().includes(companySearch.toLowerCase())
  );

  // Filtrar bancos baseado na busca
  const filteredBanks = banks.filter(bank =>
    bank.toLowerCase().includes(bankSearch.toLowerCase())
  );


  // Função para selecionar tomador
  const selectTomador = (tomador: string) => {
    setFormData(prev => ({ ...prev, client: tomador }));
    setTomadorSearch(tomador);
    setShowTomadorDropdown(false);
  };

  // Função para selecionar centro de custo
  const selectCostCenter = (costCenter: string) => {
    setFormData(prev => ({ ...prev, costCenter }));
    setCostCenterSearch(costCenter);
    setShowCostCenterDropdown(false);
  };

  // Função para selecionar cargo
  const selectPosition = (position: string) => {
    setFormData(prev => ({ ...prev, position }));
    setPositionSearch(position);
    setShowPositionDropdown(false);
  };

  // Função para selecionar setor
  const selectSector = (sector: string) => {
    setFormData(prev => ({ ...prev, sector }));
    setSectorSearch(sector);
    setShowSectorDropdown(false);
  };

  // Função para selecionar empresa
  const selectCompany = (company: string) => {
    setFormData(prev => ({ ...prev, company }));
    setCompanySearch(company);
    setShowCompanyDropdown(false);
  };

  // Função para selecionar banco
  const selectBank = (bank: string) => {
    setFormData(prev => ({ ...prev, bank }));
    setBankSearch(bank);
    setShowBankDropdown(false);
  };

  // Função para validar CPF
  const isValidCPF = (cpf: string): boolean => {
    if (cpf.length !== 11) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    // Calcular primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9))) return false;
    
    // Calcular segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10))) return false;
    
    return true;
  };

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const employeeData = {
        employeeId: data.employeeId,
        department: data.sector,
        position: data.position,
        hireDate: `${data.hireDate}T${data.hireTime}:00`,
        birthDate: data.birthDate || null,
        salary: parseFloat(data.salary),
        isRemote: data.isRemote,
        workSchedule: {
          startTime: data.workStartTime,
          endTime: data.workEndTime,
          lunchStartTime: data.lunchStartTime,
          lunchEndTime: data.lunchEndTime,
          workDays: [1, 2, 3, 4, 5], // Segunda a sexta
          toleranceMinutes: parseInt(data.toleranceMinutes)
        },
        costCenter: data.costCenter,
        client: data.client,
        dailyFoodVoucher: parseFloat(data.dailyFoodVoucher),
        dailyTransportVoucher: parseFloat(data.dailyTransportVoucher),
        allowedLocations: [],
        // Novos campos
          company: data.company,
        bank: data.bank,
        accountType: data.accountType,
        agency: data.agency,
        operation: data.operation,
        account: data.account,
        digit: data.digit,
        pixKeyType: data.pixKeyType,
        pixKey: data.pixKey,
        // Novos campos - Modalidade e Adicionais
        modality: data.modality || null,
        familySalary: data.familySalary ? parseFloat(data.familySalary) : 0,
        dangerPay: data.dangerPay ? parseFloat(data.dangerPay) : 0,
        unhealthyPay: data.unhealthyPay ? parseFloat(data.unhealthyPay) : 0,
        
        // Novos campos - Polo e Categoria Financeira
        polo: data.polo || null,
        categoriaFinanceira: data.categoriaFinanceira || null
      };

      const response = await api.post('/users', {
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        password: data.password,
        role: 'EMPLOYEE', // Sempre criar como funcionário
        employeeData
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Funcionário criado com sucesso!');
      onClose();
    },
    onError: (error: any) => {
      console.error('Erro ao criar funcionário:', error);
      
      // Limpar mensagem de aviso anterior
      setWarningMessage('');
      
      // Tratar erros específicos do backend
      if (error.response?.data?.message) {
        const message = error.response.data.message;
        
        if (message.includes('Usuário já existe com este email ou CPF')) {
          setErrors({ 
            email: 'Este email já está em uso', 
            cpf: 'Este CPF já está em uso' 
          });
          setWarningMessage('⚠️ Este email ou CPF já está cadastrado no sistema. Verifique os dados e tente novamente.');
          toast.error('Email ou CPF já cadastrado no sistema');
        } else if (message.includes('email') || message.includes('Email')) {
          setErrors({ email: 'Este email já está em uso' });
          setWarningMessage('⚠️ Este email já está cadastrado no sistema. Por favor, use um email diferente.');
          toast.error('Email já cadastrado no sistema');
        } else if (message.includes('cpf') || message.includes('CPF')) {
          setErrors({ cpf: 'Este CPF já está em uso' });
          setWarningMessage('⚠️ Este CPF já está cadastrado no sistema. Por favor, verifique o número digitado.');
          toast.error('CPF já cadastrado no sistema');
        } else if (message.includes('já existe') || message.includes('já está em uso')) {
          setWarningMessage('⚠️ Dados já cadastrados no sistema. Verifique email e CPF.');
          toast.error('Dados já cadastrados no sistema');
        } else {
          setWarningMessage(`⚠️ ${message}`);
          toast.error(message);
        }
      } else {
        setWarningMessage('⚠️ Erro ao criar funcionário. Tente novamente.');
        toast.error('Erro ao criar funcionário. Tente novamente.');
      }
    }
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';
    
    if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório';
    else {
      const cpfNumbers = formData.cpf.replace(/\D/g, '');
      if (cpfNumbers.length !== 11) {
        newErrors.cpf = 'CPF deve ter 11 dígitos';
      } else if (!isValidCPF(cpfNumbers)) {
        newErrors.cpf = 'CPF inválido';
      }
    }
    
    if (!formData.password.trim()) newErrors.password = 'Senha é obrigatória';
    else if (formData.password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    
    // Matrícula é gerada automaticamente, não precisa validar
    
    // Validação do setor - verifica se está vazio ou se o texto digitado não corresponde a nenhum setor
    if (!formData.sector.trim()) {
      newErrors.sector = 'Setor é obrigatório';
    } else if (sectorSearch.trim() && !sectors.includes(sectorSearch)) {
      newErrors.sector = 'Selecione um setor válido da lista';
    }
    
    // Validação do cargo - verifica se está vazio ou se o texto digitado não corresponde a nenhum cargo
    if (!formData.position.trim()) {
      newErrors.position = 'Cargo é obrigatório';
    } else if (positionSearch.trim() && !positions.includes(positionSearch)) {
      newErrors.position = 'Selecione um cargo válido da lista';
    }
    
    if (!formData.hireDate.trim()) newErrors.hireDate = 'Data de contratação é obrigatória';
    else if (isNaN(new Date(formData.hireDate).getTime())) {
      newErrors.hireDate = 'Data de contratação inválida';
    }
    if (!formData.salary.trim()) newErrors.salary = 'Salário é obrigatório';
    else if (isNaN(parseFloat(formData.salary)) || parseFloat(formData.salary) <= 0) {
      newErrors.salary = 'Salário deve ser um valor válido';
    }
    
    // Validação dos campos VA e VT
    if (!formData.dailyFoodVoucher.trim()) newErrors.dailyFoodVoucher = 'Vale Alimentação é obrigatório';
    else if (isNaN(parseFloat(formData.dailyFoodVoucher)) || parseFloat(formData.dailyFoodVoucher) < 0) {
      newErrors.dailyFoodVoucher = 'Vale Alimentação deve ser um valor válido';
    }
    
    if (!formData.dailyTransportVoucher.trim()) newErrors.dailyTransportVoucher = 'Vale Transporte é obrigatório';
    else if (isNaN(parseFloat(formData.dailyTransportVoucher)) || parseFloat(formData.dailyTransportVoucher) < 0) {
      newErrors.dailyTransportVoucher = 'Vale Transporte deve ser um valor válido';
    }
    
    // Validação dos novos campos
    if (!formData.modality.trim()) newErrors.modality = 'Modalidade é obrigatória';
    if (!formData.polo.trim()) newErrors.polo = 'Polo é obrigatório';
    if (!formData.categoriaFinanceira.trim()) newErrors.categoriaFinanceira = 'Categoria Financeira é obrigatória';
    
    if (!formData.familySalary.trim()) newErrors.familySalary = 'Salário Família é obrigatório';
    else if (isNaN(parseFloat(formData.familySalary)) || parseFloat(formData.familySalary) < 0) {
      newErrors.familySalary = 'Salário Família deve ser um valor válido';
    }
    
    if (!formData.dangerPay.trim()) newErrors.dangerPay = 'Periculosidade é obrigatória';
    
    if (!formData.unhealthyPay.trim()) newErrors.unhealthyPay = 'Insalubridade é obrigatória';
    
    // Validações adicionais para campos obrigatórios
    if (!formData.birthDate.trim()) newErrors.birthDate = 'Data de nascimento é obrigatória';
    else if (isNaN(new Date(formData.birthDate).getTime())) {
      newErrors.birthDate = 'Data de nascimento inválida';
    }
    
    // Validação do centro de custo - verifica se está vazio ou se o texto digitado não corresponde a nenhum centro
    if (!formData.costCenter.trim()) {
      newErrors.costCenter = 'Centro de custo é obrigatório';
    } else if (costCenterSearch.trim() && !costCenters.includes(costCenterSearch)) {
      newErrors.costCenter = 'Selecione um centro de custo válido da lista';
    }
    
    // Validação do tomador - verifica se está vazio ou se o texto digitado não corresponde a nenhum tomador
    if (!formData.client.trim()) {
      newErrors.client = 'Tomador é obrigatório';
    } else if (tomadorSearch.trim() && !TOMADORES_LIST.includes(tomadorSearch)) {
      newErrors.client = 'Selecione um tomador válido da lista';
    }
    
    // Validação da empresa - verifica se está vazio ou se o texto digitado não corresponde a nenhuma empresa
    if (!formData.company.trim()) {
      newErrors.company = 'Empresa é obrigatória';
    } else if (companySearch.trim() && !companies.includes(companySearch)) {
      newErrors.company = 'Selecione uma empresa válida da lista';
    }
    
    // Validação do banco - verifica se está vazio ou se o texto digitado não corresponde a nenhum banco
    if (!formData.bank.trim()) {
      newErrors.bank = 'Banco é obrigatório';
    } else if (bankSearch.trim() && !banks.includes(bankSearch)) {
      newErrors.bank = 'Selecione um banco válido da lista';
    }
    
    if (!formData.accountType.trim()) newErrors.accountType = 'Tipo de conta é obrigatório';
    if (!formData.agency.trim()) newErrors.agency = 'Agência é obrigatória';
    if (!formData.operation.trim()) newErrors.operation = 'Operação é obrigatória';
    if (!formData.account.trim()) newErrors.account = 'Conta é obrigatória';
    if (!formData.digit.trim()) newErrors.digit = 'Dígito é obrigatório';
    
    // Validações dos dados PIX
    if (!formData.pixKeyType.trim()) newErrors.pixKeyType = 'Tipo de chave PIX é obrigatório';
    if (!formData.pixKey.trim()) newErrors.pixKey = 'Chave PIX é obrigatória';
    
    // Validações dos horários de trabalho
    if (!formData.workStartTime.trim()) newErrors.workStartTime = 'Horário de início é obrigatório';
    if (!formData.workEndTime.trim()) newErrors.workEndTime = 'Horário de fim é obrigatório';
    if (!formData.lunchStartTime.trim()) newErrors.lunchStartTime = 'Horário de início do almoço é obrigatório';
    if (!formData.lunchEndTime.trim()) newErrors.lunchEndTime = 'Horário de fim do almoço é obrigatório';
    if (!formData.toleranceMinutes.trim()) newErrors.toleranceMinutes = 'Tolerância é obrigatória';
    else if (isNaN(parseInt(formData.toleranceMinutes)) || parseInt(formData.toleranceMinutes) < 0) {
      newErrors.toleranceMinutes = 'Tolerância deve ser um número válido';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await createEmployeeMutation.mutateAsync(formData);
    } catch (error) {
      console.error('Erro ao criar funcionário:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof EmployeeFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    // Limpar mensagem de aviso quando usuário começar a digitar
    if (warningMessage) {
      setWarningMessage('');
    }
  };

  // Função para formatar CPF
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    handleInputChange('cpf', formatted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserPlus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cadastrar Novo Funcionário</h3>
              <p className="text-sm text-gray-600">Preencha os dados para cadastrar um novo funcionário</p>
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

        {/* Mensagem de aviso */}
        {warningMessage && (
          <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Atenção</p>
                <p className="text-sm text-yellow-700 mt-1">{warningMessage}</p>
              </div>
            </div>
          </div>
        )}

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
                  placeholder="Nome completo do funcionário"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
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
                  placeholder="email@empresa.com"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPF *
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => handleCPFChange(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.cpf ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {errors.cpf && <p className="text-red-500 text-xs mt-1">{errors.cpf}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha Temporária *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.password ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              </div>
            </div>

            {/* Campos VA e VT */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Vales Diários</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vale Alimentação Diário (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.dailyFoodVoucher}
                    onChange={(e) => handleInputChange('dailyFoodVoucher', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.dailyFoodVoucher ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="33.40"
                  />
                  {errors.dailyFoodVoucher && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.dailyFoodVoucher}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vale Transporte Diário (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.dailyTransportVoucher}
                    onChange={(e) => handleInputChange('dailyTransportVoucher', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.dailyTransportVoucher ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="11.00"
                  />
                  {errors.dailyTransportVoucher && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.dailyTransportVoucher}
                    </p>
                  )}
                </div>
              </div>
            </div>

          {/* Dados Profissionais */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Profissionais</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matrícula *
                </label>
                <input
                  type="text"
                  value={formData.employeeId}
                  readOnly
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md bg-gray-50 text-gray-700 cursor-not-allowed"
                  placeholder="Número da matrícula"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setor *
                </label>
                
                {/* Campo de busca com dropdown */}
                <div className="relative">
                  <input
                    type="text"
                    value={sectorSearch}
                    onChange={(e) => {
                      setSectorSearch(e.target.value);
                      setShowSectorDropdown(true);
                      if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, sector: '' }));
                      }
                    }}
                    onFocus={() => setShowSectorDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSectorDropdown(false), 200)}
                    placeholder="Digite para buscar o setor..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Dropdown com resultados */}
                  {showSectorDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredSectors.length > 0 ? (
                        filteredSectors.map((sector) => (
                          <div
                            key={sector}
                            onClick={() => selectSector(sector)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {sector}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhum setor encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {errors.sector && (
                  <p className="text-red-500 text-xs mt-1">{errors.sector}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cargo *
                </label>
                
                {/* Campo de busca com dropdown */}
                <div className="relative">
                  <input
                    type="text"
                    value={positionSearch}
                    onChange={(e) => {
                      setPositionSearch(e.target.value);
                      setShowPositionDropdown(true);
                      if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, position: '' }));
                      }
                    }}
                    onFocus={() => setShowPositionDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPositionDropdown(false), 200)}
                    placeholder="Digite para buscar o cargo..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Dropdown com resultados */}
                  {showPositionDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredPositions.length > 0 ? (
                        filteredPositions.map((position) => (
                          <div
                            key={position}
                            onClick={() => selectPosition(position)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {position}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhum cargo encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {errors.position && (
                  <p className="text-red-500 text-xs mt-1">{errors.position}</p>
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
                  <p className="text-red-500 text-sm mt-1">{errors.hireDate}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Nascimento *
                </label>
                <input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => handleInputChange('birthDate', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  max={new Date().toISOString().split('T')[0]} // Não permitir data futura
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
                {errors.salary && <p className="text-red-500 text-xs mt-1">{errors.salary}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Centro de Custo *
                </label>
                
                {/* Campo de busca com dropdown */}
                <div className="relative">
                  <input
                    type="text"
                    value={costCenterSearch}
                    onChange={(e) => {
                      setCostCenterSearch(e.target.value);
                      setShowCostCenterDropdown(true);
                      if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, costCenter: '' }));
                      }
                    }}
                    onFocus={() => setShowCostCenterDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCostCenterDropdown(false), 200)}
                    placeholder="Digite para buscar o centro de custo..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Dropdown com resultados */}
                  {showCostCenterDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredCostCenters.length > 0 ? (
                        filteredCostCenters.map((costCenter) => (
                          <div
                            key={costCenter}
                            onClick={() => selectCostCenter(costCenter)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {costCenter}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhum centro de custo encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {errors.costCenter && (
                  <p className="text-red-500 text-xs mt-1">{errors.costCenter}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tomador *
                </label>
                
                {/* Campo de busca com dropdown */}
                <div className="relative">
                  <input
                    type="text"
                    value={tomadorSearch}
                    onChange={(e) => {
                      setTomadorSearch(e.target.value);
                      setShowTomadorDropdown(true);
                      // Se o campo estiver vazio, limpar a seleção
                      if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, client: '' }));
                      }
                    }}
                    onFocus={() => setShowTomadorDropdown(true)}
                    onBlur={() => {
                      // Delay para permitir clique no dropdown
                      setTimeout(() => setShowTomadorDropdown(false), 200);
                    }}
                    placeholder="Digite para buscar o tomador..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Dropdown com resultados */}
                  {showTomadorDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredTomadores.length > 0 ? (
                        filteredTomadores.map((tomador) => (
                          <div
                            key={tomador}
                            onClick={() => selectTomador(tomador)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {tomador}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhum tomador encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {errors.client && (
                  <p className="text-red-500 text-xs mt-1">{errors.client}</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isRemote"
                  checked={formData.isRemote}
                  onChange={(e) => handleInputChange('isRemote', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isRemote" className="text-sm font-medium text-gray-700">
                  Trabalho Remoto *
                </label>
              </div>
              </div>
            </div>

            {/* Modalidade e Adicionais Salariais */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Modalidade e Adicionais</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modalidade *
                  </label>
                  <select
                    value={formData.modality}
                    onChange={(e) => handleInputChange('modality', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                      errors.modality ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione a modalidade</option>
                    <option value="CLT">CLT</option>
                    <option value="MEI">MEI</option>
                    <option value="ESTAGIARIO">ESTAGIÁRIO</option>
                  </select>
                  {errors.modality && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.modality}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Salário Família (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.familySalary}
                    onChange={(e) => handleInputChange('familySalary', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.familySalary ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                  />
                  {errors.familySalary && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.familySalary}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Periculosidade *
                  </label>
                  <select
                    value={formData.dangerPay}
                    onChange={(e) => handleInputChange('dangerPay', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                      errors.dangerPay ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione a porcentagem</option>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="10">10%</option>
                    <option value="15">15%</option>
                    <option value="20">20%</option>
                    <option value="25">25%</option>
                    <option value="30">30%</option>
                    <option value="35">35%</option>
                    <option value="40">40%</option>
                    <option value="45">45%</option>
                    <option value="50">50%</option>
                    <option value="55">55%</option>
                    <option value="60">60%</option>
                    <option value="65">65%</option>
                    <option value="70">70%</option>
                    <option value="75">75%</option>
                    <option value="80">80%</option>
                    <option value="85">85%</option>
                    <option value="90">90%</option>
                    <option value="95">95%</option>
                    <option value="100">100%</option>
                  </select>
                  {errors.dangerPay && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.dangerPay}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Insalubridade *
                  </label>
                  <select
                    value={formData.unhealthyPay}
                    onChange={(e) => handleInputChange('unhealthyPay', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                      errors.unhealthyPay ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione a porcentagem</option>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="10">10%</option>
                    <option value="15">15%</option>
                    <option value="20">20%</option>
                    <option value="25">25%</option>
                    <option value="30">30%</option>
                    <option value="35">35%</option>
                    <option value="40">40%</option>
                    <option value="45">45%</option>
                    <option value="50">50%</option>
                    <option value="55">55%</option>
                    <option value="60">60%</option>
                    <option value="65">65%</option>
                    <option value="70">70%</option>
                    <option value="75">75%</option>
                    <option value="80">80%</option>
                    <option value="85">85%</option>
                    <option value="90">90%</option>
                    <option value="95">95%</option>
                    <option value="100">100%</option>
                  </select>
                  {errors.unhealthyPay && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.unhealthyPay}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Polo e Categoria Financeira */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Polo e Categoria Financeira</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Polo *
                  </label>
                  <select
                    value={formData.polo}
                    onChange={(e) => handleInputChange('polo', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                      errors.polo ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione o polo</option>
                    <option value="BRASÍLIA">BRASÍLIA</option>
                    <option value="GOIÁS">GOIÁS</option>
                  </select>
                  {errors.polo && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.polo}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoria Financeira *
                  </label>
                  <select
                    value={formData.categoriaFinanceira}
                    onChange={(e) => handleInputChange('categoriaFinanceira', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                      errors.categoriaFinanceira ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione a categoria</option>
                    <option value="GASTO">GASTO</option>
                    <option value="DESPESA">DESPESA</option>
                  </select>
                  {errors.categoriaFinanceira && (
                    <p className="text-red-500 text-xs mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.categoriaFinanceira}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Dados da Empresa e Contrato */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados da Empresa</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empresa *
                </label>
                
                {/* Campo de busca com dropdown */}
                <div className="relative">
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(e) => {
                      setCompanySearch(e.target.value);
                      setShowCompanyDropdown(true);
                      if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, company: '' }));
                      }
                    }}
                    onFocus={() => setShowCompanyDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCompanyDropdown(false), 200)}
                    placeholder="Digite para buscar a empresa..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Dropdown com resultados */}
                  {showCompanyDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredCompanies.length > 0 ? (
                        filteredCompanies.map((company) => (
                          <div
                            key={company}
                            onClick={() => selectCompany(company)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {company}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhuma empresa encontrada
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {errors.company && (
                  <p className="text-red-500 text-xs mt-1">{errors.company}</p>
                )}
              </div>
            </div>
          </div>

          {/* Dados Bancários */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Bancários</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Banco *
                </label>
                
                {/* Campo de busca com dropdown */}
                <div className="relative">
                  <input
                    type="text"
                    value={bankSearch}
                    onChange={(e) => {
                      setBankSearch(e.target.value);
                      setShowBankDropdown(true);
                      if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, bank: '' }));
                      }
                    }}
                    onFocus={() => setShowBankDropdown(true)}
                    onBlur={() => setTimeout(() => setShowBankDropdown(false), 200)}
                    placeholder="Digite para buscar o banco..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Dropdown com resultados */}
                  {showBankDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredBanks.length > 0 ? (
                        filteredBanks.map((bank) => (
                          <div
                            key={bank}
                            onClick={() => selectBank(bank)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {bank}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhum banco encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {errors.bank && (
                  <p className="text-red-500 text-xs mt-1">{errors.bank}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Conta *
                </label>
                <select
                  value={formData.accountType}
                  onChange={(e) => handleInputChange('accountType', e.target.value)}
                  className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                    errors.accountType ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Selecione o tipo</option>
                  {accountTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {errors.accountType && <p className="text-red-500 text-xs mt-1">{errors.accountType}</p>}
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agência *
                  </label>
                  <input
                    type="text"
                    value={formData.agency}
                    onChange={(e) => handleInputChange('agency', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.agency ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="1234"
                  />
                  {errors.agency && <p className="text-red-500 text-xs mt-1">{errors.agency}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Operação *
                  </label>
                  <input
                    type="text"
                    value={formData.operation}
                    onChange={(e) => handleInputChange('operation', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.operation ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="01"
                  />
                  {errors.operation && <p className="text-red-500 text-xs mt-1">{errors.operation}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Conta *
                  </label>
                  <input
                    type="text"
                    value={formData.account}
                    onChange={(e) => handleInputChange('account', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.account ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="12345"
                  />
                  {errors.account && <p className="text-red-500 text-xs mt-1">{errors.account}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dígito *
                  </label>
                  <input
                    type="text"
                    value={formData.digit}
                    onChange={(e) => handleInputChange('digit', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.digit ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="6"
                    maxLength={2}
                  />
                  {errors.digit && <p className="text-red-500 text-xs mt-1">{errors.digit}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Dados PIX */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados PIX</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Chave *
                </label>
                <select
                  value={formData.pixKeyType}
                  onChange={(e) => handleInputChange('pixKeyType', e.target.value)}
                  className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                    errors.pixKeyType ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Selecione o tipo</option>
                  {pixKeyTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {errors.pixKeyType && <p className="text-red-500 text-xs mt-1">{errors.pixKeyType}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chave PIX *
                </label>
                <input
                  type="text"
                  value={formData.pixKey}
                  onChange={(e) => handleInputChange('pixKey', e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.pixKey ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Digite a chave PIX"
                />
                {errors.pixKey && <p className="text-red-500 text-xs mt-1">{errors.pixKey}</p>}
              </div>
            </div>
          </div>

          {/* Horário de Trabalho */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Horário de Trabalho</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Início *
                </label>
                <input
                  type="time"
                  value={formData.workStartTime}
                  onChange={(e) => handleInputChange('workStartTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fim *
                </label>
                <input
                  type="time"
                  value={formData.workEndTime}
                  onChange={(e) => handleInputChange('workEndTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Início Almoço *
                </label>
                <input
                  type="time"
                  value={formData.lunchStartTime}
                  onChange={(e) => handleInputChange('lunchStartTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fim Almoço *
                </label>
                <input
                  type="time"
                  value={formData.lunchEndTime}
                  onChange={(e) => handleInputChange('lunchEndTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tolerância (minutos) *
              </label>
              <input
                type="number"
                value={formData.toleranceMinutes}
                onChange={(e) => handleInputChange('toleranceMinutes', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                max="60"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Criando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Criar Funcionário</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
