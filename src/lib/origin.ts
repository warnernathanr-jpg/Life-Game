/**
 * Public origin of a request ("https://app.example.com"), from the Host /
 * X-Forwarded-* headers. Use instead of `request.url`, which shows the bind
 * address (e.g. 0.0.0.0) behind a proxy.
 */
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim()
    || (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
