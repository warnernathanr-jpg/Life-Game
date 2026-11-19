// Web push: the public half of the VAPID key pair (safe to ship to browsers). The private half lives only in the
// server's VAPID_PRIVATE_KEY environment variable and is needed to send notifications later.
export const VAPID_PUBLIC_KEY = "BEHCsX4IdAvE1qQ4YS7VOrRN_GwQthRCKYiHC3tHhOUFfdQk_FuBmF_r2U0MtHzY6F911i7O7GL0gGF_bGVneKU";

/** VAPID public key as the bytes PushManager.subscribe() wants. */
export function vapidKeyBytes(): Uint8Array<ArrayBuffer> {
  const b64 = VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
