@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   TRILHA 4X4 - PREPARAR MOBILE
echo ========================================
echo.

call npm.cmd install --ignore-scripts
if errorlevel 1 goto :erro

if exist node_modules\better-sqlite3 (
  pushd node_modules\better-sqlite3
  call node-gyp.cmd rebuild
  if errorlevel 1 (
    popd
    goto :erro
  )
  popd
)

call npm.cmd run check
if errorlevel 1 goto :erro

call npm.cmd run test:e2e10
if errorlevel 1 goto :erro

echo.
echo Base mobile instalada e testes aprovados.
echo Para criar Android pela primeira vez:
echo   npx.cmd cap add android
echo   npx.cmd cap sync android
echo.
exit /b 0

:erro
echo.
echo ERRO: a preparacao nao foi concluida.
exit /b 1
