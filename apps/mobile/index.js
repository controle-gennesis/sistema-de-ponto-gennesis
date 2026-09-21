import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import App from './App';

// Mantém o splash nativo até o JS montar a mesma tela vermelha (evita flash cinza/escuro no Android).
SplashScreen.preventAutoHideAsync().catch(() => {});

registerRootComponent(App);
