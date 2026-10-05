# Doc — machinery chambers

This revision replaces the repeated suspended trays and blurred capsule backdrop.
The painted laboratory now has seven solid volumes and twelve pass-through
landings of different widths, plus one moving recovery tray. There is no broad
catch floor beneath the route.

- **Receiving dock:** climb outside the solid storage bench and vial cabinet.
  Two narrow exterior access steps avoid trapping the player behind the cabinet.
- **Process column:** choose an upper route over the solid cyan apparatus or a
  low service-shaft detour. The low target requires retaining a recovery option.
- **Testing chamber:** the floor, right wall and partial ceiling are all solid.
  Enter through the open left side or the upper slot. The target in the pocket
  sits past the dosing press, whose low position blocks the direct walk-through.
- **Upper output:** climb the chamber's outside route to the high landing before
  committing to the overhead target.

The cabinet and process column have orange foreground frames and continuous
dark outlines to make their solid sides readable. Their contours were retraced.

Three surface-mounted chemical devices replace the detached bumper models:

- A green reactive mixing trough sits directly below target 4 on the high
  catwalk. Small safe rims remain, but landing below the target hits the mixture.
- A magenta pressure leak swells from the cabinet's left wall across the last
  narrow exterior step toward target 2. Retraction clears the step's airspace;
  extension punishes waiting on it.
- A ceiling-mounted dosing press extends into the chamber. Its chrome shaft
  telescopes with the head; the mounting plate stays fixed. The low position
  closes the walk-under gap while the retracted position reopens it.

Their sprites preserve transparency in native GX RGBA8 textures. Contact damage
and knockback still use Melee's retail Falco bumper descriptors. The mechanisms
cycle from the start, with no target-triggered gates or mandatory target order.

All target positions and movement keys remain inside the actual painting with
a 24-unit margin. Floor tops and solid contours are traced against the finished
image. The conservative static route audit reaches all nineteen landings; it
does not prove a full clear or competitive balance. Twenty Python checks cover
registration, topology, target clearance, varied solid/soft geometry and bumper
profiles. Only the Dr. Mario stage archive changes in this revision.

Native Dolphin validation boots Doc on stage 44 with ten targets and an advancing
timer. Private-disc contact probes record 0 → 10 → 20 damage for the trough and
press, and 0 → 10 for the column leak. The trough throws Doc from y≈124 to y≈180;
the leak throws him back toward the receiving dock. Native collision sampling
confirms the leak's left edge changes with its scale animation and the press
head travels twelve units. Transparent sprites render without background boxes.
Probes change only their private spawn; the playable disc retains the normal
receiving-dock start. Twenty Python checks and four custom-course Node checks
pass. Only GrTDr.dat changes; the other 25 archives and executable are unchanged.
The latest placement pass preserves every target, the right-hand press and its
shaft, all static terrain, and the recovery tray. The two early hazards now
guard target approaches. A full human clear and difficulty assessment remain
part of the next playtest.

Placement validation: both new locations were viewed in a private Dolphin
profile with ten targets and advancing timers. The retracted leak clears the
upper exterior step; its extended bounds cover that step's jumping space.
The trough is centred beneath target 4 with thirteen units of vertical clearance.
The right-hand press/shaft descriptors and every target/terrain coordinate match
the previous playable revision exactly.

[Artwork](../assets/custom-stages/worlds/Dr/painted.png) and
[generation prompts](../assets/custom-stages/worlds/Dr/ARTWORK.md).
