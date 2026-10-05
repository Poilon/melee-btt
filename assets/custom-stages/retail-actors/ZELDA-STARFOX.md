# Zelda and Star Fox assets — local stage prototype

The original Nintendo geometry and UVs are preserved. These assets are for the
local playtest; this work does not publish a release. Models were retrieved from
the credited extracts below on 2026-09-30. Source OBJ and texture SHA-256 values
are recorded in each `model.json`, alongside hashes of all runtime files.

- **arwing** — Star Fox 64 3D: https://models.spriters-resource.com/3ds/starfox643d/asset/357198/
- **wolfen** — Star Fox 64 3D: https://models.spriters-resource.com/3ds/starfox643d/asset/357203/
- **wallmaster** — The Legend of Zelda: Ocarina of Time 3D: https://models.spriters-resource.com/3ds/thelegendofzeldaocarinaoftime3d/asset/351779/
- **beam** — The Legend of Zelda: Ocarina of Time 3D, original Beamos beam mesh and texture: https://models.spriters-resource.com/3ds/thelegendofzeldaocarinaoftime3d/asset/351781/
- **beamos** — The Legend of Zelda: Ocarina of Time 3D: https://models.spriters-resource.com/3ds/thelegendofzeldaocarinaoftime3d/asset/351781/
- **octorok** — The Legend of Zelda: Ocarina of Time 3D: https://models.spriters-resource.com/3ds/thelegendofzeldaocarinaoftime3d/asset/351769/
- **rock** — The Legend of Zelda: Ocarina of Time 3D: https://models.spriters-resource.com/3ds/thelegendofzeldaocarinaoftime3d/asset/351769/
- **deku** — The Legend of Zelda: Ocarina of Time: https://models.spriters-resource.com/nintendo_64/thelegendofzeldaocarinaoftime/asset/349262/
- **chest** — The Legend of Zelda: Ocarina of Time: https://models.spriters-resource.com/nintendo_64/thelegendofzeldaocarinaoftime/asset/283193/

`scripts/import_adventure_props.py` converts the source OBJ triangles and original
texture atlases to native GX RGBA8 meshes. It normalizes orientation and scale,
and bakes directional lighting from original normals. The Arwing atlas is
encoded at 512×256 to fit the existing 4 MiB archive limit. No replacement mesh
or AI-generated texture is used for these nine actors.

The motion is newly authored: Wolfen sorties, an Arwing background flyby,
Wallmaster-style hand drops and Octorok stone shots. These are contact hazards,
not a port of the original enemy AI. Stones cannot be reflected or destroyed;
Beamos has a timed sweep using the original crossed beam mesh and blue texture. Its original head pieces are posed open around the eye; the sweep is authored, not player-tracking AI. The Arwing
background flight has no collision or damage. The chest is solid. Fighter
specials retain Melee's original physics and hitboxes.

Fox and Young Link's painted backgrounds were edited with the built-in
`image_gen` tool, then retraced and encoded. Prompts:
`assets/custom-stages/mechanisms/ZELDA-STARFOX-PROMPTS.json`. Final paintings:
`assets/custom-stages/worlds/Fx/painted.png` and `worlds/Cl/painted.png`.
The earlier Ganon painting and sword are documented in
`mechanisms/FALCON-GANON-PROMPTS.json`.
