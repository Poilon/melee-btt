param([Parameter(Mandatory=$true)][int]$ReplayPid,[Parameter(Mandatory=$true)][string]$Root,[int]$ParentPid=0)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root)
$viewer=Get-Process -Id $ReplayPid
if($viewer.Path -ne (Join-Path $Root 'Playback\Slippi Dolphin.exe')){throw 'Wrong replay instance'}
Add-Type -Path (Join-Path $PSScriptRoot 'DolphinReader.cs')
Add-Type @'
using System;using System.Runtime.InteropServices;
public class WorldReplayWindow{
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool SetWindowText(IntPtr h,string text);
}
'@
$reader=$null;$played=$false;$ended=0
try{
 while(!$viewer.HasExited){
  if($ParentPid -gt 0 -and !(Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)){break}
  try{
   if(!$reader){$reader=New-Object DolphinReader($ReplayPid)}
   $s=$reader.Sample($ReplayPid)|ConvertFrom-Json
   if($s.major -eq 14 -and $s.minor -eq 1 -and $s.stageId -ge 40 -and $s.stageId -le 65){$played=$true}
   if($played -and $s.major -eq 14 -and $s.minor -eq 3){$ended++}else{$ended=0}
   if($viewer.MainWindowHandle -ne [IntPtr]::Zero){[WorldReplayWindow]::SetWindowText($viewer.MainWindowHandle,'TTRC - Replay')|Out-Null}
   if($ended -ge 5){break}
  }catch{if($reader){$reader.Dispose();$reader=$null}}
  Start-Sleep -Milliseconds 200;$viewer.Refresh()
 }
}finally{
 if($reader){$reader.Dispose()}
 if(!$viewer.HasExited){$viewer.CloseMainWindow()|Out-Null}
 if($ParentPid -gt 0){
  $parent=Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
  if($parent -and $parent.Path -eq (Join-Path $Root 'Slippi Dolphin.exe')){[WorldReplayWindow]::SetForegroundWindow($parent.MainWindowHandle)|Out-Null}
 }
}
