@echo off
SET PowerShellScriptPath=%cd%\CreateShortcut.ps1

:: Install Python requirements
pip install -r %cd%\requirements.txt

:: Execute the PowerShell script
powershell -ExecutionPolicy Bypass -NoProfile -File "%PowerShellScriptPath%"
