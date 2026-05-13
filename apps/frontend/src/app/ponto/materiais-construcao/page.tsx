'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Package, Plus, Edit, Trash2, Search, X, Check, AlertCircle, Upload, Download, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ConstructionMaterial {
  id: string;
  name: string;
  sinapiCode?: string;
  description: string;
  unit: string;
  category?: string;
  dimensions?: string;
  productImageUrl?: string;
  productImageName?: string;
  medianPrice?: number | string;
  state?: string;
  referenceMonth?: number;
  referenceYear?: number;
  categoryId?: string;
  costCenterId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function MateriaisConstrucaoPage() {
  const CUSTOM_UNITS_STORAGE_KEY = 'construction-material-custom-units';

  const siUnits = [
    'm',
    'kg',
    's',
    'A',
    'K',
    'mol',
    'cd',
    'm²',
    'm³',
    'm/s',
    'm/s²',
    'kg/m³',
    'N',
    'Pa',
    'J',
    'W',
    'Hz',
    'C',
    'V',
    'Ω',
    'S',
    'F',
    'H',
    'Wb',
    'T',
    'lm',
    'lx',
    'Bq',
    'Gy',
    'Sv',
    'kat'
  ];

  const materialCategories = [
    'ACABAMENTO',
    'ADMINISTRATIVO',
    'ALVENARIA',
    'COBERTURA',
    'COMUNICAÇÃO VISUAL',
    'ELÉTRICA',
    'EPI',
    'FERRAMENTAS',
    'GASES MEDICINAIS',
    'HIDRÁULICA',
    'IMPERMEABILIZAÇÃO',
    'INCÊNDIO',
    'MARCENARIA',
    'MARMORARIA',
    'MATERIAL DE EXPEDIENTE',
    'PAISAGISMO',
    'PINTURA',
    'REFRIGERAÇÃO',
    'SERRALHERIA',
    'TELECOMUNICAÇÕES',
    'VIDRAÇARIA'
  ];

  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ConstructionMaterial | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    dimensions: '',
    productImageUrl: '',
    productImageName: '',
    unit: '',
    medianPrice: '',
    state: '',
    referenceMonth: '',
    referenceYear: '',
    categoryId: '',
    costCenterId: '',
    isActive: true
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  /** 'all' | 'true' | 'false' — alinhado à API de listagem. */
  const [materialActiveFilter, setMaterialActiveFilter] = useState<string>('all');
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const hasActiveMaterialFilters = materialActiveFilter !== 'all';

  // Buscar materiais
  const { data: materialsData, isLoading: loadingMaterials } = useQuery({
    queryKey: ['construction-materials', searchTerm, materialActiveFilter, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/construction-materials', {
        params: {
          search: searchTerm || undefined,
          isActive: materialActiveFilter !== 'all' ? materialActiveFilter : undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_UNITS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean);
        setCustomUnits(Array.from(new Set(sanitized)));
      }
    } catch (_error) {
      // Ignora erro de parse e segue com lista padrão.
    }
  }, []);

  const unitOptions = useMemo(() => {
    const unitsFromMaterials = (materialsData?.data || [])
      .map((material: ConstructionMaterial) => material.unit?.trim())
      .filter((unit: string) => Boolean(unit));

    return Array.from(new Set([...siUnits, ...customUnits, ...unitsFromMaterials]))
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [siUnits, customUnits, materialsData?.data]);

  const rememberCustomUnit = (unit: string) => {
    const normalized = unit.trim();
    if (!normalized) return;

    setCustomUnits((prev) => {
      if (prev.includes(normalized)) return prev;
      const updated = [...prev, normalized].sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
      );
      localStorage.setItem(CUSTOM_UNITS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Criar material
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/construction-materials', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowForm(false);
      resetForm();
      toast.success('Material criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao criar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao criar material';
      toast.error(errorMessage);
    }
  });

  // Atualizar material
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/construction-materials/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowForm(false);
      setEditingMaterial(null);
      resetForm();
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao atualizar material';
      toast.error(errorMessage);
    }
  });

  // Deletar material
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/construction-materials/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowDeleteModal(null);
    }
  });

  // Importar materiais
  const importMutation = useMutation({
    mutationFn: async (materials: any[]) => {
      const res = await api.post('/construction-materials/import', { materials });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowImportModal(false);
      setImportData('');
      alert(`Importação concluída: ${data.data.created} materiais criados`);
    },
    onError: (error: any) => {
      console.error('Erro ao importar materiais:', error);
      alert('Erro ao importar materiais: ' + (error.response?.data?.message || error.message));
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      dimensions: '',
      productImageUrl: '',
      productImageName: '',
      unit: '',
      medianPrice: '',
      state: '',
      referenceMonth: '',
      referenceYear: '',
      categoryId: '',
      costCenterId: '',
      isActive: true
    });
    setEditingMaterial(null);
  };

  const handleEdit = (material: ConstructionMaterial) => {
    setEditingMaterial(material);
    setFormData({
      name: material.name || '',
      description: material.description || '',
      category: material.category || '',
      dimensions: material.dimensions || '',
      productImageUrl: material.productImageUrl || '',
      productImageName: material.productImageName || '',
      unit: material.unit,
      medianPrice: material.medianPrice?.toString() || '',
      state: material.state || '',
      referenceMonth: material.referenceMonth?.toString() || '',
      referenceYear: material.referenceYear?.toString() || '',
      categoryId: material.categoryId || '',
      costCenterId: material.costCenterId || '',
      isActive: material.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (!formData.name.trim() || !formData.unit.trim()) {
      toast.error('Por favor, preencha nome do material e unidade de medida');
      return;
    }

    const name = formData.name.trim().toUpperCase().slice(0, 255);
    const unit = formData.unit.trim();
    const materialDescription = formData.description.trim();

    // Limpar dados: remover campos vazios e manter apenas os necessários
    const dataToSend: any = {
      name,
      description: materialDescription || name,
      unit,
      isActive: formData.isActive
    };

    if (formData.category && formData.category.trim()) {
      dataToSend.category = formData.category.trim();
    }
    if (formData.dimensions && formData.dimensions.trim()) {
      dataToSend.dimensions = formData.dimensions.trim();
    }
    if (formData.productImageUrl && formData.productImageUrl.trim()) {
      dataToSend.productImageUrl = formData.productImageUrl.trim();
    }
    if (formData.productImageName && formData.productImageName.trim()) {
      dataToSend.productImageName = formData.productImageName.trim();
    }
    
    // Adicionar campos opcionais apenas se tiverem valor
    if (formData.medianPrice && formData.medianPrice.toString().trim()) {
      dataToSend.medianPrice = parseFloat(formData.medianPrice.toString()) || undefined;
    }
    if (formData.state && formData.state.trim()) {
      dataToSend.state = formData.state.trim();
    }
    if (formData.referenceMonth && formData.referenceMonth.toString().trim()) {
      dataToSend.referenceMonth = parseInt(formData.referenceMonth.toString()) || undefined;
    }
    if (formData.referenceYear && formData.referenceYear.toString().trim()) {
      dataToSend.referenceYear = parseInt(formData.referenceYear.toString()) || undefined;
    }
    if (formData.categoryId && formData.categoryId.trim()) {
      dataToSend.categoryId = formData.categoryId.trim();
    }
    if (formData.costCenterId && formData.costCenterId.trim()) {
      dataToSend.costCenterId = formData.costCenterId.trim();
    }
    
    console.log('Enviando dados:', dataToSend);

    rememberCustomUnit(unit);
    
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        let materials: any[] = [];

        if (file.name.endsWith('.json')) {
          materials = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const material: any = {};
            headers.forEach((header, index) => {
              if (header === 'nome' || header === 'name') {
                material.name = values[index];
              } else if (header === 'codigo' || header === 'code' || header === 'sinapicode') {
                material.sinapiCode = values[index];
              } else if (header === 'descrição' || header === 'description' || header === 'descricao') {
                material.description = values[index];
              } else if (header === 'unidade' || header === 'unit') {
                material.unit = values[index];
              } else if (header === 'ativo' || header === 'isactive' || header === 'is_active') {
                material.isActive = values[index]?.toLowerCase() === 'true' || values[index] === '1';
              }
            });
            if (material.description && material.unit) {
              const desc = String(material.description).trim();
              const nameFromLegacy =
                (material.name || material.sinapiCode || desc).toString().trim().slice(0, 255);
              materials.push({
                ...material,
                name: nameFromLegacy,
                description: desc
              });
            }
          }
        }

        if (materials.length > 0) {
          setImportData(JSON.stringify(materials, null, 2));
          setShowImportModal(true);
        } else {
          alert('Nenhum material válido encontrado no arquivo');
        }
      } catch (error) {
        alert('Erro ao processar arquivo: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleProductImageUpload = async (file: File) => {
    const payload = new FormData();
    payload.append('file', file);

    const res = await api.post('/construction-materials/upload-image', payload, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return res.data?.data as { url: string; originalName: string };
  };

  const handleImport = () => {
    try {
      const materials = JSON.parse(importData);
      if (Array.isArray(materials) && materials.length > 0) {
        importMutation.mutate(materials);
      } else {
        alert('Formato inválido. Deve ser um array de materiais.');
      }
    } catch (error) {
      alert('Erro ao processar dados: ' + (error as Error).message);
    }
  };

  const handleExport = () => {
    const materials = materialsData?.data || [];
    const json = JSON.stringify(materials, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiais-construcao-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const materials = materialsData?.data || [];
  const pagination = materialsData?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, materialActiveFilter]);

  // Como a busca já é feita no backend, não precisamos filtrar no frontend
  const filteredMaterials = useMemo(() => {
    return materials;
  }, [materials]);

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  return (
    <ProtectedRoute route="/ponto/materiais-construcao">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Materiais de Construção
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie os materiais de construção civil
            </p>
          </div>

          <MaterialFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingMaterial={editingMaterial}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
            materialCategories={materialCategories}
            unitOptions={unitOptions}
            handleProductImageUpload={handleProductImageUpload}
          />

          <Modal
            isOpen={isFiltersModalOpen}
            onClose={() => setIsFiltersModalOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status na listagem
                </label>
                <select
                  value={materialActiveFilter}
                  onChange={(e) => setMaterialActiveFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="all">Todos (ativos e inativos)</option>
                  <option value="true">Somente ativos</option>
                  <option value="false">Somente inativos</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                A busca por texto fica na barra acima. Aqui você restringe por situação do cadastro.
              </p>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setMaterialActiveFilter('all')}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>

          {/* Lista de materiais */}
          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <Package className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Materiais de Construção
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pagination.total}{' '}
                      {pagination.total === 1 ? 'material cadastrado' : 'materiais cadastrados'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                  <div className="relative min-w-[240px] flex-1 lg:w-[280px] lg:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Pesquisar material..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveMaterialFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveMaterialFilters ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveMaterialFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>Exportar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(true);
                      setImportData('');
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Upload className="h-4 w-4 shrink-0" />
                    <span>Importar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo Material</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed border-collapse">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th
                        scope="col"
                        className="w-[40%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4"
                      >
                        Nome do Material
                      </th>
                      <th
                        scope="col"
                        className="w-[22%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4"
                      >
                        Categoria
                      </th>
                      <th
                        scope="col"
                        className="w-[14%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4"
                      >
                        Unidade
                      </th>
                      <th
                        scope="col"
                        className="w-[12%] px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="w-[12%] min-w-[100px] px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4"
                      >
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {loadingMaterials ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center sm:px-6">
                          <div className="flex items-center justify-center gap-2">
                            <div className="loading-spinner h-6 w-6" />
                            <span className="text-gray-600 dark:text-gray-400">Carregando materiais...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center sm:px-6">
                          <div className="text-gray-500 dark:text-gray-400">
                            <p className="font-medium text-gray-700 dark:text-gray-300">Nenhum material encontrado.</p>
                            <p className="mt-1 text-sm">Tente ajustar a busca ou os filtros.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredMaterials.map((material: ConstructionMaterial) => (
                        <tr
                          key={material.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="min-w-0 px-3 py-4 sm:px-6">
                            <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                              {material.name || '-'}
                            </div>
                            <span className="block truncate text-sm text-gray-600 dark:text-gray-400">
                              {material.description || 'Sem descrição'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {material.category || '-'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {material.unit}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${
                                material.isActive
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                              }`}
                            >
                              {material.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleEdit(material)}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setShowDeleteModal(material.id)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Paginação */}
              {pagination.totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Mostrando {((pagination.page - 1) * pagination.limit) + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} materiais
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      
                      {/* Números das páginas */}
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNumber: number;
                        if (pagination.totalPages <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= pagination.totalPages - 2) {
                          pageNumber = pagination.totalPages - 4 + i;
                        } else {
                          pageNumber = currentPage - 2 + i;
                        }
                        
                        const isActive = pageNumber === currentPage;
                        
                        return (
                          <button
                            key={pageNumber}
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                              isActive
                                ? 'bg-red-600 text-white'
                                : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                            } transition-colors`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.totalPages))}
                        disabled={currentPage === pagination.totalPages}
                        className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal de confirmação de exclusão */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
                Excluir Material?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este material? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de importação */}
        {showImportModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => {
              setShowImportModal(false);
              setImportData('');
            }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Upload className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Importar Materiais
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportData('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Carregar arquivo (CSV ou JSON)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileUpload}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Formato CSV: descrição,unidade,ativo (com cabeçalho na primeira linha; colunas nome/código são opcionais)
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Formato JSON: Array de objetos com campos: description, unit, isActive (name opcional)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ou cole os dados JSON aqui:
                  </label>
                  <textarea
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                    placeholder='[{"description": "Cimento Portland", "unit": "kg", "isActive": true}]'
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportData('');
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!importData.trim() || importMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {importMutation.isPending ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

// Componente de Modal de Formulário
function MaterialFormModal({
  isOpen,
  onClose,
  editingMaterial,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation,
  materialCategories,
  unitOptions,
  handleProductImageUpload
}: {
  isOpen: boolean;
  onClose: () => void;
  editingMaterial: ConstructionMaterial | null;
  formData: {
    name: string;
    description: string;
    category: string;
    dimensions: string;
    productImageUrl: string;
    productImageName: string;
    unit: string;
    medianPrice: string;
    state: string;
    referenceMonth: string;
    referenceYear: string;
    categoryId: string;
    costCenterId: string;
    isActive: boolean;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    description: string;
    category: string;
    dimensions: string;
    productImageUrl: string;
    productImageName: string;
    unit: string;
    medianPrice: string;
    state: string;
    referenceMonth: string;
    referenceYear: string;
    categoryId: string;
    costCenterId: string;
    isActive: boolean;
  }>>;
  onSubmit: (e: React.FormEvent) => void;
  createMutation: any;
  updateMutation: any;
  materialCategories: string[];
  unitOptions: string[];
  handleProductImageUpload: (file: File) => Promise<{ url: string; originalName: string }>;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black bg-opacity-50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingMaterial ? 'Editar Material' : 'Cadastrar Material'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nome do Material *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Ex: Cimento Portland CP-II"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descrição do Material
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Detalhes adicionais do material..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categoria
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Selecione uma categoria</option>
                  {materialCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dimensões
                </label>
                <input
                  type="text"
                  value={formData.dimensions}
                  onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: 2,00m x 1,00m x 0,05m"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Unidade de Medida *
              </label>
              <input
                type="text"
                required
                list="material-unit-options"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Digite para buscar ou cadastrar (ex: kg, m², un, rolo)"
              />
              <datalist id="material-unit-options">
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Imagem do Produto
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  try {
                    const uploaded = await handleProductImageUpload(file);
                    setFormData({
                      ...formData,
                      productImageUrl: uploaded.url,
                      productImageName: uploaded.originalName
                    });
                    toast.success('Imagem enviada com sucesso!');
                  } catch (error: any) {
                    const message =
                      error?.response?.data?.message || error?.message || 'Erro ao enviar imagem';
                    toast.error(message);
                  } finally {
                    e.target.value = '';
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {formData.productImageName && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {formData.productImageName}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        productImageUrl: '',
                        productImageName: ''
                      })
                    }
                  >
                    Remover
                  </button>
                </div>
              )}
              {formData.productImageUrl && (
                <img
                  src={formData.productImageUrl}
                  alt={formData.productImageName || 'Imagem do produto'}
                  className="mt-3 h-24 w-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                />
              )}
            </div>

            <div className="flex items-center">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                    formData.isActive 
                      ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500' 
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                  }`}>
                    {formData.isActive && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                  Ativo
                </span>
              </label>
            </div>

            {(createMutation.isError || updateMutation.isError) && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                    Erro ao salvar material
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {(createMutation.error as any)?.response?.data?.message || 
                     (updateMutation.error as any)?.response?.data?.message || 
                     (createMutation.error as any)?.message ||
                     (updateMutation.error as any)?.message ||
                     'Ocorreu um erro inesperado. Verifique os dados e tente novamente.'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Salvando...'
                  : editingMaterial
                  ? 'Atualizar'
                  : 'Criar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
