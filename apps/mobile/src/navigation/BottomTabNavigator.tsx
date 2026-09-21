import React, { useState } from 'react';
import { View, StyleSheet, Platform, Pressable, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { House, Fuel, CarFront, Inbox, Wrench, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../components/AppHeader';
import CreateActionFab from '../components/CreateActionFab';
import DraggablePunchFab from '../components/DraggablePunchFab';

import HomeScreen from '../screens/HomeScreen';
import FuelRequestsScreen from '../screens/FuelRequestsScreen';
import VehicleReservationsScreen from '../screens/VehicleReservationsScreen';
import DpRequestsScreen from '../screens/DpRequestsScreen';
import GestaoOsListScreen from '../screens/GestaoOsListScreen';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from '../context/ThemeContext';
import { type FabBarTabName } from './fabBarEvents';
import { useChromeVisibility } from './ChromeVisibilityContext';
import {
  getAndroidTabBarBottomPad,
  getAndroidTabBarHeight,
  getAndroidTabBarTopPad,
  getTabBarHeight,
  isSamsungDevice,
} from './tabBarLayout';
import ChromeAwareTabBar from './ChromeAwareTabBar';
import { wrapTabScreen } from './TabScreenTransition';

export type BottomTabParamList = {
  Home: undefined;
  Combustivel: undefined;
  Reservas: undefined;
  DpRequests: undefined;
  GestaoOs: undefined;
};

const NativeTab = createNativeBottomTabNavigator<BottomTabParamList>();
const AndroidTab = createBottomTabNavigator<BottomTabParamList>();

/** Só no iOS: fade entre abas (tab bar nativa não anima a troca de tela). */
const IosHome = wrapTabScreen(HomeScreen);
const IosCombustivel = wrapTabScreen(FuelRequestsScreen);
const IosReservas = wrapTabScreen(VehicleReservationsScreen);
const IosDpRequests = wrapTabScreen(DpRequestsScreen);
const IosGestaoOs = wrapTabScreen(GestaoOsListScreen);

const FAB_TABS = new Set<string>(['Combustivel', 'Reservas', 'DpRequests', 'GestaoOs']);

const LUCIDE_ICONS: Record<string, LucideIcon> = {
  Home: House,
  Combustivel: Fuel,
  Reservas: CarFront,
  DpRequests: Inbox,
  GestaoOs: Wrench,
};

function sfIcon(name: string) {
  return { type: 'sfSymbol' as const, name: name as any };
}

function useFabListeners(onTabChange?: (name: string) => void) {
  const chrome = useChromeVisibility();
  return ({ route }: any) => ({
    tabPress: () => {
      chrome?.reveal();
    },
    focus: () => {
      chrome?.reveal();
      onTabChange?.(route.name);
    },
  });
}

/** iPhone: UITabBar nativo + SF Symbols; some por completo com a navbar (sem pílula). */
function IosNativeTabs({ onTabChange }: { onTabChange: (name: string) => void }) {
  const { canSeeCombustivel, canSeeReservas, canSeeDpRequests, canSeeGestaoOs } = usePermissions();
  const { colors, isDark } = useTheme();
  const chrome = useChromeVisibility();
  const listeners = useFabListeners(onTabChange);
  const tabBarHidden = chrome?.visible === false;

  return (
    <NativeTab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? '#9ca3af' : '#6b7280',
        overrideScrollViewContentInsetAdjustmentBehavior: false,
        tabBarMinimizeBehavior: 'never',
        tabBarBlurEffect: isDark ? 'systemMaterialDark' : 'systemMaterial',
        // Esconde de verdade (não o minimize que vira bolinha).
        tabBarStyle: { display: tabBarHidden ? 'none' : 'flex' },
      }}
      screenListeners={listeners}
    >
      <NativeTab.Screen
        name="Home"
        component={IosHome}
        options={{
          title: 'Início',
          tabBarLabel: 'Início',
          tabBarIcon: sfIcon('house.fill'),
        }}
      />
      {canSeeCombustivel ? (
        <NativeTab.Screen
          name="Combustivel"
          component={IosCombustivel}
          options={{
            title: 'Abastecimento',
            tabBarLabel: 'Abastecimento',
            tabBarIcon: sfIcon('fuelpump.fill'),
          }}
        />
      ) : null}
      {canSeeReservas ? (
        <NativeTab.Screen
          name="Reservas"
          component={IosReservas}
          options={{
            title: 'Frota',
            tabBarLabel: 'Frota',
            tabBarIcon: sfIcon('car.fill'),
          }}
        />
      ) : null}
      {canSeeDpRequests ? (
        <NativeTab.Screen
          name="DpRequests"
          component={IosDpRequests}
          options={{
            title: 'Solicitações',
            tabBarLabel: 'Solicitações',
            tabBarIcon: sfIcon('tray.full.fill'),
          }}
        />
      ) : null}
      {canSeeGestaoOs ? (
        <NativeTab.Screen
          name="GestaoOs"
          component={IosGestaoOs}
          options={{
            title: 'Chamados',
            tabBarLabel: 'Chamados',
            tabBarIcon: sfIcon('wrench.and.screwdriver.fill'),
          }}
        />
      ) : null}
    </NativeTab.Navigator>
  );
}

