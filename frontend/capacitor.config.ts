/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.motioncare.app',
  appName: 'MotionCare',
  webDir: 'dist',
  backgroundColor: '#eef8f2',
  server: {
    hostname: '127.0.0.1',
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#15b66a',
      androidSplashResourceName: 'launch_splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
  },
}

export default config
