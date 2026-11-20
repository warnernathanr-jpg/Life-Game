// The app's public address (invite links use it, whichever address the player opened the app on).
export const SITE_HOST = "www.lifecity.app";

/** The origin for links to share: lifecity.app in production, the local server when running locally. */
export function shareOrigin(requestHost: string | null, proto: string | null): string {
  if (requestHost && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost)) return `${proto ?? "http"}://${requestHost}`;
  return `https://${SITE_HOST}`;
}
