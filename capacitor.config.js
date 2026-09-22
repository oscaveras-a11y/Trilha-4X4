/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.trilha4x4.app',
  appName: 'Trilha 4X4',
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};

module.exports = config;
