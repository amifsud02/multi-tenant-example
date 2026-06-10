/**
 * Local-business data aggregator (OpenStreetMap).
 *
 * Pulls businesses for a set of tenant categories (hair salons, barbershops,
 * beauty & spa, fitness, automotive, etc.) inside a given area from the
 * OpenStreetMap Overpass API, normalizes the raw OSM elements into a tidy
 * shape, classifies each into one of our categories, and writes JSON to disk.
 *
 * Why Overpass and not the "main" OSM API:
 *   The osm.org REST API is for *editing* and only lets you fetch by object id
 *   or a tiny bounding box. For querying "all businesses in <place>" the
 *   read-only Overpass API is the correct OSM endpoint.
 *
 * Usage (Node 22.18+ runs .ts directly via type-stripping):
 *
 *   # Everything, whole of Malta (default area):
 *   node scripts/aggregate-salons.ts
 *
 *   # Specific categories (repeat the flag or comma-separate):
 *   node scripts/aggregate-salons.ts --category "Hair Salon,Barbershop"
 *
 *   # By place name (resolved to an OSM area via Nominatim):
 *   node scripts/aggregate-salons.ts --area "Valletta, Malta"
 *
 *   # By bounding box (south,west,north,east), drop unnamed, custom output:
 *   node scripts/aggregate-salons.ts --bbox 35.88,14.50,35.92,14.53 \
 *     --named-only --out data/valletta.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Overpass is community-run; etiquette requires a descriptive User-Agent and
// asks that you not hammer it. A single query per run is well within limits.
// We list several public mirrors and fall through them — any one can be
// overloaded (504) or briefly reject a request at its WAF (406).
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "multi-tenant-example-business-aggregator/0.1";

// ---------------------------------------------------------------------------
// Category → OpenStreetMap tag mapping
// ---------------------------------------------------------------------------
//
// Each category lists the OSM `key=value` selectors that identify it. A value
// of "*" means "key present with any value"; set `regex: true` to match the
// value as a regular expression.
//
// ORDER MATTERS: a fetched element is classified into the FIRST category whose
// selectors (and optional `refine` predicate) match. So put specific entries
// before general ones — Barbershop before Hair Salon, since OSM has no distinct
// barber tag (both are shop=hairdresser) and we split them by heuristic.

type Selector = { k: string; v: string; regex?: boolean };

type Category = {
  label: string;
  selectors: Selector[];
  /** Extra predicate required for classification (not for the OSM query). */
  refine?: (tags: Record<string, string>) => boolean;
};

const CATEGORIES: Category[] = [
  {
    label: "Barbershop",
    // OSM has no dedicated barber tag — barbers are shop=hairdresser. Treat one
    // as a barbershop when it's flagged male-only or the name says so.
    selectors: [{ k: "shop", v: "hairdresser" }],
    refine: (t) => t.male === "yes" || /barber|barbier/i.test(t.name ?? ""),
  },
  {
    label: "Hair Salon",
    selectors: [{ k: "shop", v: "hairdresser" }],
  },
  {
    label: "Beauty & Spa",
    selectors: [
      { k: "shop", v: "beauty" },
      { k: "shop", v: "massage" },
      { k: "leisure", v: "spa" },
      { k: "amenity", v: "spa" },
    ],
  },
  {
    label: "Fitness & Wellness",
    selectors: [
      { k: "leisure", v: "fitness_centre" },
      { k: "leisure", v: "sports_centre" },
      { k: "leisure", v: "fitness_station" },
      { k: "shop", v: "fitness" },
    ],
  },
  {
    label: "Automotive",
    selectors: [
      { k: "shop", v: "car_repair" },
      { k: "shop", v: "car" },
      { k: "shop", v: "car_parts" },
      { k: "shop", v: "tyres" },
      { k: "shop", v: "motorcycle" },
      { k: "amenity", v: "car_wash" },
      { k: "amenity", v: "fuel" },
    ],
  },
  {
    label: "Home Services",
    selectors: [
      { k: "craft", v: "plumber" },
      { k: "craft", v: "electrician" },
      { k: "craft", v: "carpenter" },
      { k: "craft", v: "painter" },
      { k: "craft", v: "hvac" },
      { k: "craft", v: "builder" },
      { k: "craft", v: "gardener" },
      { k: "craft", v: "roofer" },
      { k: "craft", v: "tiler" },
      { k: "craft", v: "plasterer" },
    ],
  },
  {
    label: "Electronics Repair",
    // OSM rarely tags pure repair shops; craft=electronics_repair is the precise
    // one, the shop=* values also sweep in stores that commonly do repairs.
    selectors: [
      { k: "craft", v: "electronics_repair" },
      { k: "shop", v: "mobile_phone" },
      { k: "shop", v: "computer" },
      { k: "shop", v: "electronics" },
    ],
  },
  {
    label: "Pet Services",
    selectors: [
      { k: "shop", v: "pet" },
      { k: "shop", v: "pet_grooming" },
      { k: "amenity", v: "veterinary" },
    ],
  },
  {
    label: "Gastronomy",
    selectors: [
      { k: "amenity", v: "restaurant" },
      { k: "amenity", v: "cafe" },
      { k: "amenity", v: "fast_food" },
      { k: "amenity", v: "bar" },
      { k: "amenity", v: "pub" },
      { k: "amenity", v: "ice_cream" },
      { k: "amenity", v: "food_court" },
      { k: "shop", v: "bakery" },
      { k: "shop", v: "pastry" },
      { k: "shop", v: "confectionery" },
      { k: "shop", v: "deli" },
    ],
  },
  {
    label: "Healthcare",
    selectors: [
      { k: "amenity", v: "clinic" },
      { k: "amenity", v: "doctors" },
      { k: "amenity", v: "dentist" },
      { k: "amenity", v: "pharmacy" },
      { k: "amenity", v: "hospital" },
      { k: "healthcare", v: "*" },
    ],
  },
];

