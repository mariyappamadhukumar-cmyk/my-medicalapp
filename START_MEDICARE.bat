@echo off
color 0A
title MediCare Platform Launcher
echo.
echo ========================================
echo    MEDICARE PLATFORM LAUNCHER
echo ========================================
echo.
echo Starting Backend Server...
echo.

cd /d "%~dp0BACKEND"

echo Checking if server is already running...
curl -s http://localhost:5000/health >nul 2>&1
if %errorlevel% == 0 (
    echo.
    echo [SUCCESS] Server is already running!
    echo.
) else (
    echo.
    echo [INFO] Starting server in new window...
    start "MediCare Backend Server" cmd /k "node server.js"
    echo [INFO] Waiting 3 seconds for server to start...
    timeout /t 3 /nobreak >nul
)

echo.
echo ========================================
echo    SERVER STATUS
echo ========================================
curl -s http://localhost:5000/health
echo.
echo.
echo ========================================
echo    OPENING WELCOME PAGE
echo ========================================
echo.

cd /d "%~dp0"
start CLICK_HERE_FIRST.html

echo.
echo [SUCCESS] Platform launched!
echo.
echo - Backend Server: http://localhost:5000
echo - Frontend Pages: Opening in browser...
echo.
echo Press any key to exit this window...
pause >nul
