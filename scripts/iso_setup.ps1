param([Parameter(Mandatory=$true)][string]$Root,[switch]$MissingSavedIso)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class IsoSetupWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
}
'@
[System.Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object System.Windows.Forms.Form
$form.Text='Custom Melee BTT - Game setup'
$form.ClientSize=New-Object System.Drawing.Size(620,400)
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$form.MinimizeBox=$false
$form.StartPosition='Manual'
$screen=[System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position).WorkingArea
$form.Location=New-Object System.Drawing.Point(($screen.Left+($screen.Width-$form.Width)/2),($screen.Top+($screen.Height-$form.Height)/2))
$form.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#101620')
$form.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#edf1f7')
$form.Font=New-Object System.Drawing.Font('Segoe UI',10)
$iconPath=Join-Path $Root 'assets\dolphin\target.ico'
if(Test-Path $iconPath){$form.Icon=New-Object System.Drawing.Icon($iconPath)}
function Add-Label([string]$Text,[int]$X,[int]$Y,[int]$Width,[int]$Height,[int]$Size,[string]$Color){
 $label=New-Object System.Windows.Forms.Label
 $label.Text=$Text;$label.Location=New-Object System.Drawing.Point($X,$Y);$label.Size=New-Object System.Drawing.Size($Width,$Height)
 $label.Font=New-Object System.Drawing.Font('Segoe UI',$Size)
 $label.ForeColor=[System.Drawing.ColorTranslator]::FromHtml($Color)
 $form.Controls.Add($label);return $label
}
$brand=Add-Label 'CUSTOM MELEE BTT  /  BETA' 28 24 560 24 10 '#ffcf72'
$heading=Add-Label 'Select your Melee ISO' 26 59 568 42 24 '#edf1f7'
$description=Add-Label 'Super Smash Bros. Melee - USA v1.02. An original, unmodified ISO is required.' 28 112 562 42 11 '#b7c2d3'
$pathBox=New-Object System.Windows.Forms.TextBox
$pathBox.Location=New-Object System.Drawing.Point(28,161);$pathBox.Size=New-Object System.Drawing.Size(564,26);$pathBox.ReadOnly=$true
$pathBox.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#1c2533');$pathBox.ForeColor=$form.ForeColor
$pathBox.Text='No file selected';$pathBox.TabStop=$false;$form.Controls.Add($pathBox)
function Add-Button([string]$Text,[int]$X,[int]$Y,[int]$Width){
 $button=New-Object System.Windows.Forms.Button;$button.Text=$Text
 $button.Location=New-Object System.Drawing.Point($X,$Y);$button.Size=New-Object System.Drawing.Size($Width,40)
 $button.FlatStyle='Flat';$button.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#243043');$button.ForeColor=$form.ForeColor
 $form.Controls.Add($button);return $button
}
$browse=Add-Button 'Choose ISO...' 28 203 174
$progress=New-Object System.Windows.Forms.ProgressBar
$progress.Location=New-Object System.Drawing.Point(28,256);$progress.Size=New-Object System.Drawing.Size(564,5);$progress.Visible=$false;$form.Controls.Add($progress)
$status=Add-Label 'We check the complete file checksum before the game can open.' 28 271 564 46 10 '#b7c2d3'
if($MissingSavedIso){$status.Text='Your saved ISO is missing or has changed. Select a valid Melee USA v1.02 ISO again.';$status.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#ffcf72')}
$note=Add-Label 'Your original ISO stays unchanged. It is checked again every time you launch.' 28 319 564 24 9 '#93a0b3'
$cancel=Add-Button 'Cancel' 28 351 112
$continue=Add-Button 'Launch game' 402 351 190
$continue.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#443921');$continue.Enabled=$false
$script:chosen=$null;$script:verified=$false;$script:checker=$null
$timer=New-Object System.Windows.Forms.Timer;$timer.Interval=100
function Begin-Verification([string]$Path){
 $script:chosen=$Path;$script:verified=$false;$pathBox.Text=$Path
 $browse.Enabled=$false;$continue.Enabled=$false;$status.Text='Checking the complete ISO checksum...';$status.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#b7c2d3')
 $progress.Visible=$true;$progress.Style='Marquee'
 try{
  $info=New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName=Join-Path $Root 'runtime\node\node.exe'
  $info.Arguments='"'+(Join-Path $Root 'desktop\verify-iso.mjs')+'"'
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.EnvironmentVariables['CUSTOM_MELEE_ISO_PATH']=$Path
  $script:checker=New-Object System.Diagnostics.Process;$script:checker.StartInfo=$info
  [void]$script:checker.Start();$timer.Start()
 }catch{$status.Text='Could not verify the ISO. Check that the entire release was extracted.';$browse.Enabled=$true;$progress.Visible=$false}
}
$browse.Add_Click({
 $picker=New-Object System.Windows.Forms.OpenFileDialog
 $picker.Title='Select original Melee USA v1.02 ISO';$picker.Filter='Melee ISO (*.iso;*.gcm)|*.iso;*.gcm';$picker.CheckFileExists=$true;$picker.Multiselect=$false
 try{if($picker.ShowDialog($form)-eq [System.Windows.Forms.DialogResult]::OK){Begin-Verification $picker.FileName}}finally{$picker.Dispose()}
})
$timer.Add_Tick({
 if(!$script:checker.HasExited){return}
 $timer.Stop();$progress.Visible=$false;$browse.Enabled=$true
 try{
  $result=$script:checker.StandardOutput.ReadToEnd()|ConvertFrom-Json
  if($script:checker.ExitCode-eq 0-and $result.valid){
   $script:verified=$true;$continue.Enabled=$true;$status.Text='Verified: original Melee USA v1.02. Ready to play.';$status.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#b5e4bd');$continue.Focus()|Out-Null
  }else{$status.Text=$result.error;$status.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#ffb5a9')}
 }catch{$status.Text='Could not verify this file. Choose your original Melee USA v1.02 ISO.';$status.ForeColor=[System.Drawing.ColorTranslator]::FromHtml('#ffb5a9')}
 $script:checker.Dispose();$script:checker=$null
})
$continue.Add_Click({if($script:verified){$form.DialogResult=[System.Windows.Forms.DialogResult]::OK;$form.Close()}})
$cancel.Add_Click({$form.DialogResult=[System.Windows.Forms.DialogResult]::Cancel;$form.Close()})
$form.CancelButton=$cancel
$form.Add_Shown({[void][IsoSetupWindow]::ShowWindow($form.Handle,5);$form.Activate()})
$form.Add_FormClosing({$timer.Stop();if($script:checker){if(!$script:checker.HasExited){$script:checker.Kill()};$script:checker.Dispose();$script:checker=$null}})
try{
 if($form.ShowDialog()-eq [System.Windows.Forms.DialogResult]::OK-and $script:verified){
  [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
  [Console]::WriteLine($script:chosen)
 }
}finally{$timer.Dispose();$form.Dispose()}
