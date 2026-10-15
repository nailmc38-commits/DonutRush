@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or later is needed to run DonutRush.
  echo Download the LTS version at https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo ==============================================
echo           DONUTRUSH - STARTING
 echo ==============================================
echo.
echo Opening http://localhost:3000
start "" "http://localhost:3000/"
node server.mjs
echo.
echo The DonutRush server has stopped.
pause
