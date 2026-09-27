// Real SHA-256 content hashing for the audit trail, via the Web Crypto API.
export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Short display form of a full hex hash: first4…last4.
export const short = (h) => (h ? h.slice(0, 4) + "…" + h.slice(-4) : "—");
