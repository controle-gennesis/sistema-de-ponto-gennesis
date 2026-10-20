import { createNavigationContainerRef } from '@react-navigation/native';

/** Permite navegar fora de componentes (ex.: ao tocar numa notificação push). */
export const navigationRef = createNavigationContainerRef<any>();
