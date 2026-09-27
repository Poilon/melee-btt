"""Prepare a dedicated Windows Dolphin profile from a generated challenge (WSL)."""
import os
import argparse
import base64
import configparser
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
from play_settings import load_preferences, apply_preferences, preference_codes

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOLPHIN = Path('/mnt/c/Users/Ubuntu/Desktop/tout/Dolphin-x64/Dolphin.exe')
DEFAULT_SLIPPI = Path('/mnt/c/Users/Ubuntu/AppData/Roaming/Slippi Launcher/netplay/Slippi Dolphin.exe')
DEFAULT_CONFIG = Path('/mnt/c/Users/Ubuntu/AppData/Roaming/Dolphin Emulator/Config')
if os.name == 'nt':
    DEFAULT_DOLPHIN = ROOT / 'Dolphin/netplay/Slippi Dolphin.exe'
    DEFAULT_SLIPPI = DEFAULT_DOLPHIN
    DEFAULT_CONFIG = Path(os.environ.get('APPDATA', str(ROOT))) / 'Dolphin Emulator/Config'


def windows_path(path):
    if os.name == 'nt':
        return str(path.resolve())
    return subprocess.check_output(['wslpath', '-w', str(path.resolve())], text=True).strip()


def ps_literal(value):
    return "'" + value.replace("'", "''") + "'"


def migrate_replays(source, destination):
    """Keep old recordings accessible without deleting or overwriting any file."""
    destination.mkdir(parents=True, exist_ok=True)
    if not source.is_dir() or source.resolve() == destination.resolve():
        return
    for recording in source.iterdir():
        if recording.is_symlink() or not recording.is_file() or recording.suffix.lower() != '.slp':
            continue
        data = recording.read_bytes()
        target = destination / recording.name
        if target.exists():
            if target.read_bytes() == data:
                continue
            digest = hashlib.sha256(data).hexdigest()
            target = destination / f'{recording.stem}-{digest}.slp'
        try:
            with target.open('xb') as output:
                output.write(data)
        except FileExistsError:
            if target.read_bytes() != data:
                raise RuntimeError(f'Replay destination already exists: {target}')


