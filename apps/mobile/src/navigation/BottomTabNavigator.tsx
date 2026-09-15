import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import FloatingTabBar from './FloatingTabBar';
import AppHeader from '../components/AppHeader';

import HomeScreen from '../screens/HomeScreen';
import FuelRequestsScreen from '../screens/FuelRequestsScreen';
import VehicleReservationsScreen from '../screens/VehicleReservationsScreen';
import DpRequestsScreen from '../screens/DpRequestsScreen';
import GestaoOsListScreen from '../screens/GestaoOsListScreen';
import DraggablePunchFab from '../components/DraggablePunchFab';
import { usePermissions } from '../hooks/usePermissions';

export type BottomTabParamList = {
  Home: undefined;
  Combustivel: undefined;
  Reservas: undefined;
  DpRequests: undefined;
  GestaoOs: undefined;
};

const Tab = createMaterialTopTabNavigator<BottomTabParamList>();

export default function BottomTabNavigator() {
  const { canSeeCombustivel, canSeeReservas, canSeeDpRequests, canSeePonto, canSeeGestaoOs } =
    usePermissions();

  return (
    <View style={styles.root}>
      {/* Header fixo fora do pager — não some ao arrastar entre abas */}
      <AppHeader />
      <Tab.Navigator
        initialRouteName="Home"
        tabBarPosition="bottom"
        tabBar={(props) => <FloatingTabBar {...props} />}
        sceneContainerStyle={{
          backgroundColor: 'transparent',
        }}
        screenOptions={{
          swipeEnabled: true,
          lazy: true,
          animationEnabled: true,
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Início' }} />
        {canSeeCombustivel ? (
          <Tab.Screen
            name="Combustivel"
            component={FuelRequestsScreen}
            options={{ title: 'Abastecimento' }}
          />
        ) : null}
        {canSeeReservas ? (
          <Tab.Screen
            name="Reservas"
            component={VehicleReservationsScreen}
            options={{ title: 'Frota' }}
          />
        ) : null}
        {canSeeDpRequests ? (
          <Tab.Screen
            name="DpRequests"
            component={DpRequestsScreen}
            options={{ title: 'Solicitações' }}
          />
        ) : null}
        {canSeeGestaoOs ? (
          <Tab.Screen
            name="GestaoOs"
            component={GestaoOsListScreen}
            options={{ title: 'Chamados' }}
          />
        ) : null}
      </Tab.Navigator>
      {canSeePonto ? <DraggablePunchFab /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
