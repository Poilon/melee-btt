"""Signature encounters on the traced foreground, in authored world units.

The move is a suggested shortcut, never an input requirement. Landings retain
their original geometry; attacks, gravity, float and recovery stay native.
These records describe design intent, not a claim of a human-completed route.
"""
import math

# target (zero-based), position, launch/return surface, tool, route intention.
ENCOUNTERS = {
 'Pe': [
  (2, (-56,114), 2, 'Jump / float forward air', 'Jump from the western balcony and float below the solid bridge. Missing the crossing now drops into the open ravine.'),
  (4, (56,114), 3, 'Float / back air', 'Chain the underside targets and descend to the eastern island, keeping Parasol for the long return.'),
  (5, (222,146), 3, 'Float / turnip', 'Leave the upper balcony for the outer patrol, then return or descend to the island.'),
  (6, (76.94,-20.65), 5, 'Drop / float / Parasol', 'Catch the low ravine target and land on the small passing gondola before recovering to the eastern island.'),
  (8, (0,101), 4, 'Float / up air', 'Pass under the middle of the solid bridge. There is no fountain or safe central island beneath this target.'),
  (9, (-75,58), 1, 'Turnip / neutral air', 'Attack beyond the lower balcony and keep the return jump for the same narrow lip.')],
 'Ys': [
  (3, (-57,179), 4, 'Double jump / up air', 'Rise beside the hanging block and drift back toward the western craft ledge.'),
  (4, (14,202), 5, 'Up air', 'Catch the western roof target separately, leaving the long egg arc toward the eastern cliff unobstructed.'),
  (5, (110,191), 4, 'Jump / Egg Throw', 'Jump from the western high ledge and lob an egg over the hanging block, or cross its solid roof.'),
  (8, (63,111), 5, 'Egg Throw / forward air', 'Curve an egg beneath the block from the cliff edge, or descend into the open pocket and save the double jump.'),
  (9, (-40,24), 1, 'Double jump / neutral air', 'Drop into the sea gap for the low arc and save the double jump to return to the cliff or moving nest.')],
 'Dk': [
  (6, (90,130), 2, 'Back air / Spinning Kong', 'Fall beside the solid trunk, reverse the aerial and catch the swinging vine knot as it returns towards the trunk; jump off towards the eastern branch.'),
  (9, (290,43), 6, 'Forward air / Spinning Kong', 'Drop beyond the high eastern log for the outer target, then steer the descent onto the lower dock.')],
 'Ca': [
  (1, (-35,36), 0, 'Boost / full jump neutral air', 'Run over the rightward speed strip and jump during the boost to cross the first pit; steer through the middle target lane.'),
  (4, (-270,135), 4, 'Back air', 'Reverse an aerial beyond the short upper overpass before landing on the longer deck below.'),
  (8, (447,108), 2, 'Double jump / up air', 'Overshoot the final overpass for the high outside hit; drift back onto the small finish ledge.')],
 'Cl': [
  (0, (-171, 42), 4, 'Fire Arrow / forward air', 'Shoot into the first lift shaft from the starting island, or intercept it from the basket.'),
  (1, (-115, 89), 4, 'Boomerang', 'Throw past the lower branch before boarding the long climbing basket.'),
  (2, (-46, 140), 10, 'Wall jump / back air', 'Leave the basket for the narrow gap next to the solid trunk, strike inward and wall jump back.'),
  (3, (-157, 190), 10, 'Fire Arrow / up air', 'Intercept the outside target from the rising basket while the rooted Deku Baba blocks the upper branch.'),
  (4, (-80, 252), 14, 'Spin Attack / up air', 'Climb to the small western crown branch before sweeping upward.'),
  (5, (-14, 302), 16, 'Open chest / up air', 'Strike the closed summit chest, wait for its lid to open, then break the revealed target.'),
  (6, (150, 250), 11, 'Boomerang / forward air', 'Ride the eastern basket to its upper stop and throw into the outside crown lane.'),
  (7, (125, 184), 11, 'Boomerang / back air', 'Reach around the eastern branch, then turn back before dropping past it.'),
  (8, (84, 110), 5, 'Fire Arrow / neutral air', 'Jump from the lower eastern branch and attack beneath the upper canopy.'),
  (9, (146, 22), 5, 'Down air / Spin Attack', 'Drop into the eastern open shaft, hit low and recover to the basket or starting island.'),
 ],
 'Fc': [
  (0, (-279, 52), 3, 'Short-hop laser', 'Fire along the west fire escape before climbing.'),
  (1, (-273, 104), 4, 'Double jump / up air', 'Climb outside the west tower; the solid wall blocks an inward diagonal.'),
  (2, (-279, 164), 1, 'Arwing / back air', 'Climb the western fire escape and jump outside the roof for a back air.'),
  (3, (-44, 151), 5, 'Laser', 'Shoot across the central gap while the Arwing crosses above.'),
  (4, (20, 181), 5, 'Falco Phantasm / forward air', 'Cross the central aerial lane with Phantasm, then recover towards the western roof.'),
  (5, (83, 194), 5, 'Laser / Fire Bird', 'Intercept the target beside the eastern tower without recovering into its wall.'),
  (6, (168, 283), 8, 'Double jump / up air', 'Reach the antenna before chasing the high moving target.'),
  (7, (331, 149), 7, 'Arwing / forward air / Fire Bird', 'Jump out from the eastern roof and keep Fire Bird for the return.'),
  (8, (281, 40), 7, 'Down air / jump', 'Drop through the eastern fire escape and attack below, keeping the double jump for the return.'),
  (9, (5, 61), 5, 'Down air / Falco Phantasm', 'Drop below the central ledge for the ravine target, then Phantasm back to a foundation.'),
 ],
 'Fx': [
  (0,(-245,38),0,'Blaster','Clear the starting dock lane.'),
  (1,(-190,81),1,'Back air','Turn back above the small service step.'),
  (2,(-60,101),2,'Reflector / Fire Fox','Drop outside the solid pylon and recover around its right edge.'),
  (3,(-124,149),2,'Up air','Reach above the pylon before moving onto the boarding lip.'),
  (4,(-38,188),3,'Double jump / neutral air','Wait at the short boarding lip and intercept a native aircraft.'),
  (5,(45,237),3,'Arwing / up air','Board a passing aircraft to reset your jumps over the central void.'),
  (6,(130,267),3,'Arwing / double jump / up air','Use the aircraft as a launch point for the highest target; keep a recovery back towards a dock.'),
  (7,(265,235),4,'Arwing / back air','Ride into the far flight lane before jumping to the high outside target.'),
  (8,(246,124),4,'Blaster','Land on the isolated receiving dock and clear its firing lane.'),
  (9,(136,64),4,'Forward air / Fire Fox','Drop outside the receiving dock wall, hit inward, then recover above the rim.'),
 ],
 'Ic': [
  (8, (-54,344), 9, 'Double jump / up air', 'Cross the summit patrol before jumping outside the western edge for the final hammer arc.'),
  (0, (-15,12), 0, 'Ice Shot', 'Send ice along the base before climbing onto the drifting floe.'),
  (3, (-120,120), 3, 'Forward-air hammer', 'Catch the outside hammer target from the lower drifting floe; keep the return jump for the shelf.'),
  (7, (92,300), 8, 'Blizzard / back air', 'Leave the eastern floe for the outside hammer hit, then return to the summit below the Topi patrol.')],
 'Kb': [],
 'Lk': [
  (0, (-239, 56), 3, 'Arrow / forward air', 'Clear the first step before timing the forest shutter.'),
  (1, (-202, 139), 1, 'Up air', 'Attack above the western temple tower before crossing towards the high sanctuary.'),
  (2, (-91, 115), 11, 'Boomerang', 'Curve a boomerang below the high western ledge from the side; the stonework blocks a low straight shot.'),
  (3, (6, 215), 13, 'Double jump / up air', 'Reach the crown before intercepting the high arcing target.'),
  (4, (126, 158), 12, 'Boomerang / forward air', 'Catch the apparition beyond the east balcony before it moves up and inward.'),
  (5, (230, 86), 2, 'Back air / Spin Attack', 'Drop outside the eastern tower and return to the exterior step with Spin Attack.'),
  (6, (94, 51), 8, 'Bomb throw / boomerang', 'Throw from the eastern shrine shelf into its low target pocket.'),
  (7, (0, 18), 0, 'Returning boomerang', 'Throw away from the crest doorway, then drop to the lower floor so the return curves into the recessed opening under the solid lintel.'),
  (8, (-138, 30), 7, 'Boomerang / Spin Attack', 'Drop into the western broken walkway for a low outward hit, then recover past the gate.'),
  (9, (267, 115), 6, 'Boomerang / Spin Attack', 'Attack beyond the tower and bend the return toward the lower exterior step.'),
 ],
 'Ms': [
  (4, (-151,162), 1, 'Drawbridge / forward air', 'Cross the moving bridge between the west tower and keep; the target hangs over the actual gap.'),
  (6, (42,224), 10, 'Double jump / up air', 'Save the second jump for the high sword arc above the keep.'),
  (7, (306,157), 12, 'Forward air / Dolphin Slash', 'Round the outer rampart before recovering onto its upper ledge.'),
  (3, (-149,87), 7, 'Forward-air sword arc', 'Drop through the inner stair and sweep upward along its underside, away from the solid tower.'),
  (5, (-4,204), 10, 'Up tilt / up air', 'Catch the central overhead target from the keep before committing to the higher sword arc.'),
  (8, (46,30), 0, 'Forward smash', 'Drop through the inner stair for the low sword hit, then climb back toward the roof drawbridge.')],
 'Mt': [
  (7, (-40,96), 10, 'Back air / Teleport', 'Intercept the disappearing cell target beside the lower shutter, then teleport past the wall as it descends.'),
  (5, (28,211), 9, 'Shadow Ball / up air', 'Intercept the orbit from the upper containment ring before teleporting down.'),
  (4, (-68,221), 9, 'Double jump / Teleport', 'Take the high outside detour, attack before teleporting and reappear on the upper containment ring.'),
  (8, (176,18), 2, 'Shadow Ball / back air', 'Send Shadow Ball through the low eastern lane, or descend around the ledge before teleporting back.')],
 'Ns': [
  (0,(12,19),0,'PK Fire / dash attack','Commit to the narrow street during a gap in the original Onett traffic.'),
  (4,(18,171),9,'PK Thunder','Guide the bolt underneath the isolated island; approaching from a roof leaves room to curve it.'),
  (5,(21,212),9,'PK Thunder 2 / up air','Launch from above the school with PK Thunder 2 to land on the isolated high island, then finish the high target.'),
  (6,(174,159),2,'PK Thunder / up air','Aim a rising bolt from the school roof, leaving the aerial launch lane open.')],
 'Pc': [
  (0, (-243,12), 10, 'Thunder Jolt / Agility', 'Catch the low outside contact and angle Agility back above the first shelf.'),
  (5, (9,120), 4, 'Up air', 'Rise through the center of the compact battery room without drifting into the casing.'),
  (9, (138,80), 5, 'Thunder Jolt / neutral air', 'Catch the target above the eastern casing as Electrode rolls away, or shoot into the lane from the narrow middle shelf.')],
 'Pk': [
  (0, (-213,20), 0, 'Thunder Jolt', 'Start with the outer coil lane, then use the inspection lift to set up the climb.'),
  (2, (-151,94), 4, 'Back air / Quick Attack', 'Catch the outside coil target and bend Quick Attack toward the next shelf.'),
  (5, (51,249), 10, 'Thunder / up air', 'Line up Thunder above the crown between Zapdos passes, or jump into the flight lane for an aerial hit.')],
 'Pr': [
  (3, (-180,145), 3, 'Multiple jumps / back air', 'Leave the western spiral for the moving Clefairy; refill jumps on its tiny head before climbing back.'),
  (6, (174,206), 7, 'Pound / forward air', 'Take the eastern detour below the upper moon and use the second Clefairy as a small recovery landing.'),
  (1, (-183,27), 2, 'Multiple jumps / back air', 'Dip outside the moon path and return with spare jumps instead of following every step.'),
  (4, (76,123), 5, 'Forward air / Pound', 'Cross beneath the middle moon, then regain height on the eastern route.'),
  (9, (67,330), 9, 'Multiple jumps / up air', 'Leave the final tiny landing for a high outward detour; reserve jumps for the return.')],
 'Ss': [
  (1, (68,65), 1, 'Missile / forward air', 'Fire into the lower chamber along the Metroid patrol, or follow behind it through the tunnel.'),
  (0, (151,17), 0, 'Missile / Charge Shot', 'Shoot into the eastern bottom chamber from beside the central block, not through it.'),
  (3, (46,99), 1, 'Missile', 'Use the long chamber as a firing lane before climbing around the next solid ceiling.'),
  (8, (82,267), 3, 'Missile / Charge Shot', 'Sweep the upper tunnel from the western ledge, timing the moving target on the same lane.')],
 'Sk': [
  (4, (-108,179), 5, 'Descending Needles / back air', 'Drop along the outside of the shadow step and aim inward before the next landing disappears.'),
  (7, (111,280), 8, 'Forward air / Vanish', 'Catch the eastern outside target before vanishing inward to the upper stairs.'),
  (8, (-72,382), 9, 'Double jump / up air', 'Take the western roof detour before changing direction for the final apparition.')],
 'Zd': [
  (5, (19,201), 8, 'Up air', 'Intercept the orbit over the central altar before returning to a prism.'),
  (3, (-179,197), 9, 'Forward air', 'Catch the western apparition above the high balcony before it shifts inward.'),
  (1, (-122,39), 3, "Din's Fire / forward air", 'Aim into the low temple pocket or descend toward it between the outer balconies.'),
  (4, (-21,116), 7, 'Up air / Farore’s Wind', 'Catch the underside of the central balcony from the timed prism sequence.'),
  (8, (248,120), 6, "Din's Fire / forward air", 'Reach beyond the eastern pillar before returning with Farore’s Wind.')],
 'Gw': [
  (7, (-68,166), 3, 'Up air / Fire', 'Cross the falling-tool shaft during its rest, then return toward the next rescue team.'),
  (0, (-155,54), 1, 'Chef / neutral air', 'Lob Chef upward beside the first window, or climb and strike it directly.'),
  (2, (-188,145), 3, 'Back air / Fire', 'Leave the outside of the upper window sill and recover with Fire along the building edge.'),
  (6, (161,66), 7, 'Up air', 'Leave the moving rescue team for the ambulance roof and catch the overhead target.')],
 'Fe': [
  (3, (-55,157), 4, 'Forward air / Blazer', 'Wait for the Binding Blade to withdraw from the inner stair, then move close enough for Roy’s strong sword hit.'),
  (0, (-216,52), 1, 'Forward tilt / neutral air', 'Stay close to the opening landing for the first sword hit before crossing the rising bridge.'),
  (2, (-112,126), 3, 'Forward air', 'Hit just beyond the western rampart on the way to the central ascent.'),
  (8, (181,159), 11, 'Back air / Blazer', 'Drop to the inside of the eastern staircase, turn the sword inward and recover onto the narrow step.')],
 'Gn': [
  (0,(-222,51),2,'Forward tilt','Catch the target from the first small ledge before climbing the western ruins.'),
  (1,(-109,73),4,'Back air / Wizard Foot','Drop beneath the western overhang; a late aerial Wizard Foot can take the underside hit, but keep the ferry in reach for the landing.'),
  (2,(-235,95),3,'Double jump / back air','Jump outside the western stair and turn back before spending the second jump.'),
  (3,(-55,160),5,'Up air / neutral air','Intercept the apparition above the western balcony, or wait for its return beside the crushing seal.'),
  (4,(0,9),6,'Jab / up air','Ride the low ferry under the solid bastion; break the target without jumping into the stone ceiling.'),
  (5,(21,124),6,'Forward tilt / neutral air','Wait on the balcony for the seal to rise, drop to the bastion and attack beside its blade.'),
  (6,(182,98),8,'Back air / Dark Dive','Follow the vertical target from the throne lift; retain the second jump for the return.'),
  (7,(73,113),7,'Back air','Reach below the inner eastern balcony from the bastion, waiting for the falling hand to withdraw.'),
  (8,(228,234),9,'Double jump / up air','Disembark the lift, reach the throne and sweep the high target with the upper aerial arc.'),
  (9,(286,-18),1,'Double jump / up air / Dark Dive','Drop outside the eastern foundation, rise into the low target with an up air, then steer Dark Dive back to the upper rim.')],

}


def apply_encounters(art):
    from character_routes import unobstructed
    records = ENCOUNTERS.get(art.suffix, [])
    for index, point, support, move, hint in records:
        art.targets[index] = point
        art.route_notes[index].update(position=point, support=art.authored_surfaces[support],
            setup='signature', move=move, hint=hint, optionalShortcut=True)
        if index not in art.trials: art.trials.append(index)
    # Check the complete final arrangement, rather than incremental assignments
    # against targets that will move later in this same pass.
    for i, (x,y) in enumerate(art.targets):
        if not unobstructed(art,x,y):
            raise ValueError(f'{art.suffix}: signature target {i+1} intersects scenery at {(x,y)}')
        if any(math.dist((x,y),q)<17 for q in art.targets[:i]):
            raise ValueError(f'{art.suffix}: signature target {i+1} overlaps another target')
    art.signature_targets = [r[0]+1 for r in records]
