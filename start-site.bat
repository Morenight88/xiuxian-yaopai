@echo off
title XiuXian Also Films - local server
set "HERE=%~dp0"
set "PORT=8123"
if "%~1" neq "" set "PORT=%~1"

echo.
echo   XiuXian Also Films  /  xiuxian-yaopai
echo   starting local server (port %PORT%, auto-shifts if busy)
echo   keep this window open - close it or press Ctrl+C to stop
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%serve.ps1" %PORT%

echo.
echo   server stopped.
pause
