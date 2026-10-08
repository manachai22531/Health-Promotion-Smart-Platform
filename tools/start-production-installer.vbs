Option Explicit
On Error Resume Next

Dim fso, shellApp, shell, scriptDir, rootDir, guiPath, logPath, args
Set fso = CreateObject("Scripting.FileSystemObject")
Set shellApp = CreateObject("Shell.Application")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
guiPath = fso.BuildPath(scriptDir, "production-installer-gui.ps1")
logPath = fso.BuildPath(rootDir, "installer-launcher.log")

If Not fso.FileExists(guiPath) Then
  MsgBox "Installer files are incomplete." & vbCrLf & vbCrLf & _
         "Please extract the ZIP completely before running INSTALL-REPAIR.bat." & vbCrLf & _
         "Missing: " & guiPath, vbCritical, "Health Check Up Smart Search"
  WScript.Quit 2
End If

args = "-NoProfile -ExecutionPolicy Bypass -STA -File """ & guiPath & """"
Err.Clear
shellApp.ShellExecute "powershell.exe", args, rootDir, "runas", 1

If Err.Number <> 0 Then
  Dim ts
  Set ts = fso.OpenTextFile(logPath, 8, True)
  ts.WriteLine Now & " ERROR " & Err.Number & ": " & Err.Description
  ts.Close
  MsgBox "Unable to start the Production installer." & vbCrLf & vbCrLf & _
         "Error: " & Err.Description & vbCrLf & _
         "Log: " & logPath, vbCritical, "Health Check Up Smart Search"
  WScript.Quit 1
End If

WScript.Quit 0
