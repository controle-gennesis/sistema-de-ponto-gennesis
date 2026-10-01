export type EmployeeSelectOption = {
  id: string;
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
  position?: string | null;
};

export function mapUsersToEmployeeOptions(users: any[]): EmployeeSelectOption[] {
  return users
    .filter((user) => {
      if (!user.employee?.id) return false;
      if (user.employee.position === 'Administrador') return false;
      const name = String(user.name || '').trim();
      if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) {
        return false;
      }
      return true;
    })
    .map((user) => ({
      id: String(user.employee.id),
      name: String(user.name || '').trim(),
      cpf: user.cpf ? String(user.cpf) : null,
      profilePhotoUrl: user.profilePhotoUrl ? String(user.profilePhotoUrl) : null,
      position: user.employee?.position ? String(user.employee.position) : null,
    }))
    .filter((employee) => employee.id && employee.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function isCargoAdvogado(position?: string | null): boolean {
  const raw = String(position || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return raw === 'advogado' || raw === 'advogada' || raw.includes('advogad');
}

/** Advogados para o formulário jurídico (não depende do módulo Funcionários). */
export async function fetchJuridicoAdvogadoOptions(): Promise<EmployeeSelectOption[]> {
  const { default: api } = await import('@/lib/api');
  const res = await api.get('/juridico-processos/advogados');
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows
    .map((row: any) => ({
      id: String(row.id || ''),
      name: String(row.name || '').trim(),
      cpf: row.cpf ? String(row.cpf) : null,
      profilePhotoUrl: row.profilePhotoUrl ? String(row.profilePhotoUrl) : null,
      position: row.position ? String(row.position) : null,
    }))
    .filter((employee: EmployeeSelectOption) => employee.id && employee.name)
    .sort((a: EmployeeSelectOption, b: EmployeeSelectOption) =>
      a.name.localeCompare(b.name, 'pt-BR')
    );
}

export async function fetchEmployeeSelectOptions(params?: {
  position?: string;
}): Promise<EmployeeSelectOption[]> {
  const { default: api } = await import('@/lib/api');
  const res = await api.get('/users', {
    params: { page: 1, limit: 1000, ...(params?.position ? { position: params.position } : {}) },
  });
  const users = res.data?.data || [];
  return mapUsersToEmployeeOptions(users);
}
