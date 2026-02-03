'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Send, Trash2, MessageSquare, Loader2, Bot, User, Sparkles, History, Plus, Clock, Search } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent } from '@/components/ui/Card';

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
      
      const response = await api.get(`/chatgpt/conversation/${id}`);
      if (response.data.success) {
        const conversationMessages: Message[] = response.data.data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt
        }));
        setMessages(conversationMessages);
        toast.success('Conversa carregada');
      }
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
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
            <Bot className="w-6 h-6 sm:w-8 sm:h-8 text-red-600 dark:text-red-500" />
            Assistente Virtual
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Tire suas dúvidas sobre o sistema de controle de ponto
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
          {/* Sidebar de Histórico */}
          <Card className="lg:col-span-1 flex flex-col overflow-hidden">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <History className="w-5 h-5 text-red-600 dark:text-red-500" />
                  Conversas
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startNewConversation}
                    className="p-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
                    title="Nova conversa"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {conversations.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      title="Limpar histórico"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar conversas..."
                  value={searchHistory}
                  onChange={(e) => setSearchHistory(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-gray-200"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {searchHistory ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa anterior'}
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                        conversationId === conv.id
                          ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-500'
                          : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate mb-1">
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
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Área de Chat */}
          <Card className="lg:col-span-3 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex flex-col h-full">
              {/* Mensagens */}
              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50 dark:bg-gray-900/50"
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="mb-6">
                      <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full inline-flex">
                        <Bot className="w-12 h-12 text-red-600 dark:text-red-500" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      Olá! Como posso ajudar?
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
                      Faça perguntas sobre o sistema de controle de ponto, folha de pagamento, férias, banco de horas e outros processos internos.
                    </p>
                    
                    {/* Sugestões de perguntas */}
                    <div className="w-full max-w-2xl">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Perguntas sugeridas:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SUGGESTED_QUESTIONS.map((question, index) => (
                          <button
                            key={index}
                            onClick={() => sendMessage(undefined, question)}
                            className="p-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 text-sm text-gray-700 dark:text-gray-300"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {message.role === 'assistant' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-red-600 dark:text-red-500" />
                          </div>
                        )}
                        <div className={`flex flex-col gap-1 max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`rounded-lg px-4 py-2.5 ${
                              message.role === 'user'
                                ? 'bg-red-600 dark:bg-red-700 text-white'
                                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {message.content}
                            </div>
                          </div>
                          {message.createdAt && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 px-1">
                              {formatTime(message.createdAt)}
                            </span>
                          )}
                        </div>
                        {message.role === 'user' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-red-600 dark:text-red-500" />
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-red-600 dark:text-red-500" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Pensando...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <form onSubmit={sendMessage} className="flex gap-3 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Digite sua pergunta... (Enter para enviar, Shift+Enter para nova linha)"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 resize-none transition-all duration-200"
                      rows={1}
                      disabled={isLoading}
                      style={{ minHeight: '42px', maxHeight: '120px' }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isLoading}
                    className="px-4 py-2.5 bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 flex items-center gap-2 font-medium"
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
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
