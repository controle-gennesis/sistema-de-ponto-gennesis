'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Send, Trash2, MessageSquare, Loader2, Bot, User, Sparkles, History, Plus, Clock, Search } from 'lucide-react';
import Image from 'next/image';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { useTheme } from '@/context/ThemeContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
  createdAt?: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string;
}

const SUGGESTED_QUESTIONS = [
  'Como bater ponto no sistema?',
  'Como solicitar férias?',
  'Como funciona o banco de horas?',
  'Como consultar minha folha de pagamento?',
  'Como registrar um atestado?',
  'Quais são os horários de trabalho?'
];

export default function ChatGPTPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchHistory, setSearchHistory] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Scroll para a última mensagem
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Carregar histórico de conversas
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await api.get('/chatgpt/history');
      if (response.data.success) {
        setConversations(response.data.data);
      }
    } catch (error: any) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      setIsLoading(true);
      setConversationId(id);
      setMessages([]);
      // TODO: Carregar mensagens da conversa quando o endpoint estiver disponível
      toast.success('Conversa carregada');
    } catch (error: any) {
      console.error('Erro ao carregar conversa:', error);
      toast.error('Erro ao carregar conversa');
    } finally {
      setIsLoading(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setSearchHistory('');
    inputRef.current?.focus();
  };

  const sendMessage = async (e?: React.FormEvent, messageText?: string) => {
    e?.preventDefault();
    
    const messageToSend = messageText || inputMessage.trim();
    if (!messageToSend || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: messageToSend,
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await api.post('/chatgpt/message', {
        message: messageToSend,
        conversationId: conversationId || undefined
      });

      if (response.data.success) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.data.data.message,
          createdAt: new Date().toISOString()
        };

        setMessages(prev => [...prev, assistantMessage]);
        
        // Se for uma nova conversa, salvar o ID
        if (!conversationId && response.data.data.conversationId) {
          setConversationId(response.data.data.conversationId);
          loadConversations();
        }
      } else {
        throw new Error('Erro ao enviar mensagem');
      }
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error(error.response?.data?.error || 'Erro ao enviar mensagem. Tente novamente.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearHistory = async () => {
    if (!confirm('Tem certeza que deseja limpar todo o histórico de conversas?')) {
      return;
    }

    try {
      await api.delete('/chatgpt/history');
      setConversations([]);
      setConversationId(null);
      setMessages([]);
      toast.success('Histórico limpo com sucesso');
    } catch (error: any) {
      console.error('Erro ao limpar histórico:', error);
      toast.error('Erro ao limpar histórico');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchHistory.toLowerCase()) ||
    conv.lastMessage.toLowerCase().includes(searchHistory.toLowerCase())
  );

  if (loadingUser || !userData) {
    return (
      <Loading
        message="Carregando assistente..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="h-[calc(100vh-2.5rem)] min-h-[calc(100vh-2.5rem)] flex flex-col w-full max-w-[160rem] mx-auto -mx-2 lg:-mx-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col h-full border border-gray-200 dark:border-gray-700">
          {/* Header com logo Genesis */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 dark:from-blue-800 dark:via-blue-900 dark:to-indigo-900 px-6 py-5 flex items-center justify-between border-b border-blue-500/20">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm flex items-center justify-center shrink-0">
                <Image
                  src="/loogo.png"
                  alt="Logo Genesis"
                  width={48}
                  height={48}
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  Assistente Virtual
                  <Sparkles className="w-5 h-5 text-yellow-300" />
                </h1>
                <p className="text-sm text-blue-100 mt-0.5">Tire suas dúvidas sobre o sistema</p>
              </div>
            </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startNewConversation}
              className="px-4 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg transition-all duration-200 text-sm font-medium flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Nova Conversa
            </button>
            {conversations.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-2.5 bg-white/20 hover:bg-red-500/30 backdrop-blur-sm text-white rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
                title="Limpar histórico"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar de Histórico – sempre visível, não ocultar */}
          <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Conversas
                </h2>
              </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar conversas..."
                    value={searchHistory}
                    onChange={(e) => setSearchHistory(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
                  />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {searchHistory ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa anterior'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                          conversationId === conv.id
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 shadow-md'
                            : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 hover:shadow-md'
                        }`}
                      >
                        <div className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate mb-1">
                          {conv.title}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {new Date(conv.updatedAt).toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })} • {conv.messageCount} msgs
                        </div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* Área de Chat melhorada */}
          <div className="flex-1 flex flex-col bg-gradient-to-b from-gray-50 to-white dark:from-gray-900/50 dark:to-gray-800">
            {/* Mensagens */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-6 space-y-6"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-blue-200 dark:bg-blue-900 rounded-full blur-2xl opacity-50"></div>
                    <div className="relative p-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full">
                      <Bot className="w-16 h-16 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                    Olá! Como posso ajudar?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md mb-8">
                    Faça perguntas sobre o sistema de controle de ponto, folha de pagamento, férias, banco de horas e outros processos internos.
                  </p>
                  
                  {/* Sugestões de perguntas */}
                  <div className="w-full max-w-2xl">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Perguntas sugeridas:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {SUGGESTED_QUESTIONS.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => sendMessage(undefined, question)}
                          className="p-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 text-sm text-gray-700 dark:text-gray-300 hover:shadow-md"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className={`flex flex-col gap-1 max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`rounded-2xl px-5 py-3 shadow-md ${
                          message.role === 'user'
                            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-tl-sm'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                      {message.createdAt && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
                          {formatTime(message.createdAt)}
                        </span>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center shadow-lg">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex gap-4 justify-start animate-fade-in">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-5 py-3 border border-gray-200 dark:border-gray-700 shadow-md">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Pensando...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input melhorado */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <form onSubmit={sendMessage} className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Digite sua pergunta... (Enter para enviar, Shift+Enter para nova linha)"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 resize-none transition-all duration-200"
                    rows={1}
                    disabled={isLoading}
                    style={{ minHeight: '48px', maxHeight: '120px' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                    }}
                  />
                  <div className="absolute right-3 bottom-3 text-xs text-gray-400">
                    {inputMessage.length > 0 && `${inputMessage.length} caracteres`}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isLoading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 flex items-center gap-2 font-medium shadow-lg hover:shadow-xl disabled:shadow-none hover:scale-105 active:scale-95"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span className="hidden sm:inline">Enviar</span>
                    </>
                  )}
                </button>
              </form>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                O assistente pode cometer erros. Verifique informações importantes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </MainLayout>
  );
}
