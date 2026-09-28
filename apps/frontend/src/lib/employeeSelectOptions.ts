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
  return String(position || '').trim().toLowerCase() === 'advogado';
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
