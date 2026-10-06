import { timingSafeEqual } from "node:crypto";

// One shared password for the whole family, sent via HTTP Basic Auth (any user
// name). Browsers ask once and remember it. Without APP_PASSWORD the app is open,
// which is only allowed outside Vercel, i.e. in local development.
export function checkPassword(request: Request): Response | null {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.VERCEL) return new Response("APP_PASSWORD is not set", { status: 500 });
    return null;
  }

  const header = request.headers.get("Authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (safeEqual(given, password)) return null;
  }

  return new Response("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Shopocalypse", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
