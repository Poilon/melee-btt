param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$StatusFile,[Parameter(Mandatory=$true)][int]$OwnerPid)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class LaunchWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle,int command);
}
'@
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner=Get-Process -Id $OwnerPid -ErrorAction Stop
$form=New-Object System.Windows.Forms.Form
$form.Text='Custom Melee BTT - Loading'
$form.ClientSize=New-Object System.Drawing.Size(620,290)
$form.FormBorderStyle='FixedDialog';$form.ControlBox=$false;$form.StartPosition='Manual'
$screen=[System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position).WorkingArea
$form.Location=New-Object System.Drawing.Point(($screen.Left+($screen.Width-$form.Width)/2),($screen.Top+($screen.Height-$form.Height)/2))
$form.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#101620')
$form.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#edf1f7')
$icon=Join-Path $Root 'assets\dolphin\target.ico';if(Test-Path $icon){$form.Icon=New-Object System.Drawing.Icon($icon)}
function Label([string]$Text,[int]$Y,[int]$Size,[string]$Color,[int]$Height=32){
 $l=New-Object System.Windows.Forms.Label;$l.Text=$Text;$l.Location=New-Object System.Drawing.Point(28,$Y);$l.Size=New-Object System.Drawing.Size(564,$Height)
 $l.Font=New-Object System.Drawing.Font('Segoe UI',$Size);$l.ForeColor=[System.Drawing.ColorTranslator]::FromHtml($Color);$form.Controls.Add($l);return $l
}
$brand=Label 'CUSTOM MELEE BTT  /  BETA' 24 10 '#ffcf72'
$heading=Label 'Getting your game ready' 60 24 '#edf1f7' 45
$status=Label 'Preparing your game...' 126 12 '#edf1f7' 46
$bar=New-Object System.Windows.Forms.ProgressBar;$bar.Location=New-Object System.Drawing.Point(28,184);$bar.Size=New-Object System.Drawing.Size(564,6);$bar.Style='Marquee';$bar.MarqueeAnimationSpeed=25;$form.Controls.Add($bar)
$detail=Label 'The first launch builds your levels. Later launches reuse them.' 209 10 '#b7c2d3'
$elapsed=Label 'Dolphin will open automatically.' 245 9 '#93a0b3'
$started=[DateTime]::UtcNow;$script:lastMessage=$null
$timer=New-Object System.Windows.Forms.Timer;$timer.Interval=200
$timer.Add_Tick({
 if($owner.HasExited){$form.Close();return}
 try{$state=Get-Content -LiteralPath $StatusFile -Raw -Encoding UTF8|ConvertFrom-Json}catch{return}
 if($state.message-ne $script:lastMessage){
  $script:lastMessage=$state.message
  if($state.message){$status.Text=$state.message;$form.Show();[void][LaunchWindow]::ShowWindow($form.Handle,5)}else{$form.Hide()}
 }
 $seconds=[int]([DateTime]::UtcNow-$started).TotalSeconds
 $elapsed.Text="Dolphin will open automatically.  Elapsed: $($seconds)s"
})
$form.Add_Shown({[void][LaunchWindow]::ShowWindow($form.Handle,5);$timer.Start()})
try{[System.Windows.Forms.Application]::Run($form)}finally{$timer.Dispose();$form.Dispose();$owner.Dispose()}
