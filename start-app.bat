@echo off
echo Iniciando BIM Clash Report...

REM Iniciar Docker Desktop si no está corriendo
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
timeout /t 20 /nobreak >nul

REM Levantar n8n
cd /d C:\Users\borre\Desktop\n8n
docker --context desktop-linux compose up -d

REM Servir la app en puerto 4173
cd /d "D:\BIM EDGE SOLUTIONS\08_WEB\clash-report"
npx serve dist -p 4173

pause
