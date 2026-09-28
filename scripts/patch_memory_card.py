"""Restore Melee's memory-card flow in the TTRC distribution's Slippi codes.

Only run on a staging distribution, never a player's external Slippi install.
The upstream General Codes hook at 801AF6F4 skips the card scene for Target
Test and Home Run Contest. Remove exactly that known hook, keeping recording
and all other General Codes. A changed upstream payload fails the build.
"""
from pathlib import Path
import re
import stat
import sys

SKIP_CARD = [
    'C21AF6F4 00000006',
    '2C1D000F 41820010',
    '2C1D000D 41820008',
    '48000014 3D80801B',
    '618C01AC 7D8903A6',
    '4E800420 2C1D0000',
    '60000000 00000000',
]


def restore_card_flow(text):
    lines = text.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines)
               if re.match(r'^C21AF6F4\b', line.strip())]
    if len(matches) != 1:
        raise ValueError('Expected exactly one upstream Skip Memcard Prompt hook.')
    start = matches[0]
    actual = [' '.join(line.split('#', 1)[0].split())
              for line in lines[start:start + len(SKIP_CARD)]]
    if actual != SKIP_CARD:
        raise ValueError('Upstream Skip Memcard Prompt hook changed; inspect before packaging.')
    return ''.join(lines[:start] + lines[start + len(SKIP_CARD):])


if __name__ == '__main__':
    path = Path(sys.argv[1])
    original = path.read_bytes().decode('utf-8')
    patched = restore_card_flow(original).encode('utf-8')
    # The official portable archive marks some Sys files read-only.
    path.chmod(path.stat().st_mode | stat.S_IWUSR)
    path.write_bytes(patched)
