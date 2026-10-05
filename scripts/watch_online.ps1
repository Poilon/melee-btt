param([Parameter(Mandatory=$true)][int]$DolphinPid,[Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root)
if(!(Test-Path (Join-Path $Root 'User\.ttrc-custom-stage'))){throw 'Not a TTRC custom profile'}
$p=Get-Process -Id $DolphinPid
if($p.Path -ne (Join-Path $Root 'Slippi Dolphin.exe')){throw 'Wrong Dolphin instance'}
Add-Type -Path (Join-Path $PSScriptRoot 'OnlineMemory.cs')
Add-Type -Path (Join-Path $PSScriptRoot 'DolphinReader.cs')
$memory=$null;$reader=$null;$tick=0;$pending=[OnlineMemory]::NextInput()
try{
 while(!$p.HasExited){
  try{
   if(!$memory){$memory=New-Object OnlineMemory($DolphinPid);$reader=New-Object DolphinReader($DolphinPid)}
   if($pending.IsCompleted){
    $line=$pending.Result;if($null -eq $line){break}
    $reply=$line|ConvertFrom-Json
    $null=$memory.Reply([uint32]$reply.address,[uint32]$reply.sequence,[string]$reply.bytes)
    $pending=[OnlineMemory]::NextInput()
   }
   $tick++;$memory.Heartbeat([uint32]$tick)
   $snapshot=$memory.Snapshot()
   $sample=$reader.Sample($DolphinPid)
   [Console]::Out.WriteLine('{"type":"tick","mailbox":'+($(if($snapshot){'"'+$snapshot+'"'}else{'null'}))+',"sample":'+($(if($sample){$sample}else{'null'}))+'}')
  }catch{if($memory){$memory.Dispose();$memory=$null};if($reader){$reader.Dispose();$reader=$null};[Console]::Out.WriteLine('{"type":"waiting"}');Start-Sleep -Milliseconds 500}
  Start-Sleep -Milliseconds 50;$p.Refresh()
 }
}finally{if($memory){$memory.Dispose()};if($reader){$reader.Dispose()}}
