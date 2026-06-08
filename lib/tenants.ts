// ---------------------------------------------------------------------------
// Tenant configuration (POC — no database, just this file)
// ---------------------------------------------------------------------------
//
// Two ways a request reaches a tenant's /book-now/[tenant-id] page:
//
//   1. Subdomain of the root domain:   acme.example.com  -> /book-now/acme
//   2. A fully custom domain:          acmebooking.com   -> /book-now/acme
//
// The root domain is what we treat subdomains as belonging to. Override it per
// environment with NEXT_PUBLIC_ROOT_DOMAIN (e.g. "yourdomain.com" in prod).
// Locally, modern browsers resolve *.localhost to 127.0.0.1, so the default
// lets you visit http://acme.localhost:3000 with no /etc/hosts edits.

export const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

export type Tenant = {
  /** URL-safe id; also the subdomain and the /book-now/[tenant-id] segment. */
  id: string;
  /** Display name shown on the booking page. */
  name: string;
  /** Accent color used to brand the booking page. */
  color: string;
  /** A short tagline for the booking page. */
  tagline: string;
  /**
   * Fully custom domains (apex or otherwise) that map to this tenant.
   * e.g. ["acmebooking.com", "www.acmebooking.com"]. Optional.
   */
  customDomains?: string[];
};

export const tenants: Tenant[] = [
  {
    id: "acme",
    name: "Acme Salon",
    color: "#e11d48",
    tagline: "Cuts, color, and good vibes.",
    customDomains: ["acmebooking.com", "www.acmebooking.com"],
  },
  {
    id: "globex",
    name: "Globex Dental",
    color: "#0ea5e9",
    tagline: "Brighter smiles, booked in seconds.",
    customDomains: ["globexdental.com"],
  },
  {
    id: "initech",
    name: "Initech Auto",
    color: "#16a34a",
    tagline: "Service appointments without the hold music.",
  },
];

/** Look up a tenant by its id (the /book-now/[tenant-id] segment). */
export function getTenantById(id: string): Tenant | undefined {
  return tenants.find((t) => t.id === id);
}

/** Look up a tenant by one of its fully custom domains. */
export function getTenantByCustomDomain(host: string): Tenant | undefined {
  return tenants.find((t) => t.customDomains?.includes(host));
}
