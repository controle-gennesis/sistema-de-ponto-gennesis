import { prisma } from './prisma';
import { maskCpf, onlyDigits } from './employeeCpfLookup';

export function normalizeLoginIdentifier(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

export function isEmailLoginIdentifier(raw: string): boolean {
  return raw.includes('@');
}

export async function findUserByLoginIdentifier(identifier: string) {
  const trimmed = normalizeLoginIdentifier(identifier);
  if (!trimmed) return null;

  if (isEmailLoginIdentifier(trimmed)) {
    return prisma.user.findUnique({
      where: { email: trimmed.toLowerCase() },
      include: { employee: true, empreiteiro: { select: { id: true } } },
    });
  }

  const cpfDigits = onlyDigits(trimmed);

  // CNPJ (empreiteiro): procura a conta que guarda o CNPJ como documento de login
  // e, se não houver, a conta vinculada à empreita com esse CNPJ.
  if (cpfDigits.length === 14) {
    const cnpjMasked = cpfDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    const direct = await prisma.user.findFirst({
      where: { OR: [{ cpf: cpfDigits }, { cpf: cnpjMasked }] },
      include: { employee: true, empreiteiro: { select: { id: true } } },
    });
    if (direct) return direct;
    const empreita = await prisma.empreiteiro.findFirst({
      where: { document: cpfDigits },
      select: { userId: true },
    });
    if (!empreita?.userId) return null;
    return prisma.user.findUnique({
      where: { id: empreita.userId },
      include: { employee: true, empreiteiro: { select: { id: true } } },
    });
  }

  if (cpfDigits.length !== 11) return null;

  const cpfMasked = maskCpf(cpfDigits);

  return prisma.user.findFirst({
    where: {
      OR: [{ cpf: cpfDigits }, { cpf: cpfMasked }],
    },
    include: { employee: true, empreiteiro: { select: { id: true } } },
  });
}
