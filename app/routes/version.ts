import { VERSION } from "~/version";

// The commit this deployment was built from, so open pages can notice a newer deploy
export function loader() {
  return Response.json(VERSION, { headers: { "Cache-Control": "no-store" } });
}
