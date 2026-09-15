export interface Employee {
  id: string;
  userId: string;
  employeeId: string; // Matrícula
  department: string;
  position: string;
  hireDate: string;
  birthDate?: string;
  salary: number;
  company?: string;
  polo?: string;
  costCenter?: string;
  client?: string;
  modality?: string;
  isRemote: boolean;
  /** Se false, não precisa bater ponto (padrão true, como no web). */
  requiresTimeClock?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: 'EMPLOYEE' | 'ADMIN' | 'MANAGER';
  createdAt?: string;
  isActive?: boolean;
  profilePhotoUrl?: string | null;
  profilePhotoKey?: string | null;
  employee?: Employee;
}