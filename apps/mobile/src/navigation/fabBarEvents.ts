import { DeviceEventEmitter, EmitterSubscription } from 'react-native';

export const FAB_BAR_PRESS = 'fabbar:press';
export const FAB_BAR_LONG_PRESS = 'fabbar:longpress';

export type FabBarTabName = 'Combustivel' | 'Reservas' | 'DpRequests' | 'GestaoOs';

export function emitFabBarPress(tab: FabBarTabName) {
  DeviceEventEmitter.emit(FAB_BAR_PRESS, tab);
}

export function emitFabBarLongPress(tab: FabBarTabName) {
  DeviceEventEmitter.emit(FAB_BAR_LONG_PRESS, tab);
}

export function onFabBarPress(
  tab: FabBarTabName,
  handler: () => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(FAB_BAR_PRESS, (pressed: FabBarTabName) => {
    if (pressed === tab) handler();
  });
}

export function onFabBarLongPress(
  tab: FabBarTabName,
  handler: () => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(FAB_BAR_LONG_PRESS, (pressed: FabBarTabName) => {
    if (pressed === tab) handler();
  });
}
