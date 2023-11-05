$WScriptShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ScriptPath = $PSScriptRoot
$Shortcut = $WScriptShell.CreateShortcut("$DesktopPath\Task Sphere.lnk")
$Shortcut.TargetPath = "$ScriptPath\Task Sphere.pyw"
$Shortcut.IconLocation = "$ScriptPath\Icon.ico"
$Shortcut.WorkingDirectory = $ScriptPath
$Shortcut.Save()
