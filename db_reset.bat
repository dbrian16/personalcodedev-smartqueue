@echo off
REM ═══════════════════════════════════════════════════════════════
REM  Omni-Queue 360 — Database Reset Script
REM  Drops and recreates the database for a clean test run.
REM ═══════════════════════════════════════════════════════════════
SETLOCAL

SET PG_USER=postgres
SET PG_PASSWORD=postgres123
SET PG_HOST=127.0.0.1
SET PG_PORT=5432
SET DB_NAME=omniqueue
SET PGPASSWORD=%PG_PASSWORD%

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  Omni-Queue 360 — Database Reset                    ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM ── Find psql ──────────────────────────────────────────────────
where psql >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\18\bin;%PATH%"
    ) else if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\17\bin;%PATH%"
    ) else if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\16\bin;%PATH%"
    ) else if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\15\bin;%PATH%"
    ) else (
        echo [ERROR] psql not found. Is PostgreSQL installed?
        pause
        exit /b 1
    )
)

echo [WARNING] This will DELETE ALL DATA in database '%DB_NAME%'.
echo.
set /p CONFIRM="Type 'yes' to confirm: "
if /i not "%CONFIRM%"=="yes" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo [1/3] Terminating active connections to '%DB_NAME%'...
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%DB_NAME%' AND pid <> pg_backend_pid();" >nul 2>&1

echo [2/3] Dropping database '%DB_NAME%'...
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -c "DROP DATABASE IF EXISTS %DB_NAME%;"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to drop database. Make sure no app is connected.
    pause
    exit /b 1
)

echo [3/3] Recreating database '%DB_NAME%'...
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -c "CREATE DATABASE %DB_NAME%;"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to create database.
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  DONE! Database reset complete.                     ║
echo ║                                                     ║
echo ║  All data cleared. Tables will be recreated         ║
echo ║  automatically when you restart the backend.        ║
echo ╚══════════════════════════════════════════════════════╝
echo.

pause
ENDLOCAL
