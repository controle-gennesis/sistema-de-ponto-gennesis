// @ts-ignore - pdfkit types may not be fully compatible
import PDFDocument from 'pdfkit';
import moment from 'moment';
import { PayrollService, PayrollFilters } from './PayrollService';
import { PayrollStatusService } from './PayrollStatusService';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const payrollService = new PayrollService();
const payrollStatusService = new PayrollStatusService();

export interface BorderData {
  date: string;
  name: string;
  amount: number;
  bank: string | null;
  accountType: string | null;
  agency: string | null;
  operation: string | null;
  account: string | null;
  digit: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  cpf: string;
}

export class BorderService {
  /**
   * Gera dados do borderô de pagamento
   */
  async generateBorderData(filters: PayrollFilters): Promise<BorderData[]> {
    // Verificar se a folha está finalizada
    const isFinalized = await payrollStatusService.isPayrollFinalized(filters.month, filters.year);
    if (!isFinalized) {
      throw createError('A folha de pagamento ainda não foi finalizada pelo Departamento Pessoal', 403);
    }

    const payrollData = await payrollService.generateMonthlyPayroll(filters);
    
    const borderData: BorderData[] = payrollData.employees.map(employee => {
      // Calcular valor líquido a ser pago (mesma lógica do frontend)
      // Proventos: salário base + salário família + insalubridade + periculosidade + horas extras + DSR HE + VT
      const salarioBase = employee.salary || 0;
      const salarioFamilia = employee.familySalary || 0;
      const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
      const periculosidade = employee.dangerPay ? (salarioBase * (employee.dangerPay / 100)) : 0;
      
      // Horas extras: usar valor manual se disponível, senão calcular
      const valorHorasExtras = employee.horasExtrasValue !== undefined && employee.horasExtrasValue !== null
        ? employee.horasExtrasValue
        : (employee.he50Value || 0) + (employee.he100Value || 0);
      
      // DSR HE: usar valor manual se disponível (multiplicado pela taxa horária), senão calcular
      // Se dsrHEValue for fornecido, ele é em horas, então multiplica pela taxa horária
      const valorDSRHE = employee.dsrHEValue !== undefined && employee.dsrHEValue !== null
        ? (employee.dsrHEValue * (employee.hourlyRate || 0))
        : (employee.totalWorkingDays > 0 && employee.daysWorked > 0
          ? (valorHorasExtras / employee.totalWorkingDays) * (employee.totalWorkingDays - employee.daysWorked)
          : 0);
      
      const totalVT = employee.totalTransportVoucher || 0;
      
      const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + totalVT;
      
      // Descontos: descontos manuais + desconto por faltas + DSR por falta + VA + VT + INSS + IRRF
      const descontoPorFaltas = employee.descontoPorFaltas || 0;
      const dsrPorFalta = employee.dsrPorFalta || 0;
      const percentualVA = employee.totalFoodVoucher || 0; // VA já vem como valor total
      const percentualVT = 0; // VT já está nos proventos
      const inssMensal = employee.inssTotal || 0;
      const irrfMensal = employee.irrfMensal || 0;
      
      const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFalta + percentualVA + percentualVT + inssMensal + irrfMensal;
      
      // Líquido = Proventos - Descontos + Ajustes
      const liquidoReceber = totalProventos - totalDescontos;
      const totalAmount = liquidoReceber + (employee.totalAdjustments || 0);

      return {
        date: moment().format('DD/MM/YYYY'),
        name: employee.name,
        amount: totalAmount,
        bank: employee.bank,
        accountType: employee.accountType,
        agency: employee.agency,
        operation: employee.operation,
        account: employee.account,
        digit: employee.digit,
        pixKeyType: employee.pixKeyType,
        pixKey: employee.pixKey,
        cpf: employee.cpf
      };
    });

    return borderData;
  }

