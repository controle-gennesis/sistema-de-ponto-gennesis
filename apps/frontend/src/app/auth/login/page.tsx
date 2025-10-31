'use client';

// Desabilitar prerendering
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle, ChevronLeft, ChevronRight, LogIn } from 'lucide-react';
import { authService } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);

  // Dados do carrossel
  const carouselData = [
    {
      image: '/01.jpg',
      text: 'Capturando Momentos, Criando Memórias'
    },
    {
      image: '/02.jpg',
      text: 'Simplificando seu trabalho diário'
    },
    {
      image: '/03.jpg',
      text: 'Eficiência e qualidade em cada ação'
    }
  ];

  // Auto-play do carrossel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselData.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [carouselData.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authService.login(formData);
      // Limpar cache do React Query
      queryClient.clear();
      toast.success('Login realizado com sucesso!');
      router.push('/ponto');
    } catch (error: any) {
      // Verificar se é erro de credenciais inválidas
      if (error.message?.includes('Credenciais inválidas') || 
          error.message?.includes('incorreta') ||
          error.message?.includes('inválidas')) {
        setError('Email ou senha incorretos. Verifique suas credenciais e tente novamente.');
      } else {
        setError(error.message || 'Erro ao fazer login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    // Limpar erro quando usuário começar a digitar
    if (error) {
      setError('');
    }
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Overlay de carregamento */}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex flex-col items-center justify-center z-50">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Processando login...
            </h3>
            <p className="text-sm text-gray-600">
              Aguarde enquanto validamos suas credenciais
            </p>
          </div>
        </div>
      )}

      {/* Coluna esquerda - Carrossel */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="w-full h-full flex items-center justify-center p-4">
          {/* Card do carrossel com bordas arredondadas */}
          <div className="relative w-full h-full">
            {/* Borda gradiente wrapper */}
            <div className="absolute inset-0 rounded-2xl p-[2px]">
              {/* Conteúdo do card */}
              <div className="w-full h-full bg-black rounded-[22px] flex flex-col relative overflow-hidden">
                {/* Logo no canto superior esquerdo */}
                <div className="absolute top-6 left-6 z-20">
                  <img 
                    src="/logogrande.png" 
                    alt="Logo Gennesis Engenharia" 
                    className="h-12 w-auto object-contain"
                  />
                </div>

                {/* Link para o site no canto superior direito */}
                <div className="absolute top-6 right-6 z-20">
                  <a 
                    href="https://gennesisengenharia.com.br/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-medium transition-colors backdrop-blur-sm"
                  >
                    <span>Voltar para o site</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>

                {/* Carrossel */}
                <div className="relative flex-1 overflow-hidden">
                  {carouselData.map((slide, index) => (
                    <div
                      key={index}
                      className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                        index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
                      }`}
                    >
                      {/* Imagem de fundo cobrindo tudo */}
                      <div className="absolute inset-0">
                        <img 
                          src={slide.image} 
                          alt={`Slide ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Overlay escuro para melhorar legibilidade do texto */}
                        <div className="absolute inset-0 bg-black/30"></div>
                      </div>
                      
                      {/* Texto centralizado sobre a imagem - posicionado mais abaixo */}
                      <div className="absolute inset-0 flex items-end justify-center pb-24 z-10">
                        <p className="text-white text-3xl font-medium text-center px-12 leading-relaxed drop-shadow-lg">
                          {slide.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Controles do carrossel */}
                <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 z-30">
                  {/* Indicadores */}
                  <div className="flex space-x-2">
                    {carouselData.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentSlide(index)}
                        className={`h-2 rounded-full transition-all duration-500 ease-in-out ${
                          index === currentSlide ? 'bg-white w-14' : 'bg-white/40 w-2'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coluna direita - Formulário de Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-8">
          <div className="w-full max-w-md">
            <div>
              {/* <div className="flex justify-center mb-6">
                <LogIn className="w-16 h-16 text-gray-900" />
              </div> */}
              <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">
               Bem-vindo(a) de volta!
              </h2>
              <p className="text-gray-600 mb-8 text-center">
                Por favor, insira seu email e senha para acessar o sistema.
              </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="relative">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="Email"
                    className="w-full px-4 py-4 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="Senha"
                    className="w-full px-4 pr-12 py-4 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Erro no login</p>
                      <p className="text-sm text-red-600 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 text-base font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
