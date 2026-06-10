// ---------------------------------------------------------------------------
// Business marketplace data (POC — sourced from data/businesses-malta.json)
// ---------------------------------------------------------------------------
//
// The JSON is OpenStreetMap data (ODbL) aggregated by scripts/aggregate-salons.ts.
// We read it once at module load and expose a trimmed, strongly-typed listing
// shape. Only the fields the marketplace UI needs are carried through to the
// client, keeping the client bundle small (the raw `tags` blob is dropped).
//
// Categories are free-text strings supplied by the data (e.g. "Beauty & Spa"),
// so the UI derives the category list dynamically rather than hard-coding it.

import rawData from "@/data/businesses-malta.json";

/** The shape passed to the marketplace UI (and on to the map client). */
export type BusinessListing = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  /** Best human-readable location string we can assemble, or null. */
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  openingHours: string | null;
};

type RawBusiness = {
  osmId: string;
  category: string;
  name: string;
  lat: number;
  lon: number;
  address: {
    full: string | null;
    city: string | null;
  };
  phone: string | null;
  website: string | null;
  email: string | null;
  openingHours: string | null;
};

type RawData = {
  count: number;
  byCategory: Record<string, number>;
  businesses: RawBusiness[];
};

const data = rawData as RawData;

function toListing(b: RawBusiness): BusinessListing {
  return {
    id: b.osmId,
    name: b.name,
    category: b.category,
    lat: b.lat,
    lon: b.lon,
    address: b.address.full,
    city: b.address.city,
    phone: b.phone,
    website: b.website,
    email: b.email,
    openingHours: b.openingHours,
  };
}

/** All businesses that have valid coordinates and a name, sorted by name. */
export function getBusinesses(): BusinessListing[] {
  return data.businesses
    .filter(
      (b) =>
        typeof b.lat === "number" &&
        typeof b.lon === "number" &&
        Boolean(b.name),
    )
    .map(toListing)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type CategoryMeta = {
  /** Solid accent (map circle, chip dot). */
  color: string;
  /** Gradient stops for the card cover tile. */
  from: string;
  to: string;
  /** An emoji icon — the data has no photos, so this gives each card identity. */
  icon: string;
};

export type CategoryInfo = CategoryMeta & { name: string; count: number };

// Visual identity per category. The OSM data carries no imagery, so a colored
// gradient + emoji stands in for the photo tile a real marketplace would show.
// These values are reused by the cards, the chips, and the map.
const META: Record<string, CategoryMeta> = {
  Automotive: { color: "#0ea5e9", from: "#38bdf8", to: "#0369a1", icon: "🚗" },
  Barbershop: { color: "#7c3aed", from: "#a78bfa", to: "#5b21b6", icon: "💈" },
  "Beauty & Spa": { color: "#e11d48", from: "#fb7185", to: "#9f1239", icon: "💆" },
  "Electronics Repair": { color: "#f59e0b", from: "#fbbf24", to: "#b45309", icon: "📱" },
  "Fitness & Wellness": { color: "#10b981", from: "#34d399", to: "#047857", icon: "🏋️" },
  Gastronomy: { color: "#ef4444", from: "#fb923c", to: "#dc2626", icon: "🍽️" },
  "Hair Salon": { color: "#a855f7", from: "#c084fc", to: "#7e22ce", icon: "✂️" },
  Healthcare: { color: "#06b6d4", from: "#22d3ee", to: "#0e7490", icon: "⚕️" },
  "Home Services": { color: "#84cc16", from: "#a3e635", to: "#4d7c0f", icon: "🛠️" },
  "Pet Services": { color: "#ec4899", from: "#f9a8d4", to: "#be185d", icon: "🐾" },
};

export const FALLBACK_COLOR = "#71717a"; // zinc-500
const FALLBACK_META: CategoryMeta = {
  color: FALLBACK_COLOR,
  from: "#a1a1aa",
  to: "#52525b",
  icon: "📍",
};

export function categoryMeta(category: string): CategoryMeta {
  return META[category] ?? FALLBACK_META;
}

export function colorForCategory(category: string): string {
  return categoryMeta(category).color;
}

/** Category metadata (name, count, color, gradient, icon) by descending count. */
export function getCategories(): CategoryInfo[] {
  return Object.entries(data.byCategory)
    .map(([name, count]) => ({ name, count, ...categoryMeta(name) }))
    .sort((a, b) => b.count - a.count);
}

export function getStats() {
  return { total: data.count };
}