  /**
   * Gera PDF do borderô de pagamento
   */
  async generateBorderPDF(filters: PayrollFilters): Promise<Buffer> {
    const borderData = await this.generateBorderData(filters);
    
    // Buscar configurações da empresa antes de criar o PDF
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: 'default' }
    });
    
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Cabeçalho
        doc.fontSize(18).font('Helvetica-Bold')
          .text('BORDERÔ DE PAGAMENTO', { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica')
          .text(`Período: ${moment({ year: filters.year, month: filters.month - 1 }).format('MM/YYYY')}`, { align: 'center' });
        
        if (filters.company) {
          doc.text(`Empresa: ${filters.company}`, { align: 'center' });
        }
        if (filters.costCenter) {
          doc.text(`Centro de Custo: ${filters.costCenter}`, { align: 'center' });
        }

        doc.moveDown(1);

        // Informações da empresa
        if (companySettings) {
          doc.fontSize(10).font('Helvetica')
            .text(`Empresa: ${companySettings.name}`, { align: 'left' })
            .text(`CNPJ: ${companySettings.cnpj}`, { align: 'left' })
            .text(`Endereço: ${companySettings.address}`, { align: 'left' });
          doc.moveDown(0.5);
        }

        // Data de emissão
        doc.fontSize(10).font('Helvetica')
          .text(`Data de Emissão: ${moment().format('DD/MM/YYYY HH:mm')}`, { align: 'right' });
        
        doc.moveDown(1);

        // Tabela
        const tableTop = doc.y;
        const itemHeight = 25;
        const pageHeight = 750;
        let currentY = tableTop;

        // Cabeçalho da tabela
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Data', 50, currentY, { width: 60, align: 'left' });
        doc.text('Nome', 120, currentY, { width: 150, align: 'left' });
        doc.text('Valor (R$)', 280, currentY, { width: 80, align: 'right' });
        doc.text('Banco', 370, currentY, { width: 80, align: 'left' });
        doc.text('Agência', 460, currentY, { width: 60, align: 'left' });
        doc.text('Conta', 530, currentY, { width: 60, align: 'left' });

        // Linha separadora
        currentY += 15;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 5;

        // Dados
        doc.fontSize(8).font('Helvetica');
        let totalAmount = 0;

        borderData.forEach((item, index) => {
          // Verificar se precisa de nova página
          if (currentY > pageHeight) {
            doc.addPage();
            currentY = 50;
            
            // Redesenhar cabeçalho
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Data', 50, currentY, { width: 60, align: 'left' });
            doc.text('Nome', 120, currentY, { width: 150, align: 'left' });
            doc.text('Valor (R$)', 280, currentY, { width: 80, align: 'right' });
            doc.text('Banco', 370, currentY, { width: 80, align: 'left' });
            doc.text('Agência', 460, currentY, { width: 60, align: 'left' });
            doc.text('Conta', 530, currentY, { width: 60, align: 'left' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
            currentY += 5;
            doc.fontSize(8).font('Helvetica');
          }

          totalAmount += item.amount;

          // Dados bancários formatados
          const bankInfo = item.bank || '-';
          const agencyInfo = item.agency || '-';
          const accountInfo = item.account ? `${item.account}${item.digit ? '-' + item.digit : ''}` : '-';

          doc.text(item.date, 50, currentY, { width: 60, align: 'left' });
          doc.text(item.name.substring(0, 25), 120, currentY, { width: 150, align: 'left' });
          doc.text(item.amount.toFixed(2).replace('.', ','), 280, currentY, { width: 80, align: 'right' });
          doc.text(bankInfo.substring(0, 15), 370, currentY, { width: 80, align: 'left' });
          doc.text(agencyInfo.substring(0, 10), 460, currentY, { width: 60, align: 'left' });
          doc.text(accountInfo.substring(0, 15), 530, currentY, { width: 60, align: 'left' });

          currentY += itemHeight;
        });

        // Total
        currentY += 10;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 10;
        
        doc.fontSize(10).font('Helvetica-Bold')
          .text(`TOTAL: R$ ${totalAmount.toFixed(2).replace('.', ',')}`, 280, currentY, { width: 270, align: 'right' });

        // Página adicional com dados bancários detalhados
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold')
          .text('DADOS BANCÁRIOS DETALHADOS', { align: 'center' });
        doc.moveDown(1);

        currentY = 100;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
        doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
        doc.text('Banco', 320, currentY, { width: 80, align: 'left' });
        doc.text('Tipo Conta', 410, currentY, { width: 80, align: 'left' });
        doc.text('Agência', 500, currentY, { width: 50, align: 'left' });

        currentY += 15;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 5;

        doc.fontSize(8).font('Helvetica');
        borderData.forEach((item) => {
          if (currentY > pageHeight) {
            doc.addPage();
            currentY = 50;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
            doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
            doc.text('Banco', 320, currentY, { width: 80, align: 'left' });
            doc.text('Tipo Conta', 410, currentY, { width: 80, align: 'left' });
            doc.text('Agência', 500, currentY, { width: 50, align: 'left' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
            currentY += 5;
            doc.fontSize(8).font('Helvetica');
          }

          doc.text(item.name.substring(0, 20), 50, currentY, { width: 150, align: 'left' });
          doc.text(item.cpf, 210, currentY, { width: 100, align: 'left' });
          doc.text((item.bank || '-').substring(0, 12), 320, currentY, { width: 80, align: 'left' });
          doc.text((item.accountType || '-').substring(0, 12), 410, currentY, { width: 80, align: 'left' });
          doc.text((item.agency || '-').substring(0, 10), 500, currentY, { width: 50, align: 'left' });

          currentY += 20;
        });

        // Página com dados PIX
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold')
          .text('DADOS PIX', { align: 'center' });
        doc.moveDown(1);

        currentY = 100;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
        doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
        doc.text('Tipo Chave', 320, currentY, { width: 100, align: 'left' });
        doc.text('Chave PIX', 430, currentY, { width: 120, align: 'left' });

        currentY += 15;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 5;

        doc.fontSize(8).font('Helvetica');
        borderData.forEach((item) => {
          if (currentY > pageHeight) {
            doc.addPage();
            currentY = 50;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
            doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
            doc.text('Tipo Chave', 320, currentY, { width: 100, align: 'left' });
            doc.text('Chave PIX', 430, currentY, { width: 120, align: 'left' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
            currentY += 5;
            doc.fontSize(8).font('Helvetica');
          }

          if (item.pixKey) {
            doc.text(item.name.substring(0, 20), 50, currentY, { width: 150, align: 'left' });
            doc.text(item.cpf, 210, currentY, { width: 100, align: 'left' });
            doc.text((item.pixKeyType || '-').substring(0, 15), 320, currentY, { width: 100, align: 'left' });
            doc.text((item.pixKey || '-').substring(0, 30), 430, currentY, { width: 120, align: 'left' });
            currentY += 20;
          }
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Gera arquivo CNAB400 (formato Itaú) para transferências bancárias
   */
  async generateCNAB400(filters: PayrollFilters): Promise<string> {
    const borderData = await this.generateBorderData(filters);
    
    // Buscar configurações da empresa
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: 'default' }
    });

    if (!companySettings) {
      throw createError('Configurações da empresa não encontradas', 404);
    }

    const lines: string[] = [];
    const currentDate = moment();
    const paymentDate = moment({ year: filters.year, month: filters.month - 1 }).endOf('month');
    
    // Formatar valores para CNAB400
    const formatNumber = (value: number, length: number, decimals: number = 2): string => {
      const intValue = Math.round(value * Math.pow(10, decimals));
      return intValue.toString().padStart(length, '0');
    };

    const formatText = (text: string, length: number): string => {
      return (text || '').substring(0, length).padEnd(length, ' ');
    };

    const formatDate = (date: moment.Moment): string => {
      return date.format('DDMMYY');
    };

    // Remover caracteres especiais do CPF/CNPJ
    const cleanDocument = (doc: string): string => {
      return (doc || '').replace(/[^0-9]/g, '');
    };

    // Header do arquivo (Registro 0) - 400 caracteres
    const cnpj = cleanDocument(companySettings.cnpj || '');
    const header = 
      '0' + // Tipo de registro (1)
      '1' + // Operação (1 = Remessa) (1)
      formatText('REMESSA', 7) + // Literal remessa (7)
      '01' + // Código do serviço (2)
      formatText(companySettings.name || 'EMPRESA', 15) + // Nome da empresa (15)
      '341' + // Código do banco Itaú (3)
      formatText('ITAU', 15) + // Nome do banco (15)
      formatDate(currentDate) + // Data de geração (6)
      ' ' + // Branco (1)
      formatText('', 8) + // Identificação da empresa (8)
      formatText(cnpj, 14) + // CNPJ da empresa (14)
      formatText('', 20) + // Branco (20)
      '0001' + // Agência (4)
      '00' + // Dígito da agência (2)
      formatText('', 5) + // Conta (5)
      formatText('', 1) + // Dígito da conta (1)
      formatText('', 8) + // Branco (8)
      formatText('', 7) + // Branco (7)
      '000001'; // Número sequencial (6)
    
    // Garantir que o header tenha exatamente 400 caracteres
    const headerPadded = header.padEnd(400, ' ');
    lines.push(headerPadded);

    // Detalhes (Registro 1) - um para cada pagamento
    let sequence = 2;
    borderData.forEach((item, index) => {
      if (!item.bank || !item.agency || !item.account) {
        return; // Pular funcionários sem dados bancários completos
      }

      const cpf = cleanDocument(item.cpf);
      const amount = formatNumber(item.amount, 13, 2);
      const agency = item.agency.replace(/[^0-9]/g, '').padStart(5, '0');
      const account = item.account.replace(/[^0-9]/g, '').padStart(12, '0');
      const accountDigit = item.digit || '0';
      const name = item.name.substring(0, 30).toUpperCase();

      // Detalhe (Registro 1) - 400 caracteres
      // Formato simplificado para transferência de salário
      const detail = 
        '1' + // Tipo de registro (1)
        formatText('', 16) + // Branco (16)
        '000' + // Agência debitada (3)
        '00' + // Dígito da agência debitada (2)
        formatText('', 5) + // Conta debitada (5)
        formatText('', 1) + // Dígito da conta debitada (1)
        formatText('', 5) + // Branco (5)
        '000' + // Carteira (3)
        '000' + // Agência/Código do cedente (3)
        formatText('', 5) + // Conta corrente (5)
        formatText('', 1) + // Dígito da conta (1)
        '00000000000000000000' + // Nosso número (20)
        formatDate(paymentDate) + // Data de vencimento (6)
        amount + // Valor do título (13)
        '341' + // Código do banco Itaú (3)
        '00000' + // Agência depositária (5)
        '01' + // Espécie (2 = Duplicata) (2)
        'N' + // Aceite (1)
        formatDate(paymentDate) + // Data de emissão (6)
        '06' + // Instrução 1 - Crédito em conta corrente (2)
        '00' + // Instrução 2 (2)
        formatNumber(0, 13, 2) + // Valor a ser cobrado por dia de atraso (13)
        formatDate(paymentDate) + // Data limite para desconto (6)
        formatNumber(0, 13, 2) + // Valor do desconto (13)
        formatNumber(0, 13, 2) + // Valor do IOF (13)
        formatNumber(0, 13, 2) + // Valor do abatimento (13)
        formatText(cpf, 14) + // CPF/CNPJ do pagador (14)
        formatText(name, 40) + // Nome do pagador (40)
        formatText('', 40) + // Endereço do pagador (40)
        formatText('', 12) + // Bairro do pagador (12)
        formatText('00000000', 8) + // CEP (8)
        formatText('', 15) + // Cidade do pagador (15)
        formatText('', 2) + // UF do pagador (2)
        formatText('', 40) + // Observações (40)
        '00000000' + // Número de dias para protesto (8)
        ' ' + // Branco (1)
        sequence.toString().padStart(6, '0'); // Número sequencial (6)

      // Garantir que o detalhe tenha exatamente 400 caracteres
      const detailPadded = detail.padEnd(400, ' ');
      lines.push(detailPadded);
      sequence++;
    });

    // Trailer do arquivo (Registro 9) - 400 caracteres
    const totalAmount = borderData.filter(item => item.bank && item.agency && item.account)
      .reduce((sum, item) => sum + item.amount, 0);
    const totalRecords = lines.length + 1; // +1 para incluir o trailer

    const trailer = 
      '9' + // Tipo de registro (1)
      formatText('', 393) + // Branco (393)
      totalRecords.toString().padStart(6, '0'); // Total de registros (6)

    // Garantir que o trailer tenha exatamente 400 caracteres
    const trailerPadded = trailer.padEnd(400, ' ');
    lines.push(trailerPadded);

    return lines.join('\r\n');
  }
}
