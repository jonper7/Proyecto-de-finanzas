@echo off
REM filepath: E:\Personal\Python\py_personal\finanzas_personales\run.bat

cd /d "%~dp0"

start "Finanzas Backend" /d "%~dp0backend" "%~dp0.venv\Scripts\python.exe" "%~dp0backend\run.py"

timeout /t 2 /nobreak >nul
start "" "%~dp0web\finanzas-dashboard.html"