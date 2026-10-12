import type { NextRequest } from "next/server";
import { neonAuth } from "@/lib/auth/server";

/**
 * Le relais vers Neon Auth : le navigateur ne parle qu'à l'app, qui pose les
 * cookies de session sur son propre domaine.
 */
type Context = { params: Promise<{ path: string[] }> };

export function GET(request: NextRequest, context: Context) {
  return neonAuth().handler().GET(request, context);
}

export function POST(request: NextRequest, context: Context) {
  return neonAuth().handler().POST(request, context);
}