/** Android: Lucide + some/volta animado com a navbar. */
function AndroidLucideTabs({ onTabChange }: { onTabChange: (name: string) => void }) {
  const { canSeeCombustivel, canSeeReservas, canSeeDpRequests, canSeeGestaoOs } = usePermissions();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const listeners = useFabListeners(onTabChange);
  const samsung = isSamsungDevice();
  const androidTopPad = getAndroidTabBarTopPad();
  const androidBottomPad = getAndroidTabBarBottomPad(insets.bottom);
  const androidTabBarH = getAndroidTabBarHeight(insets.bottom);
  const tabBarH = getTabBarHeight(insets.bottom);

  return (
    <AndroidTab.Navigator
      initialRouteName="Home"
      safeAreaInsets={{ top: 0, right: 0, left: 0, bottom: 0 }}
      tabBar={(props) => <ChromeAwareTabBar {...props} />}
      sceneContainerStyle={{ paddingBottom: tabBarH }}
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'none',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? '#9ca3af' : '#6b7280',
        tabBarActiveBackgroundColor: 'transparent',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingTop: 4,
          paddingHorizontal: 0,
        },
        tabBarAllowFontScaling: true,
        tabBarStyle: samsung
          ? {
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
              shadowOpacity: 0,
            }
          : {
              backgroundColor: isDark ? '#111827' : '#ffffff',
              borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
              borderTopWidth: StyleSheet.hairlineWidth,
              height: androidTabBarH,
              paddingTop: androidTopPad,
              paddingBottom: androidBottomPad,
              elevation: 0,
              shadowOpacity: 0,
            },
        tabBarButton: ({ href: _href, ...rest }) => (
          <Pressable {...rest} android_ripple={null} />
        ),
        tabBarIcon: ({ color }) => {
          const Icon = LUCIDE_ICONS[route.name] ?? House;
          return <Icon size={22} color={color} strokeWidth={1.85} />;
        },
      })}
      screenListeners={listeners}
    >
      <AndroidTab.Screen name="Home" component={HomeScreen} options={{ title: 'Início', tabBarLabel: 'Início' }} />
      {canSeeCombustivel ? (
        <AndroidTab.Screen
          name="Combustivel"
          component={FuelRequestsScreen}
          options={{
            title: 'Abastecimento',
            tabBarLabel: ({ color }) => (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={{
                  color,
                  fontSize: 10,
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 0,
                  textAlign: 'center',
                  width: '100%',
                  paddingHorizontal: 1,
                }}
              >
                Abastecimento
              </Text>
            ),
          }}
        />
      ) : null}
      {canSeeReservas ? (
        <AndroidTab.Screen
          name="Reservas"
          component={VehicleReservationsScreen}
          options={{ title: 'Frota', tabBarLabel: 'Frota' }}
        />
      ) : null}
      {canSeeDpRequests ? (
        <AndroidTab.Screen
          name="DpRequests"
          component={DpRequestsScreen}
          options={{ title: 'Solicitações', tabBarLabel: 'Solicitações' }}
        />
      ) : null}
      {canSeeGestaoOs ? (
        <AndroidTab.Screen
          name="GestaoOs"
          component={GestaoOsListScreen}
          options={{ title: 'Chamados', tabBarLabel: 'Chamados' }}
        />
      ) : null}
    </AndroidTab.Navigator>
  );
}

export default function BottomTabNavigator() {
  const { canSeePonto } = usePermissions();
  const [activeTab, setActiveTab] = useState('Home');
  const showCreateFab = FAB_TABS.has(activeTab);

  return (
    <View style={styles.root}>
      <AppHeader />
      {Platform.OS === 'ios' ? (
        <IosNativeTabs onTabChange={setActiveTab} />
      ) : (
        <AndroidLucideTabs onTabChange={setActiveTab} />
      )}
      {showCreateFab ? <CreateActionFab tab={activeTab as FabBarTabName} /> : null}
      {canSeePonto ? <DraggablePunchFab /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
});
