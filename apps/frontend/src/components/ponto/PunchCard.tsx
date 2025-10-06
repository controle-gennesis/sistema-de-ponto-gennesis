'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Clock, AlertCircle, DoorOpen, DoorClosed, Utensils, UtensilsCrossed, Camera, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePunchInOut } from '@/hooks/usePunchInOut';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useWebcam } from '@/hooks/useWebcam';
import { TimeRecordType } from '@/types';
import api from '@/lib/api';

interface PunchCardProps {
  onSuccess?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

export const PunchCard: React.FC<PunchCardProps> = ({ onSuccess, showCloseButton = false, onClose }) => {
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [lastRecord, setLastRecord] = useState<TimeRecordType | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [observation, setObservation] = useState('');
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [allPointsCompleted, setAllPointsCompleted] = useState(false);
  
  const { location, error: locationError, loading: locationLoading } = useGeolocation();
  const { 
    punchInOut, 
    loading: punchLoading, 
    error: punchError 
  } = usePunchInOut();

  const {
    videoRef,
    canvasRef,
    stream,
    error: cameraError,
    isReady: cameraReady,
    startCamera,
    stopCamera,
    capturePhoto,
    cleanup
  } = useWebcam();

  const punchTypes: Array<{ type: TimeRecordType; label: string; icon: React.ReactNode }> = [
    { type: TimeRecordType.ENTRY, label: 'Entrada', icon: <DoorOpen className="w-5 h-5" /> },
    { type: TimeRecordType.LUNCH_START, label: 'Almoço', icon: <Utensils className="w-5 h-5" /> },
    { type: TimeRecordType.LUNCH_END, label: 'Retorno', icon: <UtensilsCrossed className="w-5 h-5" /> },
    { type: TimeRecordType.EXIT, label: 'Saída', icon: <DoorClosed className="w-5 h-5" /> },
  ];

  // Função para determinar o próximo tipo de ponto baseado nos registros do dia
  const getNextPunchType = (): TimeRecordType => {
    // Se não há registros hoje, começar com entrada
    if (!todayRecords || todayRecords.length === 0) {
      return TimeRecordType.ENTRY;
    }

    // Verificar quais tipos já foram registrados hoje
    const hasEntry = todayRecords.some(r => r.type === TimeRecordType.ENTRY);
    const hasLunchStart = todayRecords.some(r => r.type === TimeRecordType.LUNCH_START);
    const hasLunchEnd = todayRecords.some(r => r.type === TimeRecordType.LUNCH_END);
    const hasExit = todayRecords.some(r => r.type === TimeRecordType.EXIT);

    // Determinar o próximo ponto baseado no que falta
    if (!hasEntry) return TimeRecordType.ENTRY;
    if (!hasLunchStart) return TimeRecordType.LUNCH_START;
    if (!hasLunchEnd) return TimeRecordType.LUNCH_END;
    if (!hasExit) return TimeRecordType.EXIT;

    // Se todos foram registrados, retornar entrada (próximo dia)
    return TimeRecordType.ENTRY;
  };

  const selectedType = getNextPunchType();

  // Função para verificar se todos os 4 pontos foram batidos ou se há ausência justificada
  const checkAllPointsCompleted = (records: any[]) => {
    const hasEntry = records.some(r => r.type === TimeRecordType.ENTRY);
    const hasLunchStart = records.some(r => r.type === TimeRecordType.LUNCH_START);
    const hasLunchEnd = records.some(r => r.type === TimeRecordType.LUNCH_END);
    const hasExit = records.some(r => r.type === TimeRecordType.EXIT);
    const hasAbsenceJustified = records.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
    
    // Se há ausência justificada, considerar como "completo" (não pode bater ponto)
    if (hasAbsenceJustified) {
      return true;
    }
    
    return hasEntry && hasLunchStart && hasLunchEnd && hasExit;
  };

  // Atualizar horário atual a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Buscar registros do usuário para hoje
  useEffect(() => {
    const fetchTodayRecords = async () => {
      try {
        const response = await api.get('/time-records/my-records/today');
        const records = response.data.data?.records || [];
        
        setTodayRecords(records);
        
        if (records.length > 0) {
          // Ordenar por data/hora e pegar o último registro
          const sortedRecords = records.sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          const lastRecordType = sortedRecords[0].type;
          setLastRecord(lastRecordType);
          console.log('Último registro encontrado:', lastRecordType);
        } else {
          setLastRecord(null);
          console.log('Nenhum registro encontrado para hoje');
        }
        
        // Verificar se todos os 4 pontos foram batidos
        const completed = checkAllPointsCompleted(records);
        setAllPointsCompleted(completed);
        
      } catch (error) {
        console.error('Erro ao buscar registros:', error);
        setLastRecord(null);
        setTodayRecords([]);
        setAllPointsCompleted(false);
      }
    };

    fetchTodayRecords();
  }, []);

  // Cleanup da câmera quando componente for desmontado
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleTakePhoto = async () => {
    try {
      const photo = await capturePhoto();
      setCapturedPhoto(photo);
      setShowCamera(false);
      stopCamera();
    } catch (error) {
      console.error('Erro ao capturar foto:', error);
    }
  };

  const handleRetakePhoto = () => {
    setCapturedPhoto(null);
    setShowCamera(true);
  };

  const handleOpenCamera = async () => {
    setShowCamera(true);
    try {
      await startCamera();
    } catch (error) {
      console.error('Erro ao iniciar câmera:', error);
    }
  };

  const handleCloseCamera = () => {
    setShowCamera(false);
    stopCamera();
  };

  const handlePunch = async () => {
    if (!capturedPhoto) {
      alert('Por favor, tire uma foto antes de bater o ponto');
      return;
    }

    try {
      await punchInOut({
        type: selectedType,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        photo: capturedPhoto,
        observation: observation.trim(),
      } as any);
      
      // Atualizar o último registro para o próximo tipo
      setLastRecord(selectedType);
      setCapturedPhoto(null);
      setObservation('');
      
      // Atualizar registros e verificar se todos os pontos foram completados
      const updatedRecords = [...todayRecords, { type: selectedType, timestamp: new Date() }];
      setTodayRecords(updatedRecords);
      const completed = checkAllPointsCompleted(updatedRecords);
      setAllPointsCompleted(completed);
      
      // Chamar callbacks de sucesso
      onSuccess?.();
      
      // Fechar a modal após bater o ponto
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Erro ao bater ponto:', error);
    }
  };

  const getLocationStatus = () => {
    if (locationLoading) return { text: 'Obtendo localização...', variant: 'info' as const };
    if (locationError) return { text: 'Localização não disponível - ponto será registrado sem localização', variant: 'warning' as const };
    if (location) return { text: 'Localização registrada', variant: 'success' as const };
    return { text: 'Aguardando localização...', variant: 'info' as const };
  };

  const locationStatus = getLocationStatus();

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-xl shadow-lg border border-gray-100">
      <div className="p-5 space-y-5">
        {/* Header minimalista */}
        <div className="relative text-center">
          {showCloseButton && onClose && (
            <button
              onClick={onClose}
              className="absolute top-0 right-0 p-1.5 hover:bg-gray-50 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-800">
              {punchTypes.find(p => p.type === selectedType)?.label}
            </h2>
            <div className="text-xs text-gray-500">
              {currentTime.toLocaleDateString('pt-BR', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              }).replace(/^\w/, c => c.toUpperCase())}
            </div>
            <div className="text-lg font-semibold text-gray-800 tracking-wide">
              {currentTime.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
          </div>
        </div>

          {allPointsCompleted ? (
            // Verificar se é ausência justificada ou todos os pontos batidos
            (() => {
              const hasAbsenceJustified = todayRecords.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
              
              if (hasAbsenceJustified) {
                return (
                  <div className="text-center space-y-4">
                    <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                          <Clock className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-blue-800 mb-2">
                            Ausência Justificada
                          </h3>
                          <p className="text-blue-700 text-sm">
                            Você possui ausência justificada para hoje. Não é necessário bater ponto.
                          </p>
                          <p className="text-blue-600 text-sm mt-2 font-medium">
                            Você poderá bater ponto novamente amanhã.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="text-center space-y-4">
                    <div className="p-6 bg-green-50 border-2 border-green-200 rounded-lg">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                          <Clock className="w-8 h-8 text-green-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-green-800 mb-2">
                            Parabéns! Todos os pontos foram batidos hoje
                          </h3>
                          <p className="text-green-700 text-sm">
                            Você completou todos os 4 registros obrigatórios: Entrada, Almoço, Retorno e Saída.
                          </p>
                          <p className="text-green-600 text-sm mt-2 font-medium">
                            Você poderá bater ponto novamente amanhã.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-center space-x-2 text-blue-700">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Próximo ponto: Entrada (amanhã)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
            })()
          ) : (
            // Mostrar o formulário normal quando ainda há pontos para bater
            <>


            {/* Status da Localização */}
            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
              <MapPin className="w-4 h-4 text-gray-500" />
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600">Localização</p>
                {!location && (
                  <Badge variant={locationStatus.variant} size="sm">
                    {locationStatus.text}
                  </Badge>
                )}
              </div>
              {location && (
                <div className="text-xs text-gray-400 font-mono">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </div>
              )}
            </div>

            {/* Seção de Foto */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                Foto do Funcionário *
              </label>
              
              {!capturedPhoto && !showCamera && (
                <button
                  onClick={handleOpenCamera}
                  className="w-full p-3 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <Camera className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Tirar Foto</span>
                  </div>
                </button>
              )}

              {showCamera && (
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-48 object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {!cameraReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                        <div className="text-white text-center">
                          <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                          <p>Iniciando câmera...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {cameraError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">{cameraError}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <Button
                      onClick={handleTakePhoto}
                      disabled={!cameraReady}
                      className="flex-1"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Capturar Foto
                    </Button>
                    <Button
                      onClick={handleCloseCamera}
                      variant="outline"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {capturedPhoto && (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={capturedPhoto}
                      alt="Foto capturada"
                      className="w-full h-56 object-cover rounded-lg border mx-auto max-w-sm"
                    />
                    <Badge variant="success" className="absolute top-2 right-2">
                      Foto Capturada
                    </Badge>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      onClick={handleRetakePhoto}
                      variant="outline"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Tirar Nova Foto
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Campo de Observação */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">
                Observação (Opcional)
              </label>
              <textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Digite uma observação..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={2}
                maxLength={500}
              />
              <div className="text-right text-xs text-gray-400">
                {observation.length}/500
              </div>
            </div>

            {/* Botão de Confirmar */}
            <button
              onClick={handlePunch}
              disabled={punchLoading || !location || !!locationError}
              className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center space-x-2 ${
                punchLoading || !location || !!locationError
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {punchLoading ? 'Registrando...' : `Confirmar ${punchTypes.find(p => p.type === selectedType)?.label}`}
              </span>
            </button>

            {punchError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">{punchError}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
