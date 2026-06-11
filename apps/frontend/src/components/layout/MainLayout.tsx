'use client';

import React, { useCallback, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  readSidebarCollapsed,
  shouldForceSidebarCollapsed,
  SIDEBAR_TRANSITION_CLASS,
} from '@/lib/sidebarStorage';
import { Sidebar } from './Sidebar';
import { ChatWidget } from '../chat/ChatWidget';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
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

function resolveInitialSidebarCollapsed(pathname: string | null): boolean {
  if (shouldForceSidebarCollapsed(pathname)) return true;
  return readSidebarCollapsed();
}

export function MainLayout({ children, userRole, userName, onLogout }: MainLayoutProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const defaultLogout = useLogout();
  const handleLogout = onLogout ?? defaultLogout;
  const [isCollapsed, setIsCollapsed] = useState(() => resolveInitialSidebarCollapsed(pathname));
  const [layoutSynced, setLayoutSynced] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const { user } = usePermissions();
  const nativeCall = useNativeWebRTCCall({ userId: user?.id });
  useChatSounds({ userId: user?.id, callPhase: nativeCall.phase });

  useLayoutEffect(() => {
    setIsCollapsed(resolveInitialSidebarCollapsed(pathname));
    setLayoutSynced(true);
  }, [pathname]);

  const handleMenuToggle = useCallback((collapsed: boolean) => {
    setIsCollapsed((prev) => (prev === collapsed ? prev : collapsed));
  }, []);

  const handleOpenChangePassword = useCallback(() => {
    setIsChangePasswordOpen(true);
  }, []);

  const isFullBleedRoute = pathname != null && (pathname === '/ponto/conversas' || pathname.startsWith('/ponto/conversas/'));

  return (
    <NativeCallProvider value={nativeCall}>
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar 
        userRole={userRole} 
        userName={userName} 
        onLogout={handleLogout}
        onMenuToggle={handleMenuToggle}
        onOpenChangePassword={handleOpenChangePassword}
      />
      
      {/* Main Content — mesma duração/easing do painel tier 2 da sidebar */}
      <div
        className={`${
          layoutSynced ? `transition-[margin-left] ${SIDEBAR_TRANSITION_CLASS}` : ''
        } ${isCollapsed ? 'lg:ml-20' : 'lg:ml-[23rem]'}`}
      >
        <main className={isFullBleedRoute ? 'p-0' : 'p-4 lg:p-8'}>
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

        <ChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
          onSuccess={() => {
            setIsChangePasswordOpen(false);
            queryClient.invalidateQueries({ queryKey: ['user'] });
          }}
        />
      </div>
    </NativeCallProvider>
  );
}
