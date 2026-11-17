/**
 * Cria (ou atualiza) um login de empreiteiro para testes locais e o cadastro de empreita vinculado a ele.
 * Pode rodar mais de uma vez: não duplica nada.
 *
 * Execute: npx tsx scripts/criar-empreiteiro-teste.ts
 */

import 'dotenv/config';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from '../src/lib/prisma';
import { BCRYPT_ROUNDS, hashPassword } from '../src/lib/passwordHash';

const EMAIL = 'empreiteiro.teste@loadtest.com';
// Mesma senha dos demais usuários de teste do projeto (scripts/criar-usuarios-teste.ts).
const PASSWORD = 'Teste123!';

const USER_CPF = '900.100.001-01';
const EMPREITA_CPF = '90010000101';
const EMPREITA_CNPJ = '90100000000101';

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password: passwordHash, isActive: true, isFirstLogin: false },
    create: {
      email: EMAIL,
      password: passwordHash,
      name: 'Empreiteiro Teste',
      cpf: USER_CPF,
      role: 'EMPLOYEE',
      isActive: true,
      isFirstLogin: false,
    },
    select: { id: true, email: true },
  });

  const empreiteiro = await prisma.empreiteiro.upsert({
    where: { userId: user.id },
    update: { isActive: true },
    create: {
      name: 'EMPREITEIRO TESTE LTDA',
      tradeName: 'Empreiteiro Teste',
      documentKind: 'CNPJ',
      document: EMPREITA_CNPJ,
      cpf: EMPREITA_CPF,
      phone: '61999990000',
      specialty: 'Alvenaria / Civil',
      email: EMAIL,
      city: 'Brasília',
      state: 'DF',
      isActive: true,
      userId: user.id,
    },
    select: { id: true, name: true },
  });

  // Acesso ao módulo Empreitas (o mesmo que o cadastro normal concede ao vincular o login).
  const module = pathToModuleKey('/ponto/empreiteiros');
  await prisma.userPermission.upsert({
    where: { userId_module_action: { userId: user.id, module, action: PERMISSION_ACCESS_ACTION } },
    update: { allowed: true },
    create: { userId: user.id, module, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });

  console.log(`Login de empreiteiro pronto: ${user.email}`);
  console.log(`Empreita vinculada: ${empreiteiro.name} (${empreiteiro.id})`);
  console.log('A senha está na constante PASSWORD deste script.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
