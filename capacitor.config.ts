import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'voice-recorder',
  webDir: 'www',
  server: {
    androidScheme: 'http' // <--- Ito ang mag-aalis ng HTTPS/HTTP conflict
  }
};

export default config;