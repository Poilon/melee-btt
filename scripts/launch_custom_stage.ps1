param([Parameter(Mandatory=$true)][string]$Executable,[string]$Iso,[switch]$CheckOnly,[switch]$SecondaryDisplay)
$ErrorActionPreference='Stop'
$existing=Get-CimInstance Win32_Process -Filter "name = 'Slippi Dolphin.exe'" | Where-Object {$_.ExecutablePath -eq $Executable} | Select-Object -First 1
if($existing){[Console]::WriteLine('{"status":"already-running"}');exit}
if($CheckOnly){[Console]::WriteLine('{"status":"stopped"}');exit}
if(!(Test-Path -LiteralPath $Iso -PathType Leaf)){throw 'Course ISO missing'}
if($SecondaryDisplay){
 Add-Type -AssemblyName System.Windows.Forms
 $screen=[System.Windows.Forms.Screen]::AllScreens|Where-Object {!$_.Primary}|Select-Object -First 1
 if($screen){
  $config=Join-Path (Split-Path $Executable) 'User\Config\Dolphin.ini'
  $text=Get-Content -LiteralPath $config -Raw
  foreach($key in @('MainWindowPosX','RenderWindowXPos')){$text=[regex]::Replace($text,('(?m)^'+$key+' = [^\r\n]*'),($key+' = '+($screen.WorkingArea.X+20)))}
  foreach($key in @('MainWindowPosY','RenderWindowYPos')){$text=[regex]::Replace($text,('(?m)^'+$key+' = [^\r\n]*'),($key+' = '+($screen.WorkingArea.Y+20)))}
  Set-Content -LiteralPath $config -Value $text
 }
}
$dolphin=Start-Process -FilePath $Executable -WorkingDirectory (Split-Path $Executable) -ArgumentList @('--exec',('"'+$Iso+'"')) -PassThru
$deadline=[DateTime]::UtcNow.AddSeconds(20)
do{
 Start-Sleep -Milliseconds 150;$dolphin.Refresh()
 if($dolphin.HasExited){throw 'Course Dolphin could not start'}
}while($dolphin.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
[Console]::WriteLine('{"status":"started"}')
