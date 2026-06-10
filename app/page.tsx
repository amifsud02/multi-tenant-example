import { tenants, rootDomain } from "@/lib/tenants";

// The root domain landing page. Each tenant is reachable three ways; the links
// below are handy for local testing. The protocol/port are inferred from
// rootDomain (e.g. localhost:3000 -> http, a real domain -> https).
const isLocal = rootDomain.includes("localhost");
const protocol = isLocal ? "http" : "https";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Multi-tenant booking · POC
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Root domain: <code className="font-mono">{rootDomain}</code>. Each
          tenant resolves from a subdomain, a custom domain, or the path
          directly.
        </p>

        <a
          href="/marketplace"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-zinc-50 dark:text-black"
        >
          Browse the business marketplace →
        </a>

        <ul className="mt-8 flex flex-col gap-4">
          {tenants.map((tenant) => {
            const subdomainUrl = `${protocol}://${tenant.id}.${rootDomain}`;
            return (
              <li
                key={tenant.id}
                className="rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: tenant.color }}
                  />
                  <span className="font-medium text-black dark:text-zinc-50">
                    {tenant.name}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-1 text-sm">
                  <a
                    className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                    href={subdomainUrl}
                  >
                    {tenant.id}.{rootDomain} <span className="text-zinc-400">(subdomain)</span>
                  </a>
                  <a
                    className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                    href={`/book-now/${tenant.id}`}
                  >
                    /book-now/{tenant.id} <span className="text-zinc-400">(path)</span>
                  </a>
                  {tenant.customDomains?.map((domain) => (
                    <span key={domain} className="text-zinc-500 dark:text-zinc-500">
                      {domain} <span className="text-zinc-400">(custom domain)</span>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
