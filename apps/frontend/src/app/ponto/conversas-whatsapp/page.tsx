'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  MessageSquare,
  Phone,
  Clock,
  FileText,
  ChevronRight,
  User,
  Bot,
  Paperclip,
  Loader2,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConversationSummary {
  id: string;
  phone: string;
  flowStatus: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  submissionCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  createdAt: string;
}

interface Submission {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  fileUrl?: string | null;
  fileName?: string | null;
  status: string;
  medicalCertificateId?: string | null;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  phone: string;
  flowStatus: string;
  currentStep: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  submissions: Submission[];
}

function formatPhone(phone: string) {
  const n = phone.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
}

export default function ConversasWhatsAppPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['whatsapp-conversations'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/conversations');
      return res.data;
    }
  });

  const { data: detailData, isLoading: loadingDetail } = useQuery({
    queryKey: ['whatsapp-conversation', selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const res = await api.get(`/whatsapp/conversations/${selectedId}`);
      return res.data;
    },
    enabled: !!selectedId
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.href = '/auth/login';
  };

  const conversations: ConversationSummary[] = listData?.data ?? [];
  const detail: ConversationDetail | null = detailData?.data ?? null;
  const isLoading = loadingUser || loadingList;

  if (loadingUser) {
    return (
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <Loading />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      userRole="EMPLOYEE"
      userName={userData?.data?.name ?? ''}
      onLogout={handleLogout}
    >
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-7 h-7" />
            Conversas WhatsApp
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Conversas do chatbot para o pessoal ver. Clique em uma conversa para ver as mensagens e envios (atestados etc.).
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista de conversas */}
          <Card className="lg:col-span-1 dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Conversas
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-8 px-4 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2">
                  <AlertCircle className="w-10 h-10" />
                  <span>Nenhuma conversa ainda.</span>
                  <span className="text-sm">Quando alguém mandar mensagem no WhatsApp, aparecerá aqui.</span>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                          selectedId === c.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {formatPhone(c.phone)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {c.lastMessage || 'Sem mensagens'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {c.lastMessageAt
                              ? format(new Date(c.lastMessageAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : format(new Date(c.updatedAt), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Detalhe da conversa */}
          <div className="lg:col-span-2">
            {!selectedId ? (
              <Card className="dark:bg-gray-800 dark:border-gray-700 h-full min-h-[320px] flex items-center justify-center">
                <div className="text-center text-gray-500 dark:text-gray-400 py-12 px-4">
                  <MessageSquare className="w-14 h-14 mx-auto mb-3 opacity-50" />
                  <p>Selecione uma conversa para ver as mensagens e envios.</p>
                </div>
              </Card>
            ) : loadingDetail ? (
              <Card className="dark:bg-gray-800 dark:border-gray-700 min-h-[320px] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
              </Card>
            ) : detail ? (
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700 pb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="lg:hidden flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </button>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className="w-5 h-5 text-gray-500" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatPhone(detail.phone)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {detail.messages.length} mensagens · {detail.submissions.length} envio(s)
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Mensagens */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Conversa
                    </h3>
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                      {detail.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 ${
                              m.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2 text-xs opacity-80 mb-1">
                              {m.role === 'user' ? (
                                <User className="w-3 h-3" />
                              ) : (
                                <Bot className="w-3 h-3" />
                              )}
                              <span>
                                {format(new Date(m.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                            {m.mediaUrl && (
                              <a
                                href={m.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-2 text-xs underline"
                              >
                                <Paperclip className="w-3 h-3" />
                                {m.fileName || 'Anexo'}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Envios (atestados etc.) */}
                  {detail.submissions.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Enviados para o sistema
                      </h3>
                      <div className="space-y-2">
                        {detail.submissions.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-700/50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {s.type === 'MEDICAL_CERTIFICATE' ? 'Atestado médico' : s.type}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  s.status === 'PENDING'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                    : s.status === 'PROCESSED' || s.status === 'APPROVED'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                }`}
                              >
                                {s.status}
                              </span>
                            </div>
                            {s.payload && typeof s.payload === 'object' && (
                              <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap break-words">
                                {JSON.stringify(s.payload, null, 2)}
                              </pre>
                            )}
                            {s.fileUrl && (
                              <a
                                href={s.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <Paperclip className="w-4 h-4" />
                                {s.fileName || 'Ver arquivo'}
                              </a>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {format(new Date(s.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="dark:bg-gray-800 dark:border-gray-700 min-h-[320px] flex items-center justify-center">
                <p className="text-gray-500 dark:text-gray-400">Conversa não encontrada.</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
