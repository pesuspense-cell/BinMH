@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=%ProgramFiles%\cursor\resources\app\resources\helpers\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" server.js --open