// "Other" is a UI fallback, not an OSM-queryable category — anything fetched
// that doesn't classify into the above lands here.
const OTHER = "Other";

function selectorToOverpass(sel: Selector): string {
  if (sel.v === "*") return `["${sel.k}"]`;
  if (sel.regex) return `["${sel.k}"~"${sel.v}"]`;
  return `["${sel.k}"="${sel.v}"]`;
}

function tagsMatch(tags: Record<string, string>, sel: Selector): boolean {
  const val = tags[sel.k];
  if (val === undefined) return false;
  if (sel.v === "*") return true;
  if (sel.regex) return new RegExp(sel.v).test(val);
  return val === sel.v;
}

/** Classify an element's tags into the first matching category, else "Other". */
function classify(tags: Record<string, string>, cats: Category[]): string {
  for (const cat of cats) {
    const hit = cat.selectors.some((sel) => tagsMatch(tags, sel));
    if (hit && (!cat.refine || cat.refine(tags))) return cat.label;
  }
  return OTHER;
}

// ---------------------------------------------------------------------------

type Cli = {
  area?: string;
  bbox?: [number, number, number, number];
  out: string;
  /** Category labels to fetch (empty = all). */
  categories: string[];
  /** Drop entries with no `name` tag (mapped but unnamed in OSM). */
  namedOnly: boolean;
};

type Business = {
  /** OSM object id, prefixed with its type, e.g. "node/123" — globally unique. */
  osmId: string;
  type: "node" | "way" | "relation";
  /** Our business category, e.g. "Hair Salon" or "Healthcare". */
  category: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  address: {
    housenumber: string | null;
    street: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
    full: string | null;
  };
  phone: string | null;
  website: string | null;
  email: string | null;
  openingHours: string | null;
  /** Everything OSM knew, untouched, so no data is lost in normalization. */
  tags: Record<string, string>;
};

// --- raw Overpass response shapes -----------------------------------------

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

// --- CLI parsing -----------------------------------------------------------

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    out: "data/businesses.json",
    categories: [],
    namedOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--area":
        cli.area = next;
        i++;
        break;
      case "--bbox": {
        const parts = next?.split(",").map(Number);
        if (!parts || parts.length !== 4 || parts.some(Number.isNaN)) {
          throw new Error("--bbox expects: south,west,north,east");
        }
        cli.bbox = parts as [number, number, number, number];
        i++;
        break;
      }
      case "--category":
        cli.categories.push(
          ...(next ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        );
        i++;
        break;
      case "--out":
        cli.out = next;
        i++;
        break;
      case "--named-only":
        cli.namedOnly = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return cli;
}

/** Resolve requested category labels (case-insensitive) to Category objects. */
function resolveCategories(requested: string[]): Category[] {
  if (requested.length === 0) return CATEGORIES;
  return requested.map((label) => {
    if (label.toLowerCase() === "all") return CATEGORIES;
    const cat = CATEGORIES.find(
      (c) => c.label.toLowerCase() === label.toLowerCase(),
    );
    if (!cat) {
      const known = CATEGORIES.map((c) => `"${c.label}"`).join(", ");
      throw new Error(`Unknown category "${label}". Known: ${known}`);
    }
    return cat;
  }).flat();
}

// --- area resolution -------------------------------------------------------

/**
 * Turn a place name into an Overpass "area" id via Nominatim.
 * Overpass derives area ids from OSM relation/way ids:
 *   area id = 3_600_000_000 + relation id  (or 2_400_000_000 + way id)
 */
