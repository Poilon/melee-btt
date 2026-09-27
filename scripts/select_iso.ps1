$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Choose your original Melee USA 1.02 ISO'
$dialog.Filter = 'GameCube ISO (*.iso;*.gcm)|*.iso;*.gcm'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
    [Console]::WriteLine($dialog.FileName)
}
$dialog.Dispose()
