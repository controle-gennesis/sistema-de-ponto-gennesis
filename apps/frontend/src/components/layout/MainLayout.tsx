'use client';

import React, { useCallback, useLayoutEffect, useState } from 'react';
import { readSidebarCollapsed } from '@/lib/sidebarStorage';
import { Sidebar } from './Sidebar';
import { ChatWidget } from '../chat/ChatWidget';
import { usePermissions } from '@/hooks/usePermissions';
import { useLogout } from '@/hooks/useLogout';
import { useNativeWebRTCCall } from '@/hooks/useNativeWebRTCCall';
import { useChatSounds } from '@/hooks/useChatSounds';
import { NativeCallOverlay } from '@/components/conversas/NativeCallOverlay';
import { NativeCallProvider } from '@/contexts/NativeCallContext';

interface MainLayoutProps {
  children: React.ReactNode;
  userRole: 'EMPLOYEE';
  userName: string;
  /** Opcional: se omitido, usa logout padrão (limpa sessão e vai para /auth/login). */
  onLogout?: () => void;
}

export function MainLayout({ children, userRole, userName, onLogout }: MainLayoutProps) {
  const defaultLogout = useLogout();
  const handleLogout = onLogout ?? defaultLogout;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [layoutSynced, setLayoutSynced] = useState(false);
  const { user } = usePermissions();
  const nativeCall = useNativeWebRTCCall({ userId: user?.id });
  useChatSounds({ userId: user?.id, callPhase: nativeCall.phase });

  useLayoutEffect(() => {
    setIsCollapsed(readSidebarCollapsed());
    setLayoutSynced(true);
  }, []);

  const handleMenuToggle = useCallback((collapsed: boolean) => {
    setIsCollapsed((prev) => (prev === collapsed ? prev : collapsed));
  }, []);

  return (
    <NativeCallProvider value={nativeCall}>
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar 
        userRole={userRole} 
        userName={userName} 
        onLogout={handleLogout}
        onMenuToggle={handleMenuToggle}
      />
      
      {/* Main Content */}
      <div
        className={`${
          layoutSynced ? 'transition-all duration-300 ease-in-out' : ''
        } ${isCollapsed ? 'lg:ml-20' : 'lg:ml-[23rem]'}`}
      >
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* Chat Widget */}
      <ChatWidget />

        <NativeCallOverlay
          call={nativeCall}
          localAvatarUrl={user?.profilePhotoUrl ?? null}
          localDisplayName={user?.name ?? null}
        />
      </div>
    </NativeCallProvider>
  );
}
