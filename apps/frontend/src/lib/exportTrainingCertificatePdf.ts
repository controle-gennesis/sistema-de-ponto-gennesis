import jsPDF from 'jspdf';
import type { TrainingCertificateData } from '@/app/ponto/treinamentos/trainingTypes';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function formatWorkload(hours: number | null): string | null {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
  return `${label} hora${hours === 1 ? '' : 's'}`;
}

export async function exportTrainingCertificatePdf(data: TrainingCertificateData) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.setDrawColor(185, 28, 28);
  pdf.setLineWidth(1.6);
  pdf.rect(10, 10, pageW - 20, pageH - 20);
  pdf.setLineWidth(0.3);
  pdf.rect(14, 14, pageW - 28, pageH - 28);

  try {
    const logo = await loadPdfBrandingLogo({ userBrandingOnly: true, maxW: 44, maxH: 26 });
    if (logo) {
      pdf.addImage(logo.dataUrl, 'PNG', (pageW - logo.wMm) / 2, 22, logo.wMm, logo.hMm);
    }
  } catch {
    /* sem logo */
  }

  let y = 60;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(26);
  pdf.setTextColor(17, 24, 39);
  pdf.text('CERTIFICADO DE CONCLUSÃO', pageW / 2, y, { align: 'center' });

  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.text('Certificamos que', pageW / 2, y, { align: 'center' });

  y += 12;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(data.studentName, pageW / 2, y, { align: 'center' });

  if (data.studentCpf) {
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`CPF ${data.studentCpf}`, pageW / 2, y, { align: 'center' });
    pdf.setTextColor(17, 24, 39);
  }

  y += 13;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  const workload = formatWorkload(data.workloadHours);
  const detail = [
    'concluiu com aproveitamento o curso',
    workload ? `com carga horária de ${workload}` : null
  ]
    .filter(Boolean)
    .join(' ');
  pdf.text(detail, pageW / 2, y, { align: 'center' });

  y += 12;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(data.courseTitle, pageW - 70);
  pdf.text(titleLines, pageW / 2, y, { align: 'center' });
  y += titleLines.length * 7;

  if (data.score != null) {
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(`Aproveitamento final: ${data.score}%`, pageW / 2, y, { align: 'center' });
  }

  y += 10;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(
    `Concluído em ${formatDate(data.completedAt ?? data.issuedAt)}`,
    pageW / 2,
    y,
    { align: 'center' }
  );

  pdf.setFontSize(9);
  pdf.setTextColor(107, 114, 128);
  pdf.text(
    `Código de validação: ${data.code} · Emitido em ${formatDate(data.issuedAt)}`,
    pageW / 2,
    pageH - 22,
    { align: 'center' }
  );

  pdf.save(`certificado-${data.code}.pdf`);
}
