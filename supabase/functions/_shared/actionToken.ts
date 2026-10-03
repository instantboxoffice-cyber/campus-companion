const enc = new TextEncoder()

function toB64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("ACTION_TOKEN_SECRET")
  if (!secret) throw new Error("Missing ACTION_TOKEN_SECRET")
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

export async function signToken(
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const body = toB64url(enc.encode(JSON.stringify({ ...payload, exp })))
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body))
  return `${body}.${toB64url(new Uint8Array(sig))}`
}

export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), enc.encode(body))
  if (!ok) return null
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)))
  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null
  return payload
}