async function resolveAreaId(place: string): Promise<number> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(place)}&format=jsonv2&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Nominatim lookup failed: ${res.status} ${res.statusText}`);
  }
  const hits = (await res.json()) as Array<{
    osm_type: "relation" | "way" | "node";
    osm_id: number;
    display_name: string;
  }>;
  const hit = hits.find((h) => h.osm_type === "relation" || h.osm_type === "way");
  if (!hit) {
    throw new Error(`No OSM area found for "${place}". Try a --bbox instead.`);
  }
  const offset = hit.osm_type === "relation" ? 3_600_000_000 : 2_400_000_000;
  console.log(`Resolved "${place}" -> ${hit.display_name}`);
  return offset + hit.osm_id;
}

// --- query building --------------------------------------------------------

function buildQuery(cli: Cli, areaId: number | null, cats: Category[]): string {
  // Collect every selector across the requested categories, deduped (Barbershop
  // and Hair Salon share shop=hairdresser, so it's emitted once).
  const seen = new Set<string>();
  const selectors: string[] = [];
  for (const cat of cats) {
    for (const sel of cat.selectors) {
      const ql = selectorToOverpass(sel);
      if (!seen.has(ql)) {
        seen.add(ql);
        selectors.push(ql);
      }
    }
  }

  // Spatial filter applied to each member of the union.
  const scope =
    areaId !== null ? "(area.searchArea)" : `(${cli.bbox!.join(",")})`;
  // `nwr` = nodes + ways + relations. `out center tags` gives a single
  // representative lat/lon even for ways/relations (which are polygons).
  const members = selectors.map((s) => `  nwr${s}${scope};`).join("\n");
  const areaLine = areaId !== null ? `area(${areaId})->.searchArea;\n` : "";

  return `[out:json][timeout:120];
${areaLine}(
${members}
);
out center tags;`;
}

// --- fetch & normalize -----------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  let lastErr = "";
  // Try each mirror; retry a mirror once after a short backoff, since 504/406
  // from these public servers are frequently transient.
  for (const url of OVERPASS_MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          // Overpass's WAF rejects requests with no Accept header (Node's fetch
          // omits it by default, unlike curl) with a 406.
          Accept: "application/json",
        },
        body: `data=${encodeURIComponent(query)}`,
      }).catch((e) => {
        lastErr = String(e);
        return null;
      });

      if (res?.ok) {
        const json = (await res.json()) as OverpassResponse;
        return json.elements ?? [];
      }
      lastErr = res
        ? `${res.status} ${res.statusText}`
        : lastErr || "network error";
      console.warn(`  ${new URL(url).host} → ${lastErr} (attempt ${attempt})`);
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`All Overpass mirrors failed. Last error: ${lastErr}`);
}

function normalize(el: OverpassElement, cats: Category[]): Business {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;

  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:postcode"],
    tags["addr:city"],
    tags["addr:country"],
  ].filter(Boolean);

  return {
    osmId: `${el.type}/${el.id}`,
    type: el.type,
    category: classify(tags, cats),
    name: tags.name ?? null,
    lat,
    lon,
    address: {
      housenumber: tags["addr:housenumber"] ?? null,
      street: tags["addr:street"] ?? null,
      city: tags["addr:city"] ?? null,
      postcode: tags["addr:postcode"] ?? null,
      country: tags["addr:country"] ?? null,
      full: parts.length ? parts.join(", ") : null,
    },
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    website: tags.website ?? tags["contact:website"] ?? null,
    email: tags.email ?? tags["contact:email"] ?? null,
    openingHours: tags.opening_hours ?? null,
    tags,
  };
}

// --- main ------------------------------------------------------------------

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const cats = resolveCategories(cli.categories);
  console.log(`Categories: ${cats.map((c) => c.label).join(", ")}`);

  let areaId: number | null = null;
  if (cli.bbox) {
    console.log(`Searching bbox ${cli.bbox.join(",")}`);
  } else if (cli.area) {
    areaId = await resolveAreaId(cli.area);
  } else {
    // Default: the whole of Malta (OSM relation 365307).
    console.log('No --area/--bbox given; defaulting to "Malta".');
    areaId = await resolveAreaId("Malta");
  }

  const query = buildQuery(cli, areaId, cats);
  console.log("Querying OpenStreetMap Overpass API…");
  const elements = await fetchOverpass(query);
  console.log(`Got ${elements.length} raw element(s).`);

  const all = elements.map((el) => normalize(el, cats));
  const businesses = all
    // With --named-only, drop entries OSM never gave a name tag.
    .filter((b) => !cli.namedOnly || b.name)
    // Group by category, then name, for a stable readable file.
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        (a.name ?? "~").localeCompare(b.name ?? "~"),
    );

  const dropped = all.length - businesses.length;
  if (cli.namedOnly && dropped > 0) {
    console.log(`Dropped ${dropped} unnamed entr${dropped === 1 ? "y" : "ies"}.`);
  }

  // Tally how many of each category came back.
  const byCategory: Record<string, number> = {};
  for (const b of businesses) {
    byCategory[b.category] = (byCategory[b.category] ?? 0) + 1;
  }

  const output = {
    source: "OpenStreetMap via Overpass API",
    license: "ODbL — https://www.openstreetmap.org/copyright",
    query: {
      categories: cats.map((c) => c.label),
      area: cli.area ?? null,
      bbox: cli.bbox ?? null,
    },
    generatedAt: new Date().toISOString(),
    count: businesses.length,
    byCategory,
    businesses,
  };

  const outPath = resolve(process.cwd(), cli.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");

  const withName = businesses.filter((b) => b.name).length;
  console.log(`\nWrote ${businesses.length} business(es) (${withName} named) to ${cli.out}`);
  console.log(
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n"),
  );
}

main().catch((err) => {
  console.error("\nAggregation failed:", err.message);
  process.exit(1);
});
