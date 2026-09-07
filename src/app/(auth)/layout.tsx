import Link from "next/link";
import { PebbleArc, PebbleBlob, PebbleDot } from "@/components/pebble-primitives";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12">
      <PebbleBlob size={360} className="pointer-events-none absolute -top-40 -left-40 text-pebble/10" />
      <PebbleArc
        size={420}
        strokeWidth={48}
        sweep={110}
        rotation={20}
        className="pointer-events-none absolute -right-32 -bottom-40 text-pebble-light/70"
      />
      <PebbleDot size={10} className="pointer-events-none absolute top-16 right-[18%] bg-pebble/30" />
      <PebbleDot size={5} className="pointer-events-none absolute top-24 right-[26%] bg-pebble/40" />

      <Link href="/" className="relative mb-8 flex items-center gap-2.5 font-heading font-semibold tracking-tight">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground pebble-shadow">
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="4" cy="11" r="1.3" fill="currentColor" />
            <circle cx="8.5" cy="4.5" r="1.8" fill="currentColor" opacity="0.9" />
            <circle cx="12" cy="10" r="1.4" fill="currentColor" opacity="0.8" />
          </svg>
        </span>
        Pebble
      </Link>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}