@echo off
REM ═══════════════════════════════════════════════════════════════
REM  PostgreSQL Service Control - Start / Stop / Status
REM  Run as Administrator!
REM ═══════════════════════════════════════════════════════════════
SETLOCAL

echo.
echo ╔══════════════════════════════════════════════════════�-
echo ║  PostgreSQL Service Control                         ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM ── Find the PostgreSQL service name ───────────────────────────
for /f "tokens=*" %%i in ('sc query type^= service state^= all ^| findstr /i "postgresql"') do (
    for /f "tokens=2" %%j in ("%%i") do set PG_SERVICE=%%j
)

if not defined PG_SERVICE (
    echo [!] Could not find PostgreSQL service automatically.
    echo     Common service names: postgresql-x64-15, postgresql-x64-16, postgresql-x64-17
    set /p PG_SERVICE="Enter your PostgreSQL service name: "
)

echo Found service: %PG_SERVICE%
echo.

REM ── Show current status ────────────────────────────────────────
sc query %PG_SERVICE% | findstr "STATE"
echo.

echo Choose an action:
echo   [1] Start PostgreSQL
echo   [2] Stop PostgreSQL
echo   [3] Restart PostgreSQL
echo   [4] Check Status only
echo   [5] Disable auto-start (won't start on boot)
echo   [6] Enable auto-start (starts on boot)
echo.
set /p ACTION="Enter choice (1-6): "

if "%ACTION%"=="1" (
    echo Starting %PG_SERVICE%...
    net start %PG_SERVICE%
) else if "%ACTION%"=="2" (
    echo Stopping %PG_SERVICE%...
    net stop %PG_SERVICE%
) else if "%ACTION%"=="3" (
    echo Restarting %PG_SERVICE%...
    net stop %PG_SERVICE%
    timeout /t 2 /nobreak >nul
    net start %PG_SERVICE%
) else if "%ACTION%"=="4" (
    sc query %PG_SERVICE%
) else if "%ACTION%"=="5" (
    echo Disabling auto-start...
    sc config %PG_SERVICE% start= demand
    echo PostgreSQL will NOT start automatically on boot.
    echo Use this script to start it manually when needed.
) else if "%ACTION%"=="6" (
    echo Enabling auto-start...
    sc config %PG_SERVICE% start= auto
    echo PostgreSQL will start automatically on boot.
) else (
    echo Invalid choice.
)

echo.
pause
ENDLOCAL
