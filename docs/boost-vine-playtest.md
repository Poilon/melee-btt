# Falcon boost and DK vine — local playtest, 30 September 2026

Captain Falcon's track barrier is now a textured rightward speed strip. Entering it on the ground adds 5.8 native units/frame of horizontal impulse without damage or a damage action. Melee applies its own friction; normal movement, jumping and attacks remain available. Leaving the strip rearms it. The short runway before the first pit gives time to jump. The shuttle still provides another route.

DK's eastern ferry is replaced by a vine suspended from a fixed canopy pivot. Its knot swings through ±0.43 radians on a 360-frame cycle. A small closed collision island on the knot has a genuine grabbable ledge. Melee's CliffCatch/CliffWait carries the hanging character; X performs the ordinary ledge jump. The knot can also support a landing. The original western impact barrel remains, another barrel crosses the trunk roof, and a thorn pod guards the eastern landing. The open gap remains lethal.

## Native validation

The isolated Dolphin profile boots the actual rebuilt disc. A private, frame-scheduled controller hook supplies stick/buttons only; it never writes fighter positions, velocities, damage or completion. Isolated starting positions make individual encounters repeatable. This hook is not in the installed disc/profile.

- Falcon: running into the strip, then a full jump, clears the first pit. Peak observed horizontal speed **7.74 units/frame**; 0% damage throughout; ends grounded at native x=176.44. Normal Jump/Fall/Landing/Wait actions, no damage action. A short hop reaches the opposite ledge but needs recovery, so the jump timing matters.
- DK: jump towards the knot from the eastern branch, catch its right side, remain hanging for a full traverse and return, then ledge-jump back to the branch. Native actions **252/253** confirm actual ledge catch/hang, **262/263** confirm ledge jump. While hanging, x ranges **81.52–196.63**. Ends grounded at **(221.73, 122.16)**, 0% damage throughout.
- Separate native contact probes for the new cargo barrel and eastern thorn pod each go from 0% to 10% on contact, with directional knockback.
- A separate hanging screenshot confirms DK's hands meet the textured knot and the vine rotates around its canopy pivot.
- Existing stage checks plus the new native ledge/material checks: **31 Python tests**. **4 Node custom-stage integration tests**. PowerPC execution checks cover boost bounds, ground/air and damage-state exclusions, entry latch, inactive stages and preserved ABI; **60** contact-descriptor selector cases pass.
- The standard-library-only builder produces exactly the same 26 stage hashes. Only **GrTCa.dat** and **GrTDk.dat** differ from the previous installed stages. Other 24 archives are byte-identical. The DOL changes to install the boost and reserve descriptor slot zero safely.

This verifies the new mechanisms and the tested traversals, not a human ten-target clear of either entire course.

## Implementation

`world-boost.s` replaces 224 bytes of the retired original Captain Falcon Target Test module at 0x8021FC64. All 26 custom stage records already use Fox's initializer instead. Fox group 0's former no-op callback points to this code. Only the Falcon archive supplies BST1 metadata in parameter-table slot zero; other worlds return immediately. The contact selector excludes group zero, and vine/boost collision groups have no damage descriptor. No heap code cave, companion frame loop or change to character attributes is used.

The native hanging behavior follows the existing engine's [CliffCatch physics](https://raw.githubusercontent.com/doldecomp/melee/master/src/melee/ft/ftcliffcommon.c). Physics and visuals share the same animated collision joint. `stage_access.py` samples the actual knot sweep for structural route checks; native play remains the authority for timing and grabbing.

## Art and evidence

New sprites were generated with the **built-in image_gen tool**, inspected, copied into this repository and encoded as alpha-tested GX RGBA8. Exact prompts: [BOOST-VINE-PROMPTS.json](../assets/custom-stages/mechanisms/BOOST-VINE-PROMPTS.json).

- [Falcon booster source](../assets/custom-stages/mechanisms/falcon-boost.png); runtime `assets/custom-stages/worlds/Ca/prop-boost.png` and `.rgba8`.
- [DK vine source](../assets/custom-stages/mechanisms/dk-vine.png); runtime `assets/custom-stages/worlds/Dk/prop-vine.png` and `.rgba8`.
- Thorn pod reuses the existing generated `hazard-pod.png`, encoded in DK's own prop manifest.

Final native traces/screenshots and backup/install checks: `build/custom-stage/boost-vine/`. Original Melee ISO remains the read-only build input; installation replaces only the local authored-world disc and matching metadata/runtime sources, with backups.
