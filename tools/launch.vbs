Option Explicit
Dim shell, fso, scriptDirectory, appRoot, runScript, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
appRoot = fso.GetParentFolderName(scriptDirectory)
runScript = fso.BuildPath(scriptDirectory, "run.ps1")
shell.CurrentDirectory = appRoot
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & runScript & """"
shell.Run command, 0, False
