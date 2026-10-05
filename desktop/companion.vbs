Option Explicit
Dim shell, files, root, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
command = Chr(34) & root & "\runtime\node\node.exe" & Chr(34) & " " & Chr(34) & root & "\desktop\native.mjs" & Chr(34) & " --open"
If shell.Run(command, 0, True) <> 0 Then
  MsgBox "Could not start Custom Melee BTT Companion. Check .local\startup.log in your Custom Melee BTT folder.", vbExclamation, "Custom Melee BTT Companion Beta"
End If
