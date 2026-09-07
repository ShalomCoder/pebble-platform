import { PebbleOrbit } from "@/components/pebble-primitives";

const WALLET_SKELETONS = ["bg-wallet-a/50", "bg-wallet-b/50", "bg-wallet-c/50"] as const;

function Block({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-primary/10 motion-reduce:animate-none ${className ?? ""}`}
      {...props}
    />
  );
}

export default function Loading() {
  return (
    <div className="space-y-8" role="status">
      <span className="sr-only">Loading…</span>
      <div className="pebble-progress" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-7 w-48 rounded-lg" />
          <Block className="h-4 w-64 rounded-md bg-primary/5" />
        </div>
        <div className="flex gap-2">
          <Block className="h-8 w-24" />
          <Block className="h-8 w-28 bg-primary/20" />
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[1.75rem] bg-pebble-light/50 ring-1 ring-pebble-light">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute rounded-full bg-pebble/20 ${
              i === 0 ? "top-6 right-24 size-2.5" : i === 1 ? "top-4 right-36 size-1.5" : "top-10 right-16 size-1"
            }`}
          />
        ))}
        <div className="relative flex flex-col gap-7 p-6 sm:p-9">
          <div className="space-y-3">
            <Block className="h-4 w-32 rounded-md bg-primary/10" />
            <Block className="h-10 w-56 rounded-lg bg-primary/15" />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Block className="h-8 w-40 rounded-full bg-card/70" />
              <Block className="h-8 w-16 rounded-lg bg-primary/5" />
            </div>
            <div className="flex gap-2">
              <Block className="h-8 w-24 bg-primary/15" />
              <Block className="h-8 w-28 bg-primary/20" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <Block className="mb-4 h-5 w-36 rounded-md" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WALLET_SKELETONS.map((tint) => (
            <div key={tint} className={`h-44 rounded-2xl ${tint}`} aria-hidden />
          ))}
        </div>
      </section>

      <section>
        <Block className="mb-4 h-5 w-44 rounded-md" />
        <div className="rounded-2xl bg-card pebble-shadow ring-1 ring-foreground/5">
          <div className="divide-y">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <span
                  aria-hidden
                  className="size-9 shrink-0 animate-pulse rounded-full bg-primary/10 motion-reduce:animate-none"
                />
                <div className="flex-1 space-y-2">
                  <Block className="h-3.5 w-40 rounded-md bg-primary/5" />
                  <Block className="h-3 w-28 rounded-md bg-primary/5" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Block className="h-4 w-20 rounded-md bg-primary/15" />
                  <Block className="h-4 w-16 rounded-full bg-primary/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex justify-center pt-2" aria-hidden>
        <PebbleOrbit size={28} processing />
      </div>
    </div>
  );
}