@echo off
echo Iniciando BIM Edge Clash Report...

:: Iniciar Docker Desktop
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Esperando Docker Desktop...
timeout /t 25 /nobreak >nul

:: Iniciar n8n
cd /d C:\Users\borre\Desktop\n8n
docker --context desktop-linux compose up -d

:: Liberar puerto 4173 si está ocupado
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4173 ^| findstr LISTENING 2^>nul') do taskkill /PID %%a /F >nul 2>&1

:: Abrir navegador y servir la app
cd /d "D:\BIM EDGE SOLUTIONS\08_WEB\clash-report"
start "" "http://localhost:4173"
timeout /t 2 /nobreak >nul
npx serve dist -p 4173
