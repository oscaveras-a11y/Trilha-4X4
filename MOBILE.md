# Trilha 4X4 — Mobile (Capacitor)

Este projeto mantém o servidor Node/Express e a interface web/PWA existentes e adiciona uma camada nativa com Capacitor.

## Objetivo

Gerar aplicativos Android e iOS a partir da interface existente sem substituir o backend. O servidor/API continua separado do aplicativo instalado.

## Preparação

Depois de atualizar o repositório:

```powershell
npm.cmd install --ignore-scripts
cd node_modules\better-sqlite3
node-gyp.cmd rebuild
cd ..\..
```

No Windows, o Android pode ser criado/testado com Android Studio. O projeto iOS exige macOS/Xcode para compilar e assinar.

## Criar as plataformas pela primeira vez

```powershell
npx.cmd cap add android
npx.cmd cap sync android
```

No macOS:

```bash
npx cap add ios
npx cap sync ios
```

Depois de alterar arquivos em `public/`, sincronize novamente:

```powershell
npm.cmd run mobile:sync
```

## Backend

Não fixe um endereço `trycloudflare.com` no aplicativo: Quick Tunnels são temporários. Antes de distribuir APK/TestFlight/App Store, configure uma URL HTTPS permanente para a API/servidor.

## Importante

A camada Capacitor não substitui o PWA. A versão web continua funcionando normalmente. Android/iOS são clientes adicionais do mesmo projeto.
