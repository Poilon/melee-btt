"""Execute a generated motion Gecko payload in Unicorn's PowerPC CPU.

Developer validation: pip install unicorn==2.1.4
python scripts/test_motion_cpu.py build/motion-challenge
The game/ISO and private recordings are not required.
"""
import json
import struct
import sys
from pathlib import Path
from unicorn import Uc, UC_ARCH_PPC, UC_MODE_PPC32, UC_MODE_BIG_ENDIAN
from unicorn.ppc_const import UC_PPC_REG_0, UC_PPC_REG_1, UC_PPC_REG_31, UC_PPC_REG_MSR

folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'build/motion-challenge')
manifest = json.loads((folder / 'challenge.json').read_text())
words = bytes.fromhex((folder / 'code.txt').read_text())
offset = 0
while offset < len(words):
    command, value = struct.unpack_from('>II', words, offset)
    size = 8 + value * 8 if command >> 24 == 0xC2 else 8
    if command == 0xC22D85D8:
        payload = words[offset + 8:offset + size]
        break
    offset += size
else:
    raise AssertionError('No motion hook')

stages = ['dr-mario', 'mario', 'luigi', 'bowser', 'peach', 'yoshi', 'donkey-kong',
          'captain-falcon', 'ganondorf', 'falco', 'fox', 'ness', 'ice-climbers', 'kirby',
          'samus', 'zelda', 'link', 'young-link', 'pichu', 'pikachu', 'jigglypuff',
          'mewtwo', 'game-and-watch', 'marth', 'roy']
ground_ids = [44, 40, 51, 49, 55, 61, 43, 41, 65, 45, 46, 54, 47, 48, 59, 62, 50, 42, 56, 57, 58, 53, 63, 52, 64]
cpu = Uc(UC_ARCH_PPC, UC_MODE_PPC32 | UC_MODE_BIG_ENDIAN)
cpu.mem_map(0x80000000, 0x1800000)
code, stack, item = 0x81000000, 0x81700000, 0x81600000
cpu.mem_write(code, payload)
cpu.reg_write(UC_PPC_REG_MSR, 0x2000)  # FP enabled, as in Melee
checks = 0
for stage, targets in manifest['motion']['courses'].items():
    for target in targets:
        a, b = target['anchor'], target['destination']
        delay, duration = target['startDelayFrames'], target['legFrames']
        frames = set([0, 1, 10, 123, 600, 216000, delay, delay + 1])
        if duration:
            frames.update([delay + duration - 1, delay + duration, delay + duration + 1,
                           delay + 2 * duration - 1, delay + 2 * duration, delay + 10 * duration + 17])
        for frame in sorted(frames):
            original = bytearray(b'\xAB' * 0x60)
            struct.pack_into('>fff', original, 0x4C, a['x'], a['y'], 0)
            cpu.mem_write(item, bytes(original))
            cpu.mem_write(0x8049E750, struct.pack('>I', ground_ids[stages.index(stage)]))
            cpu.mem_write(0x8046B6C8, struct.pack('>IH', frame // 60, frame % 60))
            cpu.mem_write(stack + 0x2C, struct.pack('>I', 0x12345678))
            cpu.reg_write(UC_PPC_REG_1, stack)
            cpu.reg_write(UC_PPC_REG_31, item)
            cpu.emu_start(code, code + len(payload) - 4, count=1000)
            result = bytes(cpu.mem_read(item, 0x60))
            x, y = struct.unpack_from('>ff', result, 0x4C)
            fraction = 0
            if target['kind'] != 'static' and frame > delay:
                leg, remainder = divmod(frame - delay, duration)
                fraction = leg % 2 if target['kind'] == 'teleport' else (duration - remainder if leg % 2 else remainder) / duration
            expected = [a[k] + (b[k] - a[k]) * fraction for k in ['x', 'y']]
            assert abs(x - expected[0]) < 0.0001 and abs(y - expected[1]) < 0.0001, (stage, target['index'], frame, x, y, expected)
            assert result[:0x4C] == original[:0x4C] and result[0x54:] == original[0x54:]
            assert cpu.reg_read(UC_PPC_REG_1) == stack and cpu.reg_read(UC_PPC_REG_31) == item
            assert cpu.reg_read(UC_PPC_REG_0) == 0x12345678
            checks += 1
print(f'{checks} PowerPC executions passed across {len(manifest["motion"]["courses"])} stages.')
