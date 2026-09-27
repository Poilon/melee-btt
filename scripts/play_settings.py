"""Apply cosmetic preferences only when preparing our dedicated Dolphin profile."""
import configparser
import json
from pathlib import Path

SETTINGS_PATH = Path(__file__).resolve().parents[1] / '.local/play-settings.json'
MUSIC_CODE_NAME = 'TTRC: Music off'
# Slippi's original GameMusicOff patch: mute music, leaving sound effects intact.
# https://github.com/project-slippi/slippi-ssbm-asm/blob/master/Binary/GameMusicOff.bin
MUSIC_OFF_CODE = '04023FFC 38800000'


def load_preferences(path=SETTINGS_PATH):
    if not path.exists():
        return {'music': True, 'rumble': True}
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or set(value) != {'music', 'rumble'} or any(type(v) is not bool for v in value.values()):
        raise ValueError('Invalid companion play settings.')
    return value


def read_ini(path):
    ini = configparser.ConfigParser(interpolation=None, strict=False)
    ini.optionxform = str
    ini.read(path)
    return ini


def write_ini(path, ini):
    with path.open('w') as file:
        ini.write(file)


def apply_preferences(profile, preferences):
    if not (profile / '.ttrc-profile').is_file():
        raise ValueError('Play settings require a dedicated TTRC profile.')
    dolphin_path = profile / 'Config/Dolphin.ini'
    dolphin = read_ini(dolphin_path)
    if not dolphin.has_section('Core'):
        dolphin['Core'] = {}
    # Online music hooks are disabled in our recording profile. The music Gecko
    # below mutes vanilla Melee; also set the separate jukebox toggle for Slippi.
    dolphin['Core']['SlippiJukeboxEnabled'] = str(preferences['music'])
    for port in range(4):
        dolphin['Core'][f'AdapterRumble{port}'] = str(preferences['rumble'])
    write_ini(dolphin_path, dolphin)

    # Emulated controllers have independent motor mappings. Preserve their
    # existing strengths and mappings while temporarily suppressing the output.
    pad_path = profile / 'Config/GCPadNew.ini'
    backup_path = profile / 'Challenge/rumble-ranges.json'
    if pad_path.exists():
        pads = read_ini(pad_path)
        backup = json.loads(backup_path.read_text()) if backup_path.exists() else {}
        for port in range(1, 5):
            section = f'GCPad{port}'
            if not pads.has_section(section):
                continue
            key = 'Rumble/Motor/Range'
            if not preferences['rumble']:
                if section not in backup:
                    backup[section] = pads[section].get(key)
                pads[section][key] = '0'
            elif section in backup:
                original = backup[section]
                if original is None:
                    pads.remove_option(section, key)
                else:
                    pads[section][key] = original
        if not preferences['rumble']:
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            backup_path.write_text(json.dumps(backup))
        write_ini(pad_path, pads)
        if preferences['rumble']:
            backup_path.unlink(missing_ok=True)
