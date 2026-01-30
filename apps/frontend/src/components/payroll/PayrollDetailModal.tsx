import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Calendar, User, Building, DollarSign, Clock, AlertTriangle, CreditCard, Moon, Save } from 'lucide-react';
import { PayrollEmployee } from '@/types';
import api from '@/lib/api';

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
  const [descontoPorFaltas, setDescontoPorFaltas] = useState<number | null>(null);
  const [dsrPorFalta, setDsrPorFalta] = useState<number | null>(null);
  const [horasExtrasValue, setHorasExtrasValue] = useState<number | null>(null);
  const [dsrHEValue, setDsrHEValue] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'inssRescisao' | 'inss13' | 'descontoPorFaltas' | 'dsrPorFalta' | 'horasExtras' | 'dsrHE' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Armazenar valores originais para cancelar edição
  const [originalValues, setOriginalValues] = useState({
    inssRescisao: employee.inssRescisao || 0,
    inss13: employee.inss13 || 0,
    descontoPorFaltas: employee.descontoPorFaltas !== undefined ? employee.descontoPorFaltas : null,
    dsrPorFalta: employee.dsrPorFalta !== undefined ? employee.dsrPorFalta : null,
    horasExtrasValue: null,
    dsrHEValue: null
  });

  // Atualizar estados quando o funcionário mudar
  useEffect(() => {
    const newValues = {
      inssRescisao: employee.inssRescisao || 0,
      inss13: employee.inss13 || 0,
      descontoPorFaltas: employee.descontoPorFaltas !== undefined ? employee.descontoPorFaltas : null,
      dsrPorFalta: employee.dsrPorFalta !== undefined ? employee.dsrPorFalta : null,
      horasExtrasValue: null,
      dsrHEValue: null
    };
    setOriginalValues(newValues);
    setInssRescisao(newValues.inssRescisao);
    setInss13(newValues.inss13);
    setDescontoPorFaltas(newValues.descontoPorFaltas);
    setDsrPorFalta(newValues.dsrPorFalta);
    setHorasExtrasValue(newValues.horasExtrasValue);
    setDsrHEValue(newValues.dsrHEValue);
  }, [employee]);

  // Função para cancelar edição
  const handleCancelEdit = () => {
    setInssRescisao(originalValues.inssRescisao);
    setInss13(originalValues.inss13);
    setDescontoPorFaltas(originalValues.descontoPorFaltas);
    setDsrPorFalta(originalValues.dsrPorFalta);
    setHorasExtrasValue(originalValues.horasExtrasValue);
    setDsrHEValue(originalValues.dsrHEValue);
    setEditingField(null);
  };

  // Converter polo para estado (para buscar feriados)
  const poloToState = (polo?: string | null): string | undefined => {
    if (!polo) return undefined;
    const poloUpper = polo.toUpperCase();
    if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
    if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
    return undefined;
  };

  // Buscar feriados do mês
  const employeeState = poloToState(employee.polo);
  const { data: holidaysData } = useQuery({
    queryKey: ['holidays', year, month, employeeState],
    queryFn: async () => {
      const params: any = { year };
      if (month) params.month = month;
      const res = await api.get('/holidays', { params });
      return res.data;
    },
    enabled: isOpen
  });

  const holidays = holidaysData?.data || [];

  // Buscar datas das faltas do funcionário
  const { data: absencesData } = useQuery({
    queryKey: ['absences', employee.id, year, month],
    queryFn: async () => {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      
      const res = await fetch(`${API_URL}/time-records?employeeId=${employee.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&type=ABSENCE_JUSTIFIED`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!res.ok) return { data: [] };
      const data = await res.json();
      return data;
    },
    enabled: isOpen && !!employee.id
  });

  const absenceDates = absencesData?.data?.map((record: any) => new Date(record.timestamp)) || [];
  const totalAbsences = absenceDates.length;
  
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
          inss13,
          descontoPorFaltas: descontoPorFaltas !== null ? descontoPorFaltas : undefined,
          dsrPorFalta: dsrPorFalta !== null ? dsrPorFalta : undefined,
          horasExtrasValue: horasExtrasValue !== null ? horasExtrasValue : undefined,
          dsrHEValue: dsrHEValue !== null ? dsrHEValue : undefined
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
          const newValues = {
            inssRescisao: updatedEmployeeData.data.inssRescisao || 0,
            inss13: updatedEmployeeData.data.inss13 || 0,
            descontoPorFaltas: updatedEmployeeData.data.descontoPorFaltas !== undefined ? updatedEmployeeData.data.descontoPorFaltas : null,
            dsrPorFalta: updatedEmployeeData.data.dsrPorFalta !== undefined ? updatedEmployeeData.data.dsrPorFalta : null,
            horasExtrasValue: updatedEmployeeData.data.horasExtrasValue !== undefined ? updatedEmployeeData.data.horasExtrasValue : null,
            dsrHEValue: updatedEmployeeData.data.dsrHEValue !== undefined ? updatedEmployeeData.data.dsrHEValue : null
          };
          
          setInssRescisao(newValues.inssRescisao);
          setInss13(newValues.inss13);
          setDescontoPorFaltas(newValues.descontoPorFaltas);
          setDsrPorFalta(newValues.dsrPorFalta);
          setHorasExtrasValue(newValues.horasExtrasValue);
          setDsrHEValue(newValues.dsrHEValue);
          
          // Atualizar valores originais para o próximo cancelamento
          setOriginalValues(newValues);
          
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
  // Usar absences do backend (sempre 0 para ausências justificadas) ao invés de calcular pela diferença
  // O backend já retorna absences: 0 quando há apenas ausências justificadas (folgas)
  const faltas = employee.absences !== undefined ? employee.absences : 0;
  
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
  
  // Calcular desconto por faltas (usar valor manual se existir)
  // Usar a mesma fórmula do backend: (salarioBase + periculosidade + insalubridade) / diasParaDesconto * faltas
  const descontoPorFaltasCalculado = diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
  const descontoPorFaltasFinal = (descontoPorFaltas !== null && descontoPorFaltas !== undefined) ? Number(descontoPorFaltas) : descontoPorFaltasCalculado;
  
  // Debug: verificar valores
  if (faltas > 0) {
    console.log('🔍 Debug DSR por Falta:', {
      salarioBase,
      faltas,
      descontoPorFaltas: (descontoPorFaltasFinal || 0).toFixed(2),
      calculo: `(${salarioBase} / 30) * ${faltas} = ${(descontoPorFaltasFinal || 0).toFixed(2)}`
    });
  }
  
  // Desconto de Periculosidade + Insalubridade por faltas
  const descontoPericInsalub = ((periculosidade + insalubridade) / 30) * faltas;
  
  // Cálculo do DSR por Falta considerando feriados
  // Nova lógica:
  // - Se faltar em uma semana que tem feriado, perde: 1 DSR pela falta + 1 DSR por cada feriado daquela semana
  // - Exemplo: 1 falta em semana com 2 feriados = 1 DSR (falta) + 2 DSR (feriados) = 3 DSR
  // - Exemplo: 2 faltas em semanas diferentes, uma com 1 feriado = 1 DSR (falta semana 1) + 1 DSR (feriado semana 1) + 1 DSR (falta semana 2) = 3 DSR
  let dsrPorFaltaCalculado = 0;
  let referenciaDSR = '';
  
  if (faltas > 0) {
    // Verificar quantos feriados úteis há no mês (segunda a sábado)
    const feriadosUteis = holidays.filter((holiday: any) => {
      const holidayDate = new Date(holiday.date);
      const dayOfWeek = holidayDate.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 6; // Segunda a sábado
    });

    // Função para obter o início da semana (domingo) de uma data
    const getWeekStart = (date: Date): Date => {
      const dateCopy = new Date(date);
      const dayOfWeek = dateCopy.getDay();
      const weekStart = new Date(dateCopy);
      weekStart.setDate(dateCopy.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    };

    // Se temos as datas das faltas, calcular DSR por semana com falta
    if (absenceDates.length > 0 && absenceDates.length === faltas) {
      // Agrupar faltas por semana
      const semanasComFaltas = new Map<string, number>(); // semana -> quantidade de faltas
      absenceDates.forEach((absenceDate: Date) => {
        const weekStart = getWeekStart(absenceDate);
        const weekKey = weekStart.toISOString();
        semanasComFaltas.set(weekKey, (semanasComFaltas.get(weekKey) || 0) + 1);
      });

      let totalDSR = 0;
      const detalhesSemanas: string[] = [];

      // Para cada semana com falta, calcular DSR
      semanasComFaltas.forEach((numFaltasNaSemana, weekKey) => {
        const weekStart = new Date(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Fim da semana (sábado)

        // Contar quantos feriados estão nesta semana específica
        const feriadosNaSemana = feriadosUteis.filter((holiday: any) => {
          const holidayDate = new Date(holiday.date);
          return holidayDate >= weekStart && holidayDate <= weekEnd;
        }).length;

        // DSR = 1 pela semana (independente de quantas faltas) + 1 por cada feriado da semana
        // Exemplo: 2 faltas na mesma semana + 1 feriado = 1 DSR (semana) + 1 DSR (feriado) = 2 DSR
        // Exemplo: 1 falta semana 1 (com 1 feriado) + 1 falta semana 2 = 1 DSR (semana 1) + 1 DSR (feriado semana 1) + 1 DSR (semana 2) = 3 DSR
        const dsrDaSemana = 1 + feriadosNaSemana;
        totalDSR += dsrDaSemana;

        // Montar detalhe para exibição
        if (feriadosNaSemana > 0) {
          detalhesSemanas.push(`${numFaltasNaSemana} falta(s) na semana + ${feriadosNaSemana} feriado(s) (${dsrDaSemana} DSR)`);
        } else {
          detalhesSemanas.push(`${numFaltasNaSemana} falta(s) na semana (1 DSR)`);
        }
      });

      dsrPorFaltaCalculado = (salarioBase / 30) * totalDSR;
      referenciaDSR = detalhesSemanas.join(' | ');
    } else {
      // Fallback: se não temos as datas exatas, assumir que estão em semanas diferentes
      // Contar todos os feriados do mês
      const quantidadeFeriados = feriadosUteis.length;
      // 1 DSR por falta + 1 DSR por cada feriado (assumindo que pode estar na mesma semana)
      const totalDSR = faltas + quantidadeFeriados;
      dsrPorFaltaCalculado = (salarioBase / 30) * totalDSR;

      if (quantidadeFeriados === 0) {
        referenciaDSR = `${faltas} falta(s) - Sem feriado no mês (1 DSR por falta)`;
      } else {
        referenciaDSR = `${faltas} falta(s) + ${quantidadeFeriados} feriado(s) no mês`;
      }
    }
  } else {
    referenciaDSR = '-';
  }
  
  // Usar valor manual de DSR se existir, senão usar o calculado
  const dsrPorFaltaFinal = (dsrPorFalta !== null && dsrPorFalta !== undefined) ? Number(dsrPorFalta) : dsrPorFaltaCalculado;
  
  // Cálculos de %VA e %VT baseados no polo
  // VA%: Se não for MEI, então (25,2 × dias úteis do próximo mês) × 0,09
  // VA/VT são correspondentes ao próximo mês
  const nextMonthWorkingDays = employee.nextMonthWorkingDays || employee.totalWorkingDays || 0;
  const percentualVA = employee.modality !== 'MEI' ? (25.2 * nextMonthWorkingDays) * 0.09 : 0;
  const percentualVT = employee.polo === 'GOIÁS' ? salarioBase * 0.06 : 0;
  
  // Cálculo do DSR H.E (Descanso Semanal Remunerado sobre Horas Extras)
  const totalHorasExtras = (employee.he50Hours || 0) + (employee.he100Hours || 0);
  const diasUteis = employee.totalWorkingDays || 0; // Segunda a Sábado
  const diasNaoUteis = diasDoMes - diasUteis; // Domingo + feriados
  const dsrHECalculado = diasUteis > 0 ? (totalHorasExtras / diasUteis) * diasNaoUteis : 0;
  
  // Usar valor manual de DSR HE se existir, senão usar o calculado
  const dsrHE = (dsrHEValue !== null && dsrHEValue !== undefined) ? Number(dsrHEValue) : dsrHECalculado;
  
  // Cálculo do valor do DSR H.E considerando as diferentes taxas
  // he50Hours e he100Hours já vêm multiplicados do backend
  const valorDSRHECalculado = diasUteis > 0 ? 
    ((employee.he50Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0) +  // DSR sobre HE 50% (já multiplicado)
    ((employee.he100Hours || 0) / diasUteis) * diasNaoUteis * (employee.hourlyRate || 0)   // DSR sobre HE 100% (já multiplicado)
    : 0;
  
  // Usar valor manual se existir, senão usar o calculado
  const valorDSRHE = (dsrHEValue !== null && dsrHEValue !== undefined) 
    ? (dsrHEValue * (employee.hourlyRate || 0))
    : valorDSRHECalculado;
  
  // Cálculo da BASE INSS MENSAL
  // Usar valor manual de horas extras se existir, senão usar o calculado
  const valorHorasExtras = (horasExtrasValue !== null && horasExtrasValue !== undefined) 
    ? Number(horasExtrasValue) 
    : ((employee.he50Value || 0) + (employee.he100Value || 0));
  const baseINSSMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
    ? 0 
    : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltasFinal - dsrPorFaltaFinal);
  
  // Cálculo do INSS MENSAL (Tabela Progressiva)
  const calcularINSS = (baseINSS: number): number => {
    if (baseINSS <= 0) return 0;

    // Tabela progressiva (alinhada com a planilha do cliente)
    const faixa1 = 1621.0;
    const faixa2 = 2902.84;
    const faixa3 = 4354.27;
    const teto = 8475.55;

    const base = Math.min(baseINSS, teto);

    if (base <= faixa1) {
      return base * 0.075;
    }
    if (base <= faixa2) {
      return (faixa1 * 0.075) + ((base - faixa1) * 0.09);
    }
    if (base <= faixa3) {
      return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((base - faixa2) * 0.12);
    }
    return (faixa1 * 0.075) + ((faixa2 - faixa1) * 0.09) + ((faixa3 - faixa2) * 0.12) + ((base - faixa3) * 0.14);
  };
  
  const inssMensal = calcularINSS(baseINSSMensal);
  const irrfMensal = employee.irrfMensal || 0;
  
  // Cálculo do DCTFWEB: (INSS Total + IRRF Total) - Salário Família
  const dctfweb = ((employee.inssTotal || 0) + (employee.irrfTotal || 0)) - salarioFamilia;
  
  const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + (employee.totalTransportVoucher || 0);
  const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltasFinal + dsrPorFaltaFinal + percentualVA + percentualVT + inssMensal + irrfMensal;
  const liquidoReceber = totalProventos - totalDescontos;
  
  // Cálculo com acréscimos
  const totalProventosComAcrescimos = totalProventos + (employee.totalAdjustments || 0);
  const liquidoComAcrescimos = liquidoReceber + (employee.totalAdjustments || 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2">
                <img 
                  src="/logopv.png" 
                  alt="Logo da Empresa" 
                  className="w-12 h-12 object-contain dark:hidden"
                />
                <img 
                  src="/logobranca.png" 
                  alt="Logo da Empresa" 
                  className="w-12 h-12 object-contain hidden dark:block"
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

                  {/* Periculosidade + Insalubridade */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      002
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      PERICULOSIDADE + INSALUBRIDADE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.dangerPay || 0}% / {employee.unhealthyPay || 0}%
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700">
                      R$ {Math.max(0, (periculosidade + insalubridade) - descontoPericInsalub).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                      {descontoPericInsalub > 0 ? (
                        <>R$ {descontoPericInsalub.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                      ) : (
                        <>-</>
                      )}
                    </td>
                  </tr>

                  {/* Salário Família */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      003
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
                      004
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

                  {/* Vale Alimentação */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      005
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VALE ALIMENTAÇÃO
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help underline decoration-dotted">
                          {Math.max(0, nextMonthWorkingDays - totalAbsences - faltas)} dias
                        </span>
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo de VA/VT:</div>
                            <div className="space-y-1">
                              <div>📅 Dias úteis (próximo mês): <span className="font-bold text-green-400">{nextMonthWorkingDays}</span></div>
                              <div>❌ Faltas (mês atual): <span className="font-bold text-red-400">{faltas || 0}</span></div>
                              <div>🏥 Ausências (mês atual): <span className="font-bold text-yellow-400">{totalAbsences || 0}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Total: <span className="font-bold text-green-400">{nextMonthWorkingDays} - {faltas || 0} - {totalAbsences || 0} = {Math.max(0, nextMonthWorkingDays - totalAbsences - faltas)} dias</span></div>
                              </div>
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
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
                      006
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VALE TRANSPORTE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="relative group inline-block">
                        <span className="cursor-help underline decoration-dotted">
                          {Math.max(0, nextMonthWorkingDays - totalAbsences - faltas)} dias
                        </span>
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                          <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
                            <div className="font-semibold mb-2 text-yellow-400">Cálculo de VA/VT:</div>
                            <div className="space-y-1">
                              <div>📅 Dias úteis (próximo mês): <span className="font-bold text-green-400">{nextMonthWorkingDays}</span></div>
                              <div>❌ Faltas (mês atual): <span className="font-bold text-red-400">{faltas || 0}</span></div>
                              <div>🏥 Ausências (mês atual): <span className="font-bold text-yellow-400">{totalAbsences || 0}</span></div>
                              <div className="border-t border-gray-700 mt-2 pt-2">
                                <div>✅ Total: <span className="font-bold text-green-400">{nextMonthWorkingDays} - {faltas || 0} - {totalAbsences || 0} = {Math.max(0, nextMonthWorkingDays - totalAbsences - faltas)} dias</span></div>
                              </div>
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>
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
                      007
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      HORAS EXTRAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {((employee.he50Hours || 0) + (employee.he100Hours || 0)).toFixed(2)}h
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('horasExtras')}
                      title="Clique para editar"
                    >
                      {editingField === 'horasExtras' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={horasExtrasValue === null || horasExtrasValue === 0 ? '' : horasExtrasValue.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setHorasExtrasValue(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span>
                          R$ {valorHorasExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* DSR H.E */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      008
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DSR POR HORAS EXTRAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {dsrHE.toFixed(2)}h
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('dsrHE')}
                      title="Clique para editar"
                    >
                      {editingField === 'dsrHE' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={dsrHEValue === null || dsrHEValue === 0 ? '' : dsrHEValue.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setDsrHEValue(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span>
                          R$ {valorDSRHE.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500">
                      -
                    </td>
                  </tr>

                  {/* Seção: Outros Descontos */}
                  <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-200 dark:border-blue-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wide">
                        OUTROS DESCONTOS
                      </h4>
                    </td>
                  </tr>

                  {/* Descontos */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      009
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
                      010
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
                    <td 
                      className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('descontoPorFaltas')}
                      title="Clique para editar"
                    >
                      {editingField === 'descontoPorFaltas' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={descontoPorFaltas === null || descontoPorFaltas === 0 ? '' : descontoPorFaltas.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setDescontoPorFaltas(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span>
                          R$ {descontoPorFaltasFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* DSR por Falta */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      011
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      DSR POR FALTA
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col items-center">
                        <span className="font-medium">{faltas || 0} falta(s)</span>
                        {referenciaDSR && referenciaDSR !== '-' && (
                          <span className="text-xs mt-1 text-gray-500 dark:text-gray-400">{referenciaDSR}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td 
                      className="px-6 py-4 text-right text-sm font-semibold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('dsrPorFalta')}
                      title="Clique para editar"
                    >
                      {editingField === 'dsrPorFalta' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={dsrPorFalta === null || dsrPorFalta === 0 ? '' : dsrPorFalta.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setDsrPorFalta(value ? parseFloat(value.replace(',', '.')) : null);
                            }}
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span>
                          R$ {dsrPorFaltaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* %VA - Desconto de 9% do VA para funcionários de BRASÍLIA */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      012
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      VA%
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality !== 'MEI' ? `(25,2 × ${nextMonthWorkingDays} dias) × 9%` : 'Não aplicável'}
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
                      013
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

                  {/* Seção: INSS */}
                  <tr className="bg-orange-50 dark:bg-orange-900/20 border-t-2 border-orange-200 dark:border-orange-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-orange-900 dark:text-orange-300 uppercase tracking-wide">
                        INSS (INSTITUTO NACIONAL DO SEGURO SOCIAL)
                      </h4>
                    </td>
                  </tr>

                  {/* BASE INSS MENSAL */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      014
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
                      015
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
                      016
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
                      017
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
                      018
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
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('inssRescisao')}
                      title="Clique para editar"
                    >
                      {editingField === 'inssRescisao' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={inssRescisao === 0 ? '' : inssRescisao.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setInssRescisao(parseFloat(value.replace(',', '.')) || 0);
                            }}
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span>
                          {inssRescisao > 0 
                            ? `R$ ${inssRescisao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : 'R$ 0,00'
                          }
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* INSS 13° */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      019
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
                    <td 
                      className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setEditingField('inss13')}
                      title="Clique para editar"
                    >
                      {editingField === 'inss13' ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={inss13 === 0 ? '' : inss13.toString()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setInss13(parseFloat(value.replace(',', '.')) || 0);
                            }}
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveManualValues();
                            }}
                            disabled={isSaving}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-500 disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            disabled={isSaving}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span>
                          {inss13 > 0 
                            ? `R$ ${inss13.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : 'R$ 0,00'
                          }
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* INSS Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-orange-50/50 dark:bg-orange-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      020
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-orange-900 dark:text-orange-300 border-r border-gray-200 dark:border-gray-700">
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

                  {/* Seção: IRRF */}
                  <tr className="bg-purple-50 dark:bg-purple-900/20 border-t-2 border-purple-200 dark:border-purple-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wide">
                        IRRF (IMPOSTO DE RENDA RETIDO NA FONTE)
                      </h4>
                    </td>
                  </tr>

                  {/* IRRF Mensal */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      021
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF MENSAL
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela 2026'}
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
                      022
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      IRRF FÉRIAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      {employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' ? 'Não aplicável' : 'Tabela 2026'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {(employee.irrfFerias || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* IRRF Total */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-purple-50/50 dark:bg-purple-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      023
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-purple-900 dark:text-purple-300 border-r border-gray-200 dark:border-gray-700">
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

                  {/* DCTFWEB */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-indigo-50/50 dark:bg-indigo-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      024
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-indigo-900 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700">
                      DCTFWEB
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                      Cálculo
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-red-700 dark:text-red-400">
                      R$ {Math.max(0, dctfweb).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Seção: FGTS */}
                  <tr className="bg-green-50 dark:bg-green-900/20 border-t-2 border-green-200 dark:border-green-800">
                    <td colSpan={5} className="px-6 py-3">
                      <h4 className="text-sm font-bold text-green-900 dark:text-green-300 uppercase tracking-wide">
                        FGTS (FUNDO DE GARANTIA DO TEMPO DE SERVIÇO)
                      </h4>
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
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 bg-green-50/50 dark:bg-green-900/10">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                      027
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-green-900 dark:text-green-300 border-r border-gray-200 dark:border-gray-700">
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
                
                {/* Dias Trabalhados do Mês Atual */}
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
                    {faltas || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Total de Faltas
                  </div>
                </div>

                {/* Ausências */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ausências</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {totalAbsences || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Ausências Justificadas
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
