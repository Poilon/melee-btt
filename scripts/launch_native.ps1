param([Parameter(Mandatory=$true)][string]$Executable,[switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$existing = Get-CimInstance Win32_Process -Filter "name = 'Slippi Dolphin.exe'" | Where-Object { $_.ExecutablePath -eq $Executable } | Select-Object -First 1
if ($existing) { [Console]::WriteLine('{"status":"already-running"}'); exit }
if ($CheckOnly) { [Console]::WriteLine('{"status":"stopped"}'); exit }
# Dolphin's native startup hook applies saved preferences before loading its configuration.
$dolphin = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path $Executable) -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(12)
do {
    Start-Sleep -Milliseconds 100
    $dolphin.Refresh()
    if ($dolphin.HasExited) { throw 'Dolphin could not start. See .local/startup.log.' }
} while ($dolphin.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
[Console]::WriteLine('{"status":"started"}')
