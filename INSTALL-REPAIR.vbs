Option Explicit
Dim fso, shell, launcher, result
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
launcher = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "tools\start-production-installer.vbs")
If Not fso.FileExists(launcher) Then
  MsgBox "Installer files are incomplete. Please extract the ZIP completely.", vbCritical, "Health Check Up Smart Search"
  WScript.Quit 2
End If
result = shell.Run("wscript.exe """ & launcher & """", 0, True)
WScript.Quit result
