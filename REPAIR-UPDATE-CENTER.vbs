Option Explicit
On Error Resume Next
Dim fso, sh, ws, script, args, power, work
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Shell.Application")
Set ws = CreateObject("WScript.Shell")
script = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "repair-update-center.ps1")
If Not fso.FileExists(script) Then
  MsgBox "Extract the whole ZIP before running the repair.", vbCritical, "HealthCheck Update Center Repair"
  WScript.Quit 2
End If
power = ws.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
work = ws.ExpandEnvironmentStrings("%SystemRoot%")
args = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """"
sh.ShellExecute power, args, work, "runas", 0
If Err.Number <> 0 Then
  MsgBox "Cannot launch repair: " & Err.Description, vbCritical, "HealthCheck Update Center Repair"
  WScript.Quit 1
End If
