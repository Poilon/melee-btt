// Melee's displayed hundredths span 00..99 across the 60 frames in a second.
// See doldecomp/melee gm_1601.c and m-target getMeleeTimestamp.
export function formatTime(frames) {
  const seconds = Math.floor(frames / 60);
  const hundredths = Math.floor((frames % 60) * 99 / 59);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}
