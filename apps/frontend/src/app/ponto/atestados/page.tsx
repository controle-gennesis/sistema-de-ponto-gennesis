'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { MedicalCertificateCard } from '@/components/medical-certificate/MedicalCertificateCard';
import { MedicalCertificateList } from '@/components/medical-certificate/MedicalCertificateList';
import { FileText, List, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

export default function AtestadosPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'send'>('list');

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/auth/login';
  };

  const handleSuccess = () => {
    setActiveTab('list');
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6 w-full px-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Ausências</h1>
          <p className="mt-1 text-gray-600">Gerencie suas ausências e acompanhe o status</p>
        </div>

        {/* Navegação no topo */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'list'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <List className="w-4 h-4" />
              Meus Registros
            </button>
            <button
              onClick={() => setActiveTab('send')}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'send'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Plus className="w-4 h-4" />
              Registrar Ausência
            </button>
          </nav>
        </div>

        {/* Conteúdo principal */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">
                {activeTab === 'list' ? 'Meus Registros' : 'Registrar Ausência'}
              </h1>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'list' ? (
              <MedicalCertificateList />
            ) : (
              <MedicalCertificateCard onSuccess={handleSuccess} />
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
