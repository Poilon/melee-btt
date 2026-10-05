"""Configure an isolated free-play course using the player's controller preferences."""
import argparse
import configparser
from pathlib import Path
import shutil
from play_settings import read_ini, write_ini, load_preferences, apply_preferences, preference_codes
from prepare_dolphin import windows_path

# At gm_801B6428's stage lookup, use Sheik's stage when Zelda's player holds A.
# Leave the actual player kind alone: vanilla gmVs handles the A-held transform.
# HSD_PadMasterStatus is 0x44 bytes per port; gm_804D68E8 selects the CSS port.
# r11/r12 are volatile scratch; the displaced lbz r3,0x60(r30) is replayed.
SHEIK_WORLD_CODE = '''C21B6598 00000006
887E0060 2C030012
40820024 898DB248
1D8C0044 3D60804C
7D6B6214 816B1FAC
716B0100 41820008
38600013 00000000'''


def prepare(bundle, source, iso, course_id='grassland-1', course_name='Grassland 1', character=None, online=False):
    profile = bundle / 'User'
    if profile.exists() and not (profile / '.ttrc-custom-stage').exists():
        raise ValueError('Refusing to replace an unrelated Dolphin profile')
    for folder in ['Config', 'GameSettings', 'GC']:
        (profile / folder).mkdir(parents=True, exist_ok=True)
    (profile / '.ttrc-custom-stage').write_text(course_id+'\n')
    (profile / '.ttrc-profile').write_text('TTRC custom stage: free play\n')
    for name in ['GCPadNew.ini', 'GCAdapter.ini', 'GFX.ini', 'DSP.ini', 'Hotkeys.ini']:
        if (source / 'Config' / name).exists():
            shutil.copyfile(source / 'Config' / name, profile / 'Config' / name)
    original = read_ini(source / 'Config/Dolphin.ini')
    config = configparser.ConfigParser(interpolation=None)
    config.optionxform = str
    config['Core'] = {}
    # Copy controller/performance choices, never the other installation's ISO
    # library, NAND, boot ROM, card or replay paths (which can trigger Wii scans).
    for key, value in original['Core'].items() if original.has_section('Core') else []:
        if key.startswith(('SIDevice', 'AdapterRumble', 'SimulateKonga')) or key in {
            'CPUCore', 'CPUThread', 'Fastmem', 'DSPHLE', 'SyncOnSkipIdle', 'GFXBackend'}:
            config['Core'][key] = value
    config['Core']['GFXBackend'] = config['Core'].get('GFXBackend') or 'D3D'
    config['Interface'] = {'ConfirmStop': 'False', 'PauseOnFocusLost': 'False', 'LanguageCode': 'en', 'MainWindowPosX': '20', 'MainWindowPosY': '20'}
    config['General'] = {'ISOPaths': '0'}
    config['Display'] = {'Fullscreen': 'False', 'RenderToMain': 'False',
                         'RenderWindowWidth': '1280', 'RenderWindowHeight': '960', 'RenderWindowXPos': '20', 'RenderWindowYPos': '20'}
    previous = read_ini(profile / 'Config/Dolphin.ini')
    for section,keys in [('Interface',('MainWindowPosX','MainWindowPosY','MainWindowWidth','MainWindowHeight')),('Display',('RenderWindowXPos','RenderWindowYPos','RenderWindowWidth','RenderWindowHeight'))]:
        for key in keys:
            for settings in (previous,original):
                if settings.has_option(section,key):config[section][key]=settings[section][key];break
    config['Analytics'] = {'Enabled': 'False', 'PermissionAsked': 'True'}
    config['Core'].update({'EnableCheats': 'True', 'DefaultISO': windows_path(iso),
                          'BootDefaultISO': 'False', 'SlippiSaveReplays': str(online), 'SlippiReplayDir': windows_path(bundle / 'Replays'), 'SlippiReplayMonthFolders': 'False', 'MeleeForceWidescreen': 'False',
                          'SlippiEnableSpectator': 'False', 'SlotA': '1', 'SlotB': '10',
                          'EXIDevice1': '10', 'HLE_BS2': 'True',
                          'MemcardAPath': windows_path(profile / 'GC/MemoryCardA.USA.raw')})
    write_ini(profile / 'Config/Dolphin.ini', config)
    prefs = load_preferences()
    # The authored route relies on the following camera, not the challenge's fixed camera.
    prefs['fixedCamera'] = False
    extras = preference_codes(prefs)
    if course_id == 'character-worlds':
        extras.append(('Character Worlds: Sheik stage (hold A)', SHEIK_WORLD_CODE))
    if character is not None:
        if not 0<=character<=25:raise ValueError('Invalid editor character')
        selected=18 if character==19 else character
        extras.append(('Editor selected character',f'041B67EC 380000{selected:02X}'))
    if online:
        (bundle / 'Replays').mkdir(exist_ok=True)
    code = f'[Gecko]\n${course_name}\n0445BF28 FFFFFFFF\n0445BF2C FFFFFFFF\n'
    if not online:code += '041BFA20 3860000F\n'
    code += ''.join(f'${name}\n{patch}\n' for name, patch in extras)
    code += f'[Gecko_Enabled]\n${course_name}\n$Required: General Codes\n'
    code += ''.join(f'${name}\n' for name, _ in extras)
    if online:code += '$Required: Slippi Recording\n'
    code += '[Gecko_Disabled]\n$Required: Slippi Online\n'
    if not online:code += '$Required: Slippi Recording\n'
    code += '$Recommended: Normal Lag Reduction\n$Recommended: Apply Delay to all In-Game Scenes\n$Recommended: Lagless FoD\n'
    (profile / 'GameSettings/GALE01.ini').write_text(code)
    apply_preferences(profile, prefs)
    if course_id == 'character-worlds':
        from background_textures import install
        install(profile)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--source-profile', type=Path, required=True)
    parser.add_argument('--iso', type=Path, required=True)
    parser.add_argument('--course-id', choices=['grassland-1','character-worlds'], default='grassland-1')
    parser.add_argument('--name', default='Grassland 1')
    parser.add_argument('--character',type=int)
    parser.add_argument('--online',action='store_true')
    args = parser.parse_args()
    prepare(args.bundle, args.source_profile, args.iso, args.course_id, args.name, args.character, args.online)
