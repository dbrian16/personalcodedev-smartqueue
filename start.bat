@echo off
title Omni-Queue 360 - Management Console
color 0A

echo ===================================================
echo     OMNI-QUEUE 360 - SYSTEM STARTUP SCRIPT
echo ===================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [!] Node.js was not found on PATH.
    echo     Install Node.js 20 LTS or newer, then run this script again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [!] Dependencies are not installed yet.
    echo     Run:  npm run setup
    echo.
    pause
    exit /b 1
)

echo [1/3] Freeing the ports this system uses...
for %%p in (3100 3101 3103 5001 5100) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
)
echo   Done.
echo.

echo [2/3] Building shared UI components...
call npm run build:shared
echo.

echo [3/3] Starting microservices and front ends...
echo.
echo ===================================================
echo   SERVICES ARE BOOTING UP... PLEASE WAIT
echo ===================================================
echo - Kiosk App:         http://localhost:3100
echo - Management Dash:   http://localhost:3101
echo - Online Portal:     http://localhost:3103
echo - API Server:        http://localhost:5100
echo - AI Engine (Py):    http://localhost:5001
echo ===================================================
echo.
echo   No Redis, PostgreSQL or Docker is required.
echo   Without them the backend keeps queue state in memory,
echo   which is lost on restart. See SETUP.md.
echo.
echo Press Ctrl+C at any time to stop all services.
echo.

call npm start

pause
