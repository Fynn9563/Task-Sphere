@echo off
SET PowerShellScriptPath=%cd%\CreateShortcut.ps1
SET ShortcutPath=%USERPROFILE%\Desktop\Task Sphere.lnk

:: Check if the shortcut already exists
IF EXIST "%ShortcutPath%" (
    echo Shortcut already exists. Updating repository...
    git pull
    GOTO End
) ELSE (
    echo Shortcut does not exist. Installing requirements and creating shortcut...

    :: Install Python requirements
    pip install -r requirements.txt

    :: Execute the PowerShell script
    powershell -ExecutionPolicy Bypass -NoProfile -File "%PowerShellScriptPath%"
)

:End
