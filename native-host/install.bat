@echo off
REM Hovpn installer for Windows. Thin wrapper around the cross-platform Node
REM installer. Usage: install.bat  (no arguments needed by default)
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is required but was not found on PATH.
  echo Install it from https://nodejs.org and re-run this installer.
  exit /b 1
)
node "%~dp0install.js" %*
