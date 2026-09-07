import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon, WalletCardsIcon, ZapIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { PebbleArc, PebbleBlob, PebbleDot } from "@/components/pebble-primitives";

export const metadata = {
  title: "Digital money for everyday life",
};

function PebbleLogo({ className }: { className?: string }) {
  return (
    <span className={`flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground pebble-shadow ${className ?? ""}`}>
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="11" r="1.3" fill="currentColor" />
        <circle cx="8.5" cy="4.5" r="1.8" fill="currentColor" opacity="0.9" />
        <circle cx="12" cy="10" r="1.4" fill="currentColor" opacity="0.8" />
      </svg>
    </span>
  );
}

export default async function LandingPage() {
  const user = await getCurrentUser();

  const features = [
    {
      icon: ZapIcon,
      title: "Instant transfers",
      copy: "Send money by wallet address. Settles in milliseconds.",
    },
    {
      icon: WalletCardsIcon,
      title: "Virtual cards",
      copy: "Cards for every wallet, with a modern Interface.",
    },
    {
      icon: ShieldCheckIcon,
      title: "Audited by design",
      copy: "Every move is an explicit, idempotent, auditable transaction.",
    },
    {
      icon: ShieldCheckIcon,
      title: "Your money, your control",
      copy: "No hidden balances. What you see is exactly what you have.",
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-heading font-semibold tracking-tight">
            <PebbleLogo />
            Pebble
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/app/dashboard" className={buttonVariants()}>
                Open dashboard <ArrowRightIcon data-icon="inline-end" />
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                  Log in
                </Link>
                <Link href="/register" className={buttonVariants()}>
                  Create account <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-5xl flex-1 px-6">
        <PebbleArc
          size={360}
          strokeWidth={40}
          sweep={120}
          rotation={190}
          className="pointer-events-none absolute -top-6 right-0 text-pebble-light/70 sm:-top-16 sm:-right-16"
        />
        <PebbleBlob size={300} className="pointer-events-none absolute top-40 -left-32 text-pebble/10" />
        <PebbleDot size={12} className="pointer-events-none absolute top-28 left-1/2 bg-pebble-light" />
        <PebbleDot size={6} className="pointer-events-none absolute -top-2 left-[60%] bg-pebble/30" />

        <section className="relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Digital money for{" "}
              <span className="text-pebble-dark">everyday life</span>.
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground">
              Wallets that settle instantly, transfers between friends in
              milliseconds, and virtual cards you can spend with — all from one
              account.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <Link href="/app/dashboard" className={buttonVariants({ size: "lg" })}>
                  Go to your dashboard <ArrowRightIcon data-icon="inline-end" />
                </Link>
              ) : (
                <>
                  <Link href="/register" className={buttonVariants({ size: "lg" })}>
                    Open a free account <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                  <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, copy }, i) => (
              <div
                key={title}
                className="relative overflow-hidden rounded-2xl bg-card p-5 pebble-shadow ring-1 ring-foreground/5"
              >
                <PebbleDot size={5} className={`absolute ${i % 2 === 0 ? "top-4 right-5" : "bottom-4 left-5"} bg-pebble/30`} />
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-heading font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-sm text-muted-foreground">
          Pebble is a prototype build for demonstration and learning. It is not
          a regulated financial institution.
        </div>
      </footer>
    </div>
  );
}