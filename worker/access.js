// User identity from Cloudflare Access (Zero Trust). When the app is protected
// by an Access application, every request carries a signed JWT
// (Cf-Access-Jwt-Assertion). Only a verified token is trusted: the plain
// Cf-Access-Authenticated-User-Email header could be forged by anyone who can
// reach the Worker directly, so it is never used on its own.
//
// Configure ACCESS_TEAM_DOMAIN (e.g. "yourteam.cloudflareaccess.com") and
// ACCESS_AUD (the Access application's audience tag). Without them, users are
// recorded as "<name> (unverified)".

let certs = { at: 0, keys: [] };

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const decode = (part) => JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));

async function keysFor(team) {
  if (Date.now() - certs.at < 3600_000 && certs.keys.length) return certs.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs ${res.status}`);
  certs = { at: Date.now(), keys: (await res.json()).keys || [] };
  return certs.keys;
}

/** Returns the verified user's email, or null. */
export async function accessIdentity(request, env) {
  const token = request.headers.get("cf-access-jwt-assertion");
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!token || !team || !aud) return null;
  try {
    const [h, p, s] = token.split(".");
    const header = decode(h), payload = decode(p);
    const jwk = (await keysFor(team)).find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== "RS256") return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
    const auds = [].concat(payload.aud || []);
    if (!ok || !auds.includes(aud) || payload.iss !== `https://${team}` || payload.exp * 1000 < Date.now()) return null;
    return payload.email || null;
  } catch {
    return null;
  }
}
