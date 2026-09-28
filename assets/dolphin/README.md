# Target Test menu title

Original vector artwork in `title.svg` replaces the English character-select
banner `STADIUM / TARGET / TEST` with `TARGET TEST / RANDOMIZER / CHALLENGE`.
The gold target beside the title matches the original vector in `target.svg`.
`target.ico` embeds that target at 16, 32, 48, 64, 128 and 256 pixels. The native
build installs it as `Installer/Dolphin.ico`, used by the Windows executable
and the wx application windows. Existing website/companion/admin favicons keep
their separate designs.
It does not change the announcer, in-game HUD, other menus, or replay data.

The PNG is installed only into a marked TTRC profile, at
`Load/Textures/GALE01/TTRC/`, with `Settings.HiresTextures = True` in `Config/GFX.ini`.
The ISO and the challenge Gecko payload remain unchanged.

Texture identification: original USA 1.02 `MnSlChr.usd`, I4 image at data offset
`0x37f940` (file offset `0x37f960`), 96 × 40, 1920 tiled bytes,
XXH64 with seed 0 = `ce455ca08d511f27`.
The bundled 768 × 320 PNG has the same aspect ratio and transparent background.

Sources for the loading mechanism:
- https://github.com/doldecomp/melee/blob/master/src/melee/mn/mncharsel.c
- https://github.com/project-slippi/Ishiiruka/blob/slippi/Source/Core/VideoCommon/HiresTextures.cpp

Rebuild with ImageMagick and DejaVu Sans installed:

```
convert -background none assets/dolphin/title.svg PNG32:assets/dolphin/tex1_96x40_ce455ca08d511f27_0.png
convert -background none assets/dolphin/target.svg -define icon:auto-resize=256,128,64,48,32,16 assets/dolphin/target.ico
```
