"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  categoryMeta,
  type BusinessListing,
  type CategoryInfo,
} from "@/lib/businesses";
import BusinessMap from "./BusinessMap";

// Cap cards per horizontal row (browse mode) and per focused-category grid.
const ROW_LIMIT = 15;
const GRID_LIMIT = 120;

type Props = {
  businesses: BusinessListing[];
  categories: CategoryInfo[];
  stats: { total: number };
  mapboxToken: string | null;
};

export default function Marketplace({
  businesses,
  categories,
  stats,
  mapboxToken,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | "all">("all");
  const [town, setTown] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLElement>(null);

  const towns = useMemo(() => {
    const set = new Set<string>();
    for (const b of businesses) if (b.city) set.add(b.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [businesses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return businesses.filter((b) => {
      if (filter !== "all" && b.category !== filter) return false;
      if (town && b.city !== town) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        (b.city?.toLowerCase().includes(q) ?? false) ||
        (b.address?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [businesses, query, filter, town]);

  // Browse mode (no specific category): group matches into per-category rows.
  const rows = useMemo(() => {
    const byCat = new Map<string, BusinessListing[]>();
    for (const b of filtered) {
      const arr = byCat.get(b.category);
      if (arr) arr.push(b);
      else byCat.set(b.category, [b]);
    }
    return categories
      .map((c) => ({ cat: c, items: byCat.get(c.name) ?? [] }))
      .filter((r) => r.items.length > 0);
  }, [filtered, categories]);

  function handleSelect(id: string) {
    setSelectedId(id);
    mapSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    document
      .getElementById("results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const focused = filter !== "all";

  return (
    <main className="mkt flex flex-1 flex-col bg-[var(--paper)] text-[var(--ink)]">
      {/* ---------------- Header ---------------- */}
      <header className="mkt-hero-soft sticky top-0 z-30 flex h-16 items-center border-b border-black/[.06]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-baseline gap-1">
            <span className="mkt-display text-2xl lowercase">MBM</span>
            <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-rose-500" />
          </Link>
          <span className="text-sm text-[var(--muted)]">
            {stats.total.toLocaleString()} places · Malta
          </span>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="mkt-hero px-5 pt-16 pb-14 text-center">
        <h1 className="mkt-display mx-auto max-w-4xl text-[2.6rem] leading-[1.02] text-[var(--ink)] sm:text-6xl">
          Eat Well. Feel Good. Explore More.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[#3a3030] sm:text-lg">
          Connect with Malta&apos;s leading restaurants, beauty experts, wellness
          providers, fitness studios, and lifestyle businesses—all from a single
          platform.
        </p>

        {/* Segmented search pill */}
        <form
          onSubmit={handleSearch}
          className="mx-auto mt-9 flex w-full max-w-4xl flex-col gap-1 rounded-3xl border border-white/60 bg-white/85 p-2 shadow-[0_20px_50px_-20px_rgba(80,40,90,0.35)] backdrop-blur sm:flex-row sm:items-center sm:rounded-full sm:p-2 sm:pl-3"
        >
          <Field icon={<IconSearch className="h-5 w-5" />}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="All treatments"
              className="w-full bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
            />
          </Field>

          <Divider />

          <Field icon={<IconPin className="h-5 w-5" />}>
            <Select
              value={town}
              onChange={setTown}
              placeholder="All of Malta"
              options={towns}
            />
          </Field>

          <Divider />

          <Field icon={<IconGrid className="h-5 w-5" />}>
            <Select
              value={filter === "all" ? "" : filter}
              onChange={(v) => setFilter(v || "all")}
              placeholder="Any category"
              options={categories.map((c) => c.name)}
            />
          </Field>

          <button
            type="submit"
            className="mt-1 shrink-0 rounded-full bg-[var(--ink)] px-7 py-3 text-[15px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 sm:mt-0"
          >
            Search
          </button>
        </form>
      </section>

      {/* ---------------- Category rail (sticky) ---------------- */}
      <div className="sticky top-16 z-20 border-b border-[var(--line)] bg-[var(--paper)]/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mkt-rail -mx-5 flex gap-2 overflow-x-auto px-5 py-3">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              <span>All</span>
              <span className="opacity-50">{stats.total}</span>
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.name}
                active={filter === c.name}
                onClick={() => setFilter(c.name)}
              >
                <span aria-hidden>{c.icon}</span>
                <span>{c.name}</span>
                <span className="opacity-50">{c.count}</span>
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- Results ---------------- */}
      <div
        id="results"
        className="mx-auto w-full max-w-6xl scroll-mt-32 px-5 pt-8"
      >
        <div className="mb-6 flex items-baseline justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            {filtered.length === 0 ? (
              "No places found"
            ) : (
              <>
                <span className="font-semibold text-[var(--ink)]">
                  {filtered.length.toLocaleString()}
                </span>{" "}
                {filtered.length === 1 ? "place" : "places"}
                {town && (
                  <>
                    {" "}
                    in <span className="text-[var(--ink)]">{town}</span>
                  </>
                )}
              </>
            )}
          </p>
          {focused && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-sm font-medium text-[var(--ink)] underline-offset-4 hover:underline"
            >
              ← All categories
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] p-12 text-center text-sm text-[var(--muted)]">
            Nothing matches your filters yet. Try a different category, town, or
            search.
          </div>
        ) : focused ? (
          // Focused category → responsive grid
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.slice(0, GRID_LIMIT).map((biz, i) => (
              <VenueCard
                key={biz.id}
                biz={biz}
                index={i}
                selected={selectedId === biz.id}
                onSelect={handleSelect}
              />
            ))}
          </ul>
        ) : (
          // Browse → one horizontal slider per category
          rows.map(({ cat, items }) => (
            <CategoryRow
              key={cat.name}
              cat={cat}
              items={items.slice(0, ROW_LIMIT)}
              total={items.length}
              selectedId={selectedId}
              onSelect={handleSelect}
              onViewAll={() => setFilter(cat.name)}
            />
          ))
        )}

        {focused && filtered.length > GRID_LIMIT && (
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            Showing the first {GRID_LIMIT} of {filtered.length.toLocaleString()}{" "}
            — every match is still on the map below.
          </p>
        )}
      </div>

      {/* ---------------- Map (bottom) ---------------- */}
      <section
        ref={mapSectionRef}
        id="map"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 pb-16 pt-12"
      >
        <div className="mb-4 flex items-center gap-2">
          <IconPin className="h-5 w-5 text-rose-500" />
          <h2 className="text-xl font-semibold tracking-tight">
            Explore {filtered.length.toLocaleString()} places on the map
          </h2>
        </div>
        <div className="relative h-[78vh] overflow-hidden rounded-3xl border border-[var(--line)] shadow-[0_22px_50px_-26px_rgba(26,20,20,0.5)]">
          <BusinessMap
            businesses={filtered}
            categories={categories}
            selectedId={selectedId}
            onSelect={handleSelect}
            token={mapboxToken}
          />
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------- Category slider */

function CategoryRow({
  cat,
  items,
  total,
  selectedId,
  onSelect,
  onViewAll,
}: {
  cat: CategoryInfo;
  items: BusinessListing[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onViewAll: () => void;
}) {
  const railRef = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) =>
    railRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <section className="mb-11">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onViewAll}
          className="group flex items-center gap-2.5"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-lg"
            style={{
              background: `linear-gradient(140deg, ${cat.from}, ${cat.to})`,
            }}
            aria-hidden
          >
            {cat.icon}
          </span>
          <h2 className="text-lg font-semibold tracking-tight group-hover:underline">
            {cat.name}
          </h2>
          <span className="text-sm text-[var(--muted)]">{total}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            <IconChevron className="h-4 w-4 rotate-90" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            <IconChevron className="h-4 w-4 -rotate-90" />
          </button>
        </div>
      </div>

      <ul
        ref={railRef}
        className="mkt-rail -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-1"
      >
        {items.map((biz, i) => (
          <VenueCard
            key={biz.id}
            biz={biz}
            index={i}
            selected={selectedId === biz.id}
            onSelect={onSelect}
            className="w-[262px] shrink-0 snap-start"
          />
        ))}
        {total > items.length && (
          <li className="flex w-[140px] shrink-0 snap-start items-center justify-center">
            <button
              type="button"
              onClick={onViewAll}
              className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--ink)]/30"
            >
              View all {total}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ Card */

function VenueCard({
  biz,
  index,
  selected,
  onSelect,
  className = "",
}: {
  biz: BusinessListing;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const meta = categoryMeta(biz.category);
  return (
    <li
      className={`mkt-card ${className}`}
      style={{ animationDelay: `${Math.min(index, 14) * 30}ms` }}
    >
      <button
        type="button"
        onClick={() => onSelect(biz.id)}
        className={`mkt-card-inner group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left ${
          selected
            ? "border-[var(--ink)] ring-2 ring-[var(--ink)]"
            : "border-[var(--line)]"
        }`}
      >
        {/* Cover */}
        <div
          className="mkt-cover flex aspect-[16/10] items-center justify-center"
          style={{
            background: `linear-gradient(140deg, ${meta.from}, ${meta.to})`,
          }}
        >
          <span className="mkt-cover-icon relative z-10 text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
            {meta.icon}
          </span>
          <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-[var(--ink)] backdrop-blur">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {biz.category}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="line-clamp-1 font-semibold tracking-tight text-[var(--ink)]">
            {biz.name}
          </h3>
          <p className="line-clamp-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
            <IconPin className="h-3.5 w-3.5 shrink-0" />
            {biz.address ?? biz.city ?? "Malta"}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 text-[12px]">
            {biz.openingHours && (
              <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                <IconClock className="h-3.5 w-3.5" />
                <span className="line-clamp-1 max-w-[9rem]">
                  {biz.openingHours}
                </span>
              </span>
            )}
            {biz.phone && (
              <a
                href={`tel:${biz.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 font-medium text-[var(--ink)] hover:bg-[var(--paper)]"
              >
                <IconPhone className="h-3 w-3" /> Call
              </a>
            )}
            {biz.website && (
              <a
                href={biz.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 font-medium text-[var(--ink)] hover:bg-[var(--paper)]"
              >
                <IconGlobe className="h-3 w-3" /> Visit
              </a>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

/* ----------------------------------------------------------- Search pill */

function Field({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-4 py-2.5 text-[var(--muted)] transition-colors hover:bg-black/[.025]">
      <span className="shrink-0 text-[var(--ink)]">{icon}</span>
      {children}
    </label>
  );
}

function Divider() {
  return (
    <span className="mx-1 hidden h-7 w-px shrink-0 bg-[var(--line)] sm:block" />
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-transparent pr-5 text-[15px] outline-none ${
          value ? "text-[var(--ink)]" : "text-[var(--muted)]"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="text-[var(--ink)]">
            {o}
          </option>
        ))}
      </select>
      <IconChevron className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
    </div>
  );
}

/* ----------------------------------------------------------------- Chips */

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-transparent bg-[var(--ink)] text-white"
          : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/25"
      }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Icons */

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="m20 20-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconPin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
