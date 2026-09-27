"""Launch a recorded replay in an isolated Slippi Playback profile (WSL/Windows)."""
import argparse
import base64
import configparser
import json
from pathlib import Path
import re
import subprocess
import uuid
from prepare_dolphin import ROOT, windows_path, ps_literal, os

DEFAULT_PLAYBACK = ROOT / 'Dolphin/playback/Slippi Dolphin.exe' if os.name == 'nt' else Path('/mnt/c/Users/Ubuntu/AppData/Roaming/Slippi Launcher/playback/Slippi Dolphin.exe')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay', type=Path, required=True)
    parser.add_argument('--challenge', type=Path, default=ROOT / 'build/challenge')
    parser.add_argument('--dolphin', type=Path, default=DEFAULT_PLAYBACK)
    parser.add_argument('--iso', type=Path)
    parser.add_argument('--stage', type=int, required=True)
    args = parser.parse_args()
    if not args.dolphin.is_file(): parser.error('Slippi Playback Dolphin was not found.')
    if not args.replay.is_file() or args.replay.suffix.lower() != '.slp': parser.error('Replay file not found.')
    candidates = list((ROOT / 'Games').glob('*.iso')) or list(ROOT.glob('*.iso'))
    iso = args.iso or (candidates[0] if len(candidates) == 1 else None)
    if not iso: parser.error('Specify the original Melee USA 1.02 ISO.')
    with iso.open('rb') as f:
        if f.read(8) != b'GALE01\x00\x02': parser.error('Melee USA 1.02 is required.')
    manifest = json.loads((args.challenge / 'challenge.json').read_text())
    if not re.fullmatch('[a-f0-9]{64}', manifest['id']): parser.error('Invalid challenge.')
    if not 33 <= args.stage <= 58: parser.error('Expected a Target Test stage.')
    profile = ROOT / 'build/playback-profiles' / manifest['id'] / str(args.stage)
    marker = profile / '.ttrc-playback'
    if profile.exists() and not marker.exists(): parser.error('This playback profile does not belong to the companion.')
    for folder in ['Config', 'GameSettings']: (profile / folder).mkdir(parents=True, exist_ok=True)
    marker.write_text('Target Test replay viewer\n')
    config_path = profile / 'Config/Dolphin.ini'
    if not config_path.exists():
        config = configparser.ConfigParser(interpolation=None); config.optionxform = str
        config['Core'] = {'EnableCheats':'True', 'EXIDevice1':'10', 'SlippiSaveReplays':'False',
                          'SlippiRegenerateReplays':'False', 'SIDevice0':'6', 'SIDevice1':'0', 'SIDevice2':'0', 'SIDevice3':'0'}
        config['Interface'] = {'ConfirmStop':'False'}
        config['Analytics'] = {'Enabled':'False', 'PermissionAsked':'True'}
        with config_path.open('w') as f: config.write(f)
        # Playback loads the recorded Gecko list itself. Do not inject the menu
        # boot patches from the play profile or overwrite its recording settings.
        # BTT's modular hook reads selected_stage at 804D49E8, which the
        # debug playback scene does not restore. Use the recorded external ID.
        (profile / 'GameSettings/GALE01.ini').write_text(f'[Gecko]\n$TTRC Playback Stage Context\n044D49E8 {args.stage:08X}\n[Gecko_Enabled]\n$TTRC Playback Stage Context\n$Required: General Codes\n$Required: Slippi Playback\n[Gecko_Disabled]\n$Recommended: Slippi Recording\n$Optional: Show Player Names\n')
    control = profile / 'replay.json'
    request = {'mode':'normal', 'replay':windows_path(args.replay), 'commandId':uuid.uuid4().hex,
               'shouldResync':True, 'rollbackDisplayMethod':'off'}
    temporary = profile / 'replay.json.tmp'
    temporary.write_text(json.dumps(request)); temporary.replace(control)
    exe, user, game, command = map(windows_path, [args.dolphin, profile, iso, control])
    ps = '\n'.join([
        "$ErrorActionPreference = 'Stop'", "$ProgressPreference = 'SilentlyContinue'",
        f'$exe = {ps_literal(exe)}', f'$profile = {ps_literal(user)}',
        f'$iso = {ps_literal(game)}', f'$command = {ps_literal(command)}',
        '$running = Get-CimInstance Win32_Process -Filter "name = \'Slippi Dolphin.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) } | Select-Object -First 1',
        "if ($running) { $shell = New-Object -ComObject WScript.Shell; $shell.AppActivate([int]$running.ProcessId) | Out-Null; Write-Output ('restarted:' + $running.ProcessId); exit 0 }",
        "$arguments = @('--user', ('\"{0}\"' -f $profile), '--exec', ('\"{0}\"' -f $iso), '-i', ('\"{0}\"' -f $command))",
        "Write-Output ('started:' + (Start-Process -FilePath $exe -ArgumentList $arguments -PassThru).Id)",
    ])
    encoded = base64.b64encode(ps.encode('utf-16-le')).decode()
    result = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-EncodedCommand',encoded],check=True,capture_output=True,text=True,errors='replace',creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    print(result.stdout.strip())

if __name__ == '__main__': main()
