import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTenantById } from "@/lib/tenants";

// In Next 16 params is async — it resolves to a Promise.
type Props = { params: Promise<{ "tenant-id": string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { "tenant-id": tenantId } = await params;
  const tenant = getTenantById(tenantId);
  return { title: tenant ? `Book now · ${tenant.name}` : "Book now" };
}

export default async function BookNowPage({ params }: Props) {
  const { "tenant-id": tenantId } = await params;
  const tenant = getTenantById(tenantId);

  // Unknown tenant id -> 404. This covers bad subdomains and bad URLs alike.
  if (!tenant) {
    notFound();
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.145] dark:bg-zinc-950">
        <div
          className="mb-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: tenant.color }}
        >
          {tenant.id}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {tenant.name}
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{tenant.tagline}</p>

        <form className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Your name
            <input
              type="text"
              placeholder="Jane Doe"
              className="rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/[.4] dark:border-white/[.2] dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Preferred date
            <input
              type="date"
              className="rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/[.4] dark:border-white/[.2] dark:text-zinc-50"
            />
          </label>
          <button
            type="button"
            className="mt-2 rounded-full px-5 py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: tenant.color }}
          >
            Book appointment
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Booking for <span className="font-medium">{tenant.id}</span> · POC, no
          data is saved
        </p>
      </div>
    </main>
  );
}
