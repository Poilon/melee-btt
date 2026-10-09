import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
// A separate signing key: the relay only receives its public half, never session secrets.
export function spectateSigner(secret) {
  const seed = createHmac("sha256", secret)
    .update("melee-btt/spectate/ed25519/v1")
    .digest();
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(key)
    .export({ format: "pem", type: "spki" })
    .toString();
  return {
    publicKey,
    ticket(profile, now) {
      const claims = {
        aud: "btt-spectate",
        sub: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 900,
      };
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return {
        ticket:
          payload +
          "." +
          sign(null, Buffer.from(payload), key).toString("base64url"),
        expires: claims.exp * 1000,
        relay: "wss://melee-browser-relay.fly.dev/btt-spectate",
      };
    },
  };
}
