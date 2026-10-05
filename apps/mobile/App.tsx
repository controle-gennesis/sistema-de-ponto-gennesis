import React from 'react';
import { View, Platform, Animated, Easing, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppToastHost, RootOverlayToastHost } from './src/components/AppToast';

import LoginScreen from './src/screens/LoginScreen';
import PunchScreen from './src/screens/PunchScreen';
import TimeRecordsScreen from './src/screens/TimeRecordsScreen';
import FuelRequestsScreen from './src/screens/FuelRequestsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PncpLicitacoesScreen from './src/screens/PncpLicitacoesScreen';
import AgendaScreen from './src/screens/AgendaScreen';
import KanbanBoardsScreen from './src/screens/kanban/KanbanBoardsScreen';
import KanbanBoardScreen from './src/screens/kanban/KanbanBoardScreen';
import KanbanCardScreen from './src/screens/kanban/KanbanCardScreen';
import DpRequestsScreen from './src/screens/DpRequestsScreen';
import GestaoOsDetailScreen from './src/screens/GestaoOsDetailScreen';
import GestaoOsQrScreen from './src/screens/GestaoOsQrScreen';
import GestaoOsUnplannedScreen from './src/screens/GestaoOsUnplannedScreen';
import FieldAssistantScreen from './src/screens/FieldAssistantScreen';
import AuthBrandSplash, { SPLASH_BG } from './src/components/AuthBrandSplash';
import ThemeBackground from './src/components/ThemeBackground';

import BottomTabNavigator from './src/navigation/BottomTabNavigator';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { NotificationsProvider } from './src/notifications/NotificationsContext';
import { ChromeVisibilityProvider } from './src/navigation/ChromeVisibilityContext';
import NotificationsSheet from './src/components/NotificationsSheet';
import { useOfflineSync } from './src/hooks/useOfflineSync';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Punch: undefined;
  TimeRecords: undefined;
  FuelRequests: undefined;
  Profile: undefined;
  Pncp: undefined;
  Agenda: { mode?: 'agenda' | 'tasks' } | undefined;
  KanbanBoards: undefined;
  KanbanBoard: { departmentKey?: string; title?: string };
  KanbanCard: { cardId: string; departmentKey?: string };
  DpRequests: undefined;
  GestaoOsDetail: { id: string };
  GestaoOsQr: { token: string };
  GestaoOsUnplanned: undefined;
  FieldAssistant: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

const MIN_SPLASH_MS = 1600;

function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const { isDark } = useTheme();
  const [minSplashDone, setMinSplashDone] = React.useState(false);
  const [bootFade] = React.useState(() => new Animated.Value(1));
  const [showBootSplash, setShowBootSplash] = React.useState(true);

  const navigationTheme = React.useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
          // Precisa ser transparente pra o ThemeBackground (padrão engenharia) aparecer
          // atrás das telas.
          background: 'transparent',
          card: 'transparent',
      },
    };
  }, [isDark]);

  React.useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  const bootReady = minSplashDone && !loading;

  React.useEffect(() => {
    if (!bootReady || !showBootSplash) return;

    if (isAuthenticated) {
      Animated.timing(bootFade, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setShowBootSplash(false));
      return;
    }

    // Login: tira o splash sem fade (o Login já começa com a mesma frame).
    // Assim a logo não “pula” na passagem.
    setShowBootSplash(false);
  }, [bootReady, bootFade, isAuthenticated, showBootSplash]);

  if (showBootSplash && !bootReady) {
    return <AuthBrandSplash />;
  }

  // Autenticado ainda com splash sumindo
  if (showBootSplash && isAuthenticated) {
    return (
      <ThemeBackground>
        <View style={{ flex: 1 }}>
          <NavigationContainer theme={navigationTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Main" component={BottomTabNavigator} />
            </Stack.Navigator>
          </NavigationContainer>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: bootFade,
              zIndex: 50,
            }}
          >
            <AuthBrandSplash />
          </Animated.View>
        </View>
      </ThemeBackground>
    );
  }

  const shell = (
    <View style={{ flex: 1, backgroundColor: isAuthenticated ? 'transparent' : SPLASH_BG }}>
      <NavigationContainer theme={navigationTheme}>
        {isAuthenticated ? (
          <>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: 'transparent',
                },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="Main" component={BottomTabNavigator} />
              <Stack.Screen name="Punch" component={PunchScreen} />
              <Stack.Screen name="TimeRecords" component={TimeRecordsScreen} />
              <Stack.Screen name="FuelRequests" component={FuelRequestsScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="Pncp" component={PncpLicitacoesScreen} />
              <Stack.Screen name="Agenda" component={AgendaScreen} />
              <Stack.Screen name="KanbanBoards" component={KanbanBoardsScreen} />
              <Stack.Screen name="KanbanBoard" component={KanbanBoardScreen} />
              <Stack.Screen name="KanbanCard" component={KanbanCardScreen} />
              <Stack.Screen name="DpRequests" component={DpRequestsScreen} />
              <Stack.Screen name="GestaoOsDetail" component={GestaoOsDetailScreen} />
              <Stack.Screen name="GestaoOsQr" component={GestaoOsQrScreen} />
              <Stack.Screen name="GestaoOsUnplanned" component={GestaoOsUnplannedScreen} />
              <Stack.Screen name="FieldAssistant" component={FieldAssistantScreen} />
            </Stack.Navigator>
            <NotificationsSheet />
          </>
        ) : (
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: SPLASH_BG,
              },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Login">
              {() => <LoginScreen fromBootSplash />}
            </Stack.Screen>
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </View>
  );

  if (isAuthenticated) {
    return <ThemeBackground>{shell}</ThemeBackground>;
  }

  return shell;
}

function OfflineSyncHost() {
  const { isAuthenticated } = useAuth();
  useOfflineSync(isAuthenticated);
  return null;
}

function StatusBarComponent() {
  const { isDark, colors } = useTheme();
  const { isAuthenticated, loading } = useAuth();
  const onAuthSurface = !loading && !isAuthenticated;
  const barStyle = onAuthSurface || isDark ? 'light' : 'dark';

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Status bar transparente pra o fundo do app aparecer atrás (vermelho no perfil, etc.)
    RNStatusBar.setTranslucent(true);
    RNStatusBar.setBackgroundColor('transparent', true);
    try {
      NavigationBar.setStyle(barStyle === 'light' ? 'light' : 'dark');
      // Fundo da navigation bar acompanha o tema (quando a API existir)
      void NavigationBar.setBackgroundColorAsync?.(
        onAuthSurface ? '#111827' : colors.appShell ?? colors.background ?? '#ffffff',
      );
    } catch {
      // Expo Go / plataformas sem suporte nativo
    }
  }, [barStyle, colors.appShell, colors.background, onAuthSurface]);

  return (
    <StatusBar
      style={barStyle}
      translucent
      backgroundColor="transparent"
    />
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <NotificationsProvider>
                <ChromeVisibilityProvider>
                  <OfflineSyncHost />
                  <AppNavigator />
                  <StatusBarComponent />
                  <AppToastHost />
                  <RootOverlayToastHost />
                </ChromeVisibilityProvider>
              </NotificationsProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
