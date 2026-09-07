import { PebbleOrbit } from "@/components/pebble-primitives";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <span className="sr-only">Loading…</span>
      <div className="pebble-progress" />
      <PebbleOrbit size={48} processing />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}