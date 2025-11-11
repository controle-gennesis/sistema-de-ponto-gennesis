import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Building, DollarSign, Clock, AlertTriangle, CreditCard, Moon, Save, Plus } from 'lucide-react';
import { PayrollEmployee } from '@/types';

interface PayrollDetailModalProps {
  employee: PayrollEmployee;
  month: number;
  year: number;
  isOpen: boolean;
  onClose: () => void;
  onEmployeeUpdate?: (updatedEmployee: PayrollEmployee) => void;
}

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function PayrollDetailModal({ employee, month, year, isOpen, onClose, onEmployeeUpdate }: PayrollDetailModalProps) {
  if (!isOpen) return null;

  const monthName = monthNames[month - 1];
  
  // Estados para os valores manuais editáveis
  const [inssRescisao, setInssRescisao] = useState(employee.inssRescisao || 0);
  const [inss13, setInss13] = useState(employee.inss13 || 0);
  const [editingField, setEditingField] = useState<'inssRescisao' | 'inss13' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Atualizar estados quando o funcionário mudar
  useEffect(() => {
    setInssRescisao(employee.inssRescisao || 0);
    setInss13(employee.inss13 || 0);
  }, [employee]);
  
  // Função para salvar os valores manuais
  const handleSaveManualValues = async () => {
    setIsSaving(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/payroll/manual-inss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeId: employee.id,
          month,
          year,
          inssRescisao,
          inss13
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar valores manuais');
      }

      // Recarregar dados do funcionário
      const employeeResponse = await fetch(`${API_URL}/payroll/employee/${employee.id}?month=${month}&year=${year}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (employeeResponse.ok) {
        const updatedEmployeeData = await employeeResponse.json();
        if (updatedEmployeeData.success && updatedEmployeeData.data) {
          // Atualizar os estados locais
          setInssRescisao(updatedEmployeeData.data.inssRescisao || 0);
          setInss13(updatedEmployeeData.data.inss13 || 0);
          
          // Notificar o componente pai sobre a atualização
          if (onEmployeeUpdate) {
            onEmployeeUpdate(updatedEmployeeData.data);
          }
        }
      }

      setEditingField(null);
      console.log('Valores salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Cálculos
  const salarioBase = employee.salary;
  const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
  const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
  const salarioFamilia = employee.familySalary || 0;
  const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
  
  // Calcular número de dias do mês para desconto de faltas
  // Usa 30 como padrão, ou 31 apenas se for o mês de admissão E o mês de admissão tiver 31 dias
  let diasParaDesconto = 30; // Padrão
  if (employee.admissionDate) {
    const admissionDate = new Date(employee.admissionDate);
    const mesAdmissao = admissionDate.getMonth() + 1; // getMonth() retorna 0-11
    const anoAdmissao = admissionDate.getFullYear();
    
    // Só usa 31 dias se for o mês de admissão e o mês tiver 31 dias
    if (month === mesAdmissao && year === anoAdmissao) {
      const diasMesAdmissao = new Date(anoAdmissao, mesAdmissao, 0).getDate();
      if (diasMesAdmissao === 31) {
        diasParaDesconto = 31;
      }
    }
  }
  
  // Calcular número de dias do mês atual (para outros cálculos)
  const diasDoMes = new Date(year, month, 0).getDate(); // Último dia do mês
  
  const descontoPorFaltas = ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas;
  
  // Cálculo específico do DSR por Falta
  const dsrPorFalta = (salarioBase / diasParaDesconto) * faltas;
  
  // Cálculos de %VA e %VT baseados no polo
  const percentualVA = employee.polo === 'BRASÍLIA' ? (employee.totalFoodVoucher || 0) * 0.09 : 0;
  const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
  
  // Cálculo do DSR H.E (Descanso Semanal Remunerado sobre Horas Extras)
  const totalHorasExtras = (employee.he50Hours || 0) + (employee.he100Hours || 0);
  const diasUteis = employee.totalWorkingDays || 0; // Segunda a Sábado
  const diasNaoUteis = diasDoMes - diasUteis; // Domingo + feriados
  const dsrHE = diasUteis > 0 ? (totalHorasExtras / diasUteis) * diasNaoUteis : 0;
  
  // Cálculo do valor do DSR H.E considerando as diferentes taxas
  // he50Hours e he100Hours já vêm multiplicados do backend
  const valorDSRHE = diasUteis > 0 ? 
    ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) +  // DSR sobre HE 50% (já multiplicado)
    ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)   // DSR sobre HE 100% (já multiplicado)
    : 0;
  
  // Cálculo da BASE INSS MENSAL
  const valorHorasExtras = (employee.he50Value || 0) + (employee.he100Value || 0);
  const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
    ? 0 
    : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
  
  // Cálculo do INSS MENSAL (Tabela Progressiva)
  const calcularINSS = (baseINSS: number): number => {
    if (baseINSS <= 0) return 0;
    
    if (baseINSS <= 1518) {
      return baseINSS * 0.075; // 7,5%
    } else if (baseINSS <= 2793) {
      return (1518 * 0.075) + ((baseINSS - 1518) * 0.09); // 7,5% até 1518 + 9% do excedente
    } else if (baseINSS <= 4190) {
      return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((baseINSS - 2793) * 0.12); // 7,5% até 1518 + 9% até 2793 + 12% do excedente
    } else if (baseINSS <= 8157) {
      return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((baseINSS - 4190) * 0.14); // 7,5% até 1518 + 9% até 2793 + 12% até 4190 + 14% do excedente
    } else {
      return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((8157 - 4190) * 0.14); // Teto máximo
    }
  };
  
  const inssMensal = calcularINSS(baseINSSMensal);
  
  const totalProventos = salarioBase + periculosidade + insalubridade + salarioFamilia + (employee.totalTransportVoucher || 0) + (dsrHE * (employee.hourlyRate || 0));
  const totalDescontos = employee.totalDiscounts + descontoPorFaltas + dsrPorFalta + percentualVA + percentualVT + inssMensal;
  const liquidoReceber = totalProventos - totalDescontos;
  
  // Cálculo com acréscimos
  const totalProventosComAcrescimos = salarioBase + periculosidade + insalubridade + salarioFamilia + employee.totalAdjustments + (employee.totalTransportVoucher || 0) + (dsrHE * (employee.hourlyRate || 0));
  const liquidoComAcrescimos = totalProventosComAcrescimos - totalDescontos;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2">
                <img 
                  src="/logo.png" 
                  alt="Logo da Empresa" 
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Folha de Pagamento</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{monthName} de {year}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Employee Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">
                Dados do Funcionário
              </h4>
              <div className="rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Nome:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">CPF:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.cpf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Matrícula:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.employeeId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Função:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.position}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Setor:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.department}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">
                Dados da Empresa
              </h4>
              <div className="rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Empresa:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.company || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Polo:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.polo || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Categoria Financeira:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.categoriaFinanceira || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Modalidade:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.modality || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Centro de Custo:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.costCenter || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tomador:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.client || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Alocação Final:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.alocacaoFinal || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Banking Info */}
          <div className="space-y-4 mb-6">
            <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">
              Dados Bancários
            </h4>
            <div className="rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Banco:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.bank || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tipo de Conta:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.accountType || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Agência:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.agency || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Operação:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.operation || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Conta:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.account || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Dígito:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.digit || 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tipo de Chave:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.pixKeyType || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Chave PIX:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.pixKey || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payroll Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              Detalhamento da Folha
            </h3>
            
            <div className="overflow-x-auto shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Cód.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Descrição
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Referência
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                      Proventos
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Descontos
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {/* Salário Base */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      001
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      SALÁRIO BASE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.daysWorked} dias
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Periculosidade */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      002
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      PERICULOSIDADE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.dangerPay || 0}%
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {periculosidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Insalubridade */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      003
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSALUBRIDADE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.unhealthyPay || 0}%
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {insalubridade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Salário Família */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      004
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      SALÁRIO FAMÍLIA
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {salarioFamilia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Acréscimos */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      005
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      ACRÉSCIMOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {(employee.totalAdjustments || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Descontos */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      006
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DESCONTOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      R$ {(employee.totalDiscounts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Desconto por Faltas */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      007
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FALTAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {faltas || 0} faltas
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      R$ {(descontoPorFaltas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* DSR por Falta */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      008
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DSR POR FALTA
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {faltas || 0} faltas
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      R$ {(dsrPorFalta || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* %VA - Desconto de 9% do VA para funcionários de BRASÍLIA */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      009
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VA%
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.polo === 'BRASÍLIA' ? '9% do VA' : 'Não aplicável'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      R$ {percentualVA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* %VT - Desconto de 6% do salário para funcionários de GOIÁS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      010
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VT%
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.polo === 'GOIÁS' ? '6% do salário' : 'Não aplicável'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      R$ {percentualVT.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Vale Alimentação */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      011
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VALE ALIMENTAÇÃO
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.daysWorked} dias
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {(employee.totalFoodVoucher || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Vale Transporte */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      012
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VALE TRANSPORTE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.daysWorked} dias
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {(employee.totalTransportVoucher || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Total Horas Extras */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      013
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      HORAS EXTRAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {((employee.he50Hours || 0) + (employee.he100Hours || 0)).toFixed(2)}h
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {((employee.he50Value || 0) + (employee.he100Value || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* DSR H.E */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      014
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DSR POR HORAS EXTRAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {dsrHE.toFixed(2)}h
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {(dsrHE * (employee.hourlyRate || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* BASE INSS MENSAL */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      015
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      BASE INSS MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Mensal'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {baseINSSMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* INSS MENSAL */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      016
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela Progressiva'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {inssMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* BASE INSS FÉRIAS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      017
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      BASE INSS FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTÁGIO' ? 'Não aplicável' : `${employee.vacationDays || 0} dias`}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {(employee.baseInssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* INSS FÉRIAS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      018
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTÁGIO' ? 'Não aplicável' : 'Sobre férias'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.inssFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* INSS RESCISÃO */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      019
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS RESCISÃO
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Manual
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-red-700 dark:text-red-400">
                      {editingField === 'inssRescisao' ? (
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="text"
                            value={inssRescisao === 0 ? '' : inssRescisao.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setInssRescisao(parseFloat(value.replace(',', '.')) || 0);
                            }}
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                          />
                          <button
                            onClick={handleSaveManualValues}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      ) : inssRescisao > 0 ? (
                        <div 
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-right"
                          onClick={() => setEditingField('inssRescisao')}
                          title="Clique para editar"
                        >
                          R$ {inssRescisao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <button
                            onClick={() => setEditingField('inssRescisao')}
                            className="flex items-center justify-center gap-1 px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title="Adicionar valor"
                          >
                            <Plus className="w-3 h-3" />
                            Adicionar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* INSS 13° */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      020
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS 13°
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Manual
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-red-700 dark:text-red-400">
                      {editingField === 'inss13' ? (
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="text"
                            value={inss13 === 0 ? '' : inss13.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setInss13(parseFloat(value.replace(',', '.')) || 0);
                            }}
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                          />
                          <button
                            onClick={handleSaveManualValues}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      ) : inss13 > 0 ? (
                        <div 
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-right"
                          onClick={() => setEditingField('inss13')}
                          title="Clique para editar"
                        >
                          R$ {inss13.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <button
                            onClick={() => setEditingField('inss13')}
                            className="flex items-center justify-center gap-1 px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title="Adicionar valor"
                          >
                            <Plus className="w-3 h-3" />
                            Adicionar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* INSS Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      021
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      INSS TOTAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Soma
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.inssTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* IRRF Mensal */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      022
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela 2025'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.irrfMensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* IRRF Férias */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      023
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela 2025'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.irrfFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* IRRF Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      024
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF TOTAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Soma
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.irrfTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* FGTS */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      025
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FGTS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : '8%'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.fgts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* FGTS Férias */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      026
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FGTS FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : '8%'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.fgtsFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* FGTS Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      027
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      FGTS TOTAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Soma
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.fgtsTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-8">
              <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
                Resumo Financeiro
              </h4>
              <div className="rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {/* Total dos Vencimentos */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Proventos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      R$ {totalProventos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total dos Proventos
                    </div>
                  </div>

                  {/* Total dos Descontos */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descontos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      R$ {totalDescontos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total dos Descontos
                    </div>
                  </div>

                  {/* Líquido a Receber */}
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <span className="text-xs font-medium text-blue-100 uppercase tracking-wide">Líquido</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      R$ {liquidoReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-blue-100">
                      Valor a Receber
                    </div>
                  </div>

                </div>
                
                {/* Segunda linha com acréscimos e líquido total */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Total dos Acréscimos */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Acréscimos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      R$ {(employee.totalAdjustments || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total dos Acréscimos
                    </div>
                  </div>

                  {/* Líquido com Acréscimos */}
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <span className="text-xs font-medium text-purple-100 uppercase tracking-wide">Líquido Total</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      R$ {liquidoComAcrescimos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-purple-100">
                      Com Acréscimos
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cards de Horas Extras */}
          <div className="mt-6">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
              Horas Extras
            </h4>
            <div className="rounded-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card H.E 50% */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">H.E 50%</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Horas extras com adicional de 50%</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total de Horas:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {(employee.he50Hours || 0).toFixed(2)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor por Hora:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border-t dark:border-gray-700 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total:</span>
                        <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                          R$ {(employee.he50Value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card H.E 100% */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                        <Moon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">H.E 100%</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Horas extras com adicional de 100%</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total de Horas:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {(employee.he100Hours || 0).toFixed(2)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor por Hora:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        R$ {(employee.hourlyRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border-t dark:border-gray-700 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total:</span>
                        <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                          R$ {(employee.he100Value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Info */}
          <div className="mt-6">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
              Informações de Presença
            </h4>
            <div className="rounded-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Total de Dias Úteis */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Úteis</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {employee.totalWorkingDays}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Dias Úteis
                  </div>
                </div>
                
                {/* Dias Trabalhados */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trabalhados</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {employee.daysWorked}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Dias Trabalhados
                  </div>
                </div>

                {/* Faltas */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Faltas</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Total de Faltas
                  </div>
                </div>

                {/* Percentual de Presença */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                    <span className="text-xs font-medium text-indigo-100 uppercase tracking-wide">Presença</span>
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">
                    {employee.totalWorkingDays ? 
                      ((employee.daysWorked / employee.totalWorkingDays) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm text-indigo-100">
                    Taxa de Presença
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Gênnesis Engenharia - Folha de Pagamento de {monthName} de {year}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
