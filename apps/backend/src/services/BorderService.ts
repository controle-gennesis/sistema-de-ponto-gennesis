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
      // Calcular valor total a ser pago (salário + ajustes - descontos)
      const totalAmount = (employee.salary || 0) + 
                         (employee.totalAdjustments || 0) - 
                         (employee.totalDiscounts || 0) +
                         (employee.totalFoodVoucher || 0) +
                         (employee.totalTransportVoucher || 0) +
                         (employee.he50Value || 0) +
                         (employee.he100Value || 0);

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
}
