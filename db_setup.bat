@echo off
REM ═══════════════════════════════════════════════════════════════
REM  Omni-Queue 360 — PostgreSQL Local Setup Script
REM  Run this ONCE after installing PostgreSQL on Windows.
REM ═══════════════════════════════════════════════════════════════
SETLOCAL

REM ── Configuration ──────────────────────────────────────────────
SET PG_USER=postgres
SET PG_PASSWORD=postgres123
SET PG_HOST=127.0.0.1
SET PG_PORT=5432
SET DB_NAME=omniqueue
SET PGPASSWORD=%PG_PASSWORD%

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  Omni-Queue 360 — PostgreSQL Database Setup         ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM ── Check if psql is available ─────────────────────────────────
where psql >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] psql not found in PATH.
    echo     Trying common PostgreSQL install locations...
    
    REM Try common install paths
    if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\18\bin;%PATH%"
        echo     Found PostgreSQL 18
    ) else if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\17\bin;%PATH%"
        echo     Found PostgreSQL 17
    ) else if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\16\bin;%PATH%"
        echo     Found PostgreSQL 16
    ) else if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" (
        SET "PATH=C:\Program Files\PostgreSQL\15\bin;%PATH%"
        echo     Found PostgreSQL 15
    ) else (
        echo [ERROR] PostgreSQL is not installed or not found.
        echo         Please install PostgreSQL first from:
        echo         https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
        pause
        exit /b 1
    )
)

REM ── Test connection ────────────────────────────────────────────
echo [1/3] Testing PostgreSQL connection...
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -c "SELECT version();" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Cannot connect to PostgreSQL.
    echo         Make sure:
    echo           - PostgreSQL service is running
    echo           - Password for user '%PG_USER%' is '%PG_PASSWORD%'
    echo           - Port %PG_PORT% is correct
    pause
    exit /b 1
)
echo         OK — connected to PostgreSQL

REM ── Create database ────────────────────────────────────────────
echo [2/3] Creating database '%DB_NAME%'...
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -tc "SELECT 1 FROM pg_database WHERE datname = '%DB_NAME%'" | findstr "1" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo         Database '%DB_NAME%' already exists — skipping.
) else (
    psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -c "CREATE DATABASE %DB_NAME%;"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create database.
        pause
        exit /b 1
    )
    echo         Database '%DB_NAME%' created successfully.
)

REM ── Verify ─────────────────────────────────────────────────────
echo [3/3] Verifying database connection...
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -d %DB_NAME% -c "SELECT current_database(), current_user, version();"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Could not connect to database '%DB_NAME%'.
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  SUCCESS! PostgreSQL is ready.                      ║
echo ║                                                     ║
echo ║  Database: %DB_NAME%                            ║
echo ║  URL: postgres://postgres:postgres123@127.0.0.1:5432/omniqueue
echo ║                                                     ║
echo ║  Tables will be created automatically when you      ║
echo ║  start the backend with: npm start                  ║
echo ║                                                     ║
echo ║  To reset: run db_reset.bat                         ║
echo ║  To stop:  stop PostgreSQL service in Services      ║
echo ╚══════════════════════════════════════════════════════╝
echo.

pause
ENDLOCAL
