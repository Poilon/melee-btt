"""Apply companion preferences only when preparing our dedicated Dolphin profile."""
import configparser
import json
from pathlib import Path

SETTINGS_PATH = Path(__file__).resolve().parents[1] / '.local/play-settings.json'
MUSIC_CODE_NAME = 'TTRC: Music off'
# Slippi's original GameMusicOff patch: mute music, leaving sound effects intact.
# https://github.com/project-slippi/slippi-ssbm-asm/blob/master/Binary/GameMusicOff.bin
MUSIC_OFF_CODE = '04023FFC 38800000'


ITEM_IDS = {'turnip': 0x63, 'beam-sword': 0x0C, 'bob-omb': 0x06, 'mr-saturn': 0x07}
CODES = json.loads((Path(__file__).resolve().parents[1] / 'shared/gameplay-codes.json').read_text())


def default_preferences():
    return {'music': True, 'rumble': True, 'ucf': True, 'iceClimbers': False,
            'luigiMisfire': False, 'peachItems': ['random'] * 10}


def normalize_preferences(value):
    defaults = default_preferences()
    if not isinstance(value, dict) or set(value) not in ({'music', 'rumble'}, set(defaults)):
        raise ValueError('Invalid companion play settings.')
    result = defaults | value
    if any(type(result[key]) is not bool for key in ('music', 'rumble', 'ucf', 'iceClimbers', 'luigiMisfire')):
        raise ValueError('Invalid companion play settings.')
    items = result['peachItems']
    if not isinstance(items, list) or len(items) != 10 or any(not isinstance(item, str) or item not in ['random', *ITEM_IDS] for item in items):
        raise ValueError('Invalid Peach items.')
    return result


def load_preferences(path=SETTINGS_PATH):
    return normalize_preferences(json.loads(path.read_text())) if path.exists() else default_preferences()


def peach_code(items):
    # Sockdude1's generator branches on the target counter, not a pull counter.
    pairs = [(10-index, ITEM_IDS[item]) for index, item in enumerate(items) if item != 'random']
    n = len(pairs)
    if not n:
        return ''
    words = [0xC211D0A4, 2*n+3, 0x3E608049, 0x6273ED9D, 0x8A930000]
    for targets, _ in pairs:
        words += [0x2C140000 | targets, 0x41820000 | n*8]
    words += [0x48000000 | (2*n+1)*4]
    for index, (_, item) in enumerate(pairs):
        words += [0x38C00000 | item, 0x48000000 | (n-index)*8]
    words += [0x7FE6FB78, 0]
    return '\n'.join(f'{words[i]:08X} {words[i+1]:08X}' for i in range(0, len(words), 2))


def preference_codes(preferences):
    prefs = normalize_preferences(preferences)
    result = []
    if not prefs['music']:
        result.append((MUSIC_CODE_NAME, MUSIC_OFF_CODE))
    # Keep these in one block: both hook 800C9A44. The sheet requires Fix first.
    if prefs['ucf']:
        result.append(('TTRC: UCF', CODES['ucfFix']['code'] + '\n' + CODES['ucfDashback']['code']))
    for key in ('iceClimbers', 'luigiMisfire'):
        if prefs[key]:
            result.append((CODES[key]['name'], CODES[key]['code']))
    peach = peach_code(prefs['peachItems'])
    if peach:
        result.append(('TTRC: Peach items', peach))
    return result


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
