import { PebbleOrbit } from "@/components/pebble-primitives";

export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="status">
      <span className="sr-only">Loading…</span>
      <PebbleOrbit size={56} processing />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}