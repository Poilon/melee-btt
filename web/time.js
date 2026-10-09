// Melee's HUD maps the 60 frame positions in each second to 00..99.
// Retail gm_8016AF0C (gmvs.c) and result timers (gm_1601.c) use 99/59,
// not conventional decimal seconds. Keep stored scores as integer frames.
export function formatSeconds(frames) {
  const seconds = Math.floor(frames / 60);
  const hundredths = Math.floor(((frames % 60) * 99) / 59);
  return `${seconds}.${String(hundredths).padStart(2, "0")}`;
}
export function formatTime(frames) {
  const minutes = Math.floor(frames / 3600);
  return `${String(minutes).padStart(2, "0")}:${formatSeconds(frames % 3600).padStart(5, "0")}`;
}