def install_title_texture(profile):
    """Brand only our isolated profile's Target Test character-select banner."""
    if not (profile / '.ttrc-profile').is_file():
        raise ValueError('The texture pack requires a TTRC profile.')
    destination = profile / 'Load/Textures/GALE01/TTRC'
    destination.mkdir(parents=True, exist_ok=True)
    texture = 'tex1_96x40_ce455ca08d511f27_0.png'
    shutil.copyfile(ROOT / 'assets/dolphin' / texture, destination / texture)
    graphics_path = profile / 'Config/GFX.ini'
    graphics = configparser.ConfigParser(interpolation=None, strict=False)
    graphics.optionxform = str
    graphics.read(graphics_path)
    if not graphics.has_section('Settings'):
        graphics['Settings'] = {}
    graphics['Settings']['HiresTextures'] = 'True'
    with graphics_path.open('w') as file:
        graphics.write(file)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--challenge', type=Path, default=ROOT / 'build/challenge')
    parser.add_argument('--iso', type=Path)
    parser.add_argument('--dolphin', type=Path, default=DEFAULT_DOLPHIN)
    parser.add_argument('--controller-config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--portable', action='store_true', help='Use the User directory next to Dolphin')
    parser.add_argument('--configure-only', action='store_true', help='Prepare portable settings before the ISO is selected in Dolphin')
    parser.add_argument('--record-replays', action='store_true', help='Use an isolated Slippi Dolphin recording profile')
    args = parser.parse_args()
    if args.record_replays and args.dolphin == DEFAULT_DOLPHIN:
        args.dolphin = DEFAULT_SLIPPI
    candidates = list((ROOT / 'Games').glob('*.iso')) or list(ROOT.glob('*.iso'))
    iso = args.iso or (candidates[0] if len(candidates) == 1 else None)
    if args.configure_only and (not args.portable or args.launch):
        parser.error('--configure-only requires --portable and cannot launch a game.')
    if iso is None and not args.configure_only:
        parser.error('Indique --iso chemin/vers/Melee.iso.')
    if not args.dolphin.is_file():
        parser.error('Dolphin.exe introuvable ; indique --dolphin.')
    if not args.configure_only:
        with iso.open('rb') as file:
            header = file.read(8)
            file.seek(0)
            hasher = hashlib.md5()
            for chunk in iter(lambda: file.read(1024 * 1024), b''):
                hasher.update(chunk)
            digest = hasher.hexdigest()
        if header != b'GALE01\x00\x02' or digest != '0e63d4223b01d9aba596259dc155a174':
            parser.error('Une ISO originale Melee USA 1.02 est nécessaire.')
    manifest = json.loads((args.challenge / 'challenge.json').read_text())
    if not re.fullmatch('[0-9a-f]{64}', manifest.get('id', '')):
        parser.error('Identifiant de défi invalide ; régénère le défi.')
    code = (args.challenge / 'code.txt').read_bytes()
    if hashlib.sha256(code).hexdigest() != manifest['geckoSha256']:
        parser.error('Le code ne correspond plus au manifeste ; régénère le défi.')
    preferences = load_preferences()
    # Every challenge owns its profile, so changing seeds cannot overwrite the
    # configuration or memory card of a previous challenge, or the normal user.
    profile = ROOT / ('build/replay-profiles' if args.record_replays else 'build/profiles') / manifest['id']
    if args.portable:
        profile = args.dolphin.resolve().parent / 'User'
    marker = profile / '.ttrc-profile'
    if profile.exists() and not marker.exists():
        parser.error(f'Ce dossier ne nous appartient pas : {profile}')
    for folder in ['Config', 'GameSettings']:
        (profile / folder).mkdir(parents=True, exist_ok=True)
    marker.write_text('Target Test Randomizer Challenge\n')
    # Import only the vanilla Melee save into this isolated memory card. This
    # avoids the first-boot save dialog when an existing save is available.
    save_name = '01-GALE-SuperSmashBros0110290334.gci'
    source_save = args.controller_config.parent / 'GC/USA/Card A' / save_name
    target_save = profile / 'GC/USA/Card A' / save_name
    if source_save.is_file() and not target_save.exists():
        target_save.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_save, target_save)
    # Build the INI from the hashed code rather than trusting a separately edited INI.
    name = 'Target Test Randomizer Challenge'
    extras = preference_codes(preferences)
    extra_code = ''.join(f'${label}\n{patch}\n' for label, patch in extras)
    extra_enabled = ''.join(f'${label}\n' for label, _ in extras)
    ini = f'[Gecko]\n${name}\n{code.decode()}\n{extra_code}[Gecko_Enabled]\n${name}\n{extra_enabled}'
    if args.record_replays:
        sys_ini = args.dolphin.parent / 'Sys/GameSettings/GALE01r2.ini'
        if not sys_ini.is_file():
            parser.error('Slippi recording codes not found for this executable.')
        # Explicitly disable online/menu patches; retain only general support and recording.
        defaults = sys_ini.read_text().split('[Gecko_Enabled]', 1)[1].split('[Gecko]', 1)[0]
        disabled = [line for line in defaults.splitlines() if line.startswith('$') and line not in ['$Required: General Codes', '$Required: Slippi Recording']]
        ini += '$Required: General Codes\n$Required: Slippi Recording\n[Gecko_Disabled]\n' + '\n'.join(disabled) + '\n'
    (profile / 'GameSettings/GALE01.ini').write_text(ini)
    config_path = profile / 'Config/Dolphin.ini'
    if not config_path.exists():
        core = {'EnableCheats': 'True', 'SIDevice0': '12' if args.record_replays else '6'}
        original = configparser.ConfigParser(interpolation=None, strict=False)
        original.optionxform = str
        original.read(args.controller_config / 'Dolphin.ini')
        if original.has_section('Core'):
            for key, value in original.items('Core'):
                if key.startswith(('SIDevice', 'AdapterRumble', 'SimulateKonga')):
                    core[key] = value
        config = configparser.ConfigParser(interpolation=None)
        config.optionxform = str
        config['Core'] = core
        config['Interface'] = {'LanguageCode': 'en'}
        config['Analytics'] = {'Enabled': 'False', 'PermissionAsked': 'True'}
        with config_path.open('w') as file:
            config.write(file)
        for name in ['GCPadNew.ini', 'GCAdapter.ini']:
            source = args.controller_config / name
            if source.exists() and source.resolve() != (profile / 'Config' / name).resolve():
                shutil.copyfile(source, profile / 'Config' / name)
    if args.record_replays:
        config = configparser.ConfigParser(interpolation=None, strict=False)
        config.optionxform = str
        config.read(config_path)
        if not config.has_section('Core'): config['Core'] = {}
        replay_dir = args.dolphin.resolve().parent / 'Replays'
        migrate_replays(profile / 'Replays', replay_dir)
        if args.portable:
            migrate_replays(ROOT / 'Dolphin/netplay/Replays', replay_dir)
        config['Core'].update({'EnableCheats': 'True', 'SlippiSaveReplays': 'True',
                              'SlippiReplayMonthFolders': 'False', 'SlippiReplayDir': windows_path(replay_dir), 'EXIDevice1': '10'})
        with config_path.open('w') as file: config.write(file)
    install_title_texture(profile)
    apply_preferences(profile, preferences)
    if args.configure_only:
        return
    # Force cheats on launch too, in case Dolphin previously saved them off.
    exe, user, game = map(windows_path, [args.dolphin, profile, iso])
    ps = '\n'.join([
        "$ErrorActionPreference = 'Stop'",
        "$ProgressPreference = 'SilentlyContinue'",
        f'$exe = {ps_literal(exe)}',
        f'$profile = {ps_literal(user)}',
        f'$iso = {ps_literal(game)}',
        '$running = Get-CimInstance Win32_Process -Filter "name = \'Dolphin.exe\' OR name = \'Slippi Dolphin.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) }',
        "if ($running) { throw 'Ce defi est deja ouvert dans Dolphin. Fermez-le avant de le relancer.' }",
        "$arguments = @('--user', ('\"{0}\"' -f $profile), '--exec', ('\"{0}\"' -f $iso), '-C', 'Dolphin.Core.EnableCheats=True')",
        '(Start-Process -FilePath $exe -ArgumentList $arguments -PassThru).Id',
    ])
    if args.record_replays:
        ps = ps.replace(", '-C', 'Dolphin.Core.EnableCheats=True'", '')
    (args.challenge / 'runtime.json').write_text(json.dumps({'profile': str(profile), 'dolphin': str(args.dolphin), 'replays': str(replay_dir) if args.record_replays else None, 'recording': args.record_replays, 'iso': str(iso.resolve())}))
    launcher = args.challenge / 'Launch.ps1'
    launcher.write_text(ps, encoding='utf-8-sig')
    (args.challenge / 'Jouer.cmd').write_bytes(
        b'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch.ps1"\r\n'
    )
    print(f'ISO originale vérifiée : {digest}')
    print(f'Profil dédié : {profile}')
    if manifest['character']:
        print(f'Personnage à choisir : {manifest["character"]}')
    else:
        print('Tous les personnages sont jouables ; associations dans parcours.txt.')
        print(f'Fox -> stage de {manifest["assignments"]["fox"]}')
    print(f'Lanceur Windows : {args.challenge / "Jouer.cmd"}')
    if args.launch:
        encoded = base64.b64encode(ps.encode('utf-16-le')).decode()
        result = subprocess.run(
            ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
            check=True, capture_output=True, text=True, errors='replace',
        )
        print(f'Dolphin lancé, PID Windows : {result.stdout.strip()}')


if __name__ == '__main__':
    main()
