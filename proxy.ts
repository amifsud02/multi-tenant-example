import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rootDomain, getTenantByCustomDomain } from "@/lib/tenants";

// In Next.js 16, Middleware is called Proxy. This runs before every matched
// request and rewrites tenant hostnames to the shared /book-now/[tenant-id]
// route, so the URL in the browser stays clean (e.g. acme.example.com/).

export const config = {
  // Run on everything except Next internals, the API, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export function proxy(request: NextRequest) {
  // Host header without the port, e.g. "acme.localhost" or "acmebooking.com".
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const rootHost = rootDomain.split(":")[0];
  const { pathname } = request.nextUrl;

  // Already under /book-now — let it render as-is. This keeps the rewrite from
  // looping and lets you hit /book-now/acme directly during development.
  if (pathname.startsWith("/book-now")) {
    return NextResponse.next();
  }

  // 1. Fully custom domain -> that tenant's booking page.
  const customTenant = getTenantByCustomDomain(host);
  if (customTenant) {
    return rewriteToTenant(request, customTenant.id, pathname);
  }

  // 2. Subdomain of the root domain -> use the subdomain as the tenant id.
  //    "acme.localhost" with root "localhost" => "acme".
  //    "www" is treated as the root site, not a tenant.
  if (host !== rootHost && host.endsWith(`.${rootHost}`)) {
    const subdomain = host.slice(0, -1 * `.${rootHost}`.length);
    if (subdomain && subdomain !== "www") {
      return rewriteToTenant(request, subdomain, pathname);
    }
  }

  // 3. Root domain (or anything unrecognized) -> the marketing/landing page.
  return NextResponse.next();
}

function rewriteToTenant(request: NextRequest, tenantId: string, pathname: string) {
  const url = request.nextUrl.clone();
  // Preserve any sub-path after the host (usually "/").
  url.pathname = `/book-now/${tenantId}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}
