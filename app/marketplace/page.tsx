import type { Metadata } from "next";
import { getBusinesses, getCategories, getStats } from "@/lib/businesses";
import Marketplace from "./Marketplace";

export const metadata: Metadata = {
  title: "Business Marketplace · Malta",
  description: "Browse local businesses across Malta on an interactive map.",
};

export default function MarketplacePage() {
  // Server Component: load + shape the data on the server, hand the trimmed
  // listings to the interactive client (search, filters, map selection).
  const businesses = getBusinesses();
  const categories = getCategories();
  const stats = getStats();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null;

  return (
    <Marketplace
      businesses={businesses}
      categories={categories}
      stats={stats}
      mapboxToken={mapboxToken}
    />
  );
}
