param([Parameter(Mandatory=$true)][string]$Profile, [string]$Executable)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -Path (Join-Path $PSScriptRoot 'DolphinReader.cs')
$reader = $null
$gameProcess = $null
try {
    while ($true) {
        if ($null -eq $reader) {
            $candidate = Get-CimInstance Win32_Process -Filter "name = 'Dolphin.exe' OR name = 'Slippi Dolphin.exe'" |
                Where-Object { ($_.CommandLine -and $_.CommandLine.Contains($Profile)) -or
                    ($Executable -and $_.ExecutablePath -eq $Executable -and
                     (Test-Path (Join-Path $Profile '.ttrc-profile')) -and
                     (Test-Path (Join-Path (Split-Path $Executable) 'portable.txt')) -and
                     $Profile -eq (Join-Path (Split-Path $Executable) 'User')) } |
                Select-Object -First 1
            if ($null -ne $candidate) {
                try {
                    $gameProcess = Get-Process -Id $candidate.ProcessId
                    $reader = New-Object DolphinReader -ArgumentList $candidate.ProcessId
                } catch { $reader = $null }
            }
            if ($null -eq $reader) {
                [Console]::WriteLine('{"status":"waiting"}')
                Start-Sleep -Milliseconds 1500
                continue
            }
        }
        try {
            if ($gameProcess.HasExited) { throw 'Exited' }
            $sample = $reader.Sample($gameProcess.Id)
            if ($sample) { [Console]::WriteLine($sample) }
        } catch {
            $reader.Dispose(); $reader = $null
            [Console]::WriteLine('{"status":"waiting"}')
        }
        Start-Sleep -Milliseconds 50
    }
} finally { if ($null -ne $reader) { $reader.Dispose() } }
