@echo off
SET PowerShellScriptPath=%cd%\CreateShortcut.ps1

:: Install Python requirements
pip install -r requirements.txt

:: Execute the PowerShell script
powershell -ExecutionPolicy Bypass -NoProfile -File "%PowerShellScriptPath%"
