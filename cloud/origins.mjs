// Installed clients bind browser requests and saved accounts to this exact origin.
// Keep the original release endpoint valid after adding custom domains.
const publicOrigins = new Set([
  'https://target-test-randomizer-challenge.vercel.app',
  'https://melee-btt.com',
  'https://www.melee-btt.com',
]);
export function requestOrigin(host, fallback) {
  const requested = `https://${host}`;
  return requested === fallback || publicOrigins.has(requested) ? requested : fallback;
}
