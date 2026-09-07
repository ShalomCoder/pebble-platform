"use client";

import { cn } from "cn";

type PebbleRingProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function PebbleRing({ size = 48, strokeWidth = 2, className }: PebbleRingProps) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={cn("text-primary/30", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={(size - strokeWidth) / 2}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

type PebbleArcProps = {
  size?: number;
  strokeWidth?: number;
  sweep?: number;
  rotation?: number;
  className?: string;
};

export function PebbleArc({
  size = 48,
  strokeWidth = 2,
  sweep = 270,
  rotation = 0,
  className,
}: PebbleArcProps) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const rad = (rotation * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad);
  const y1 = cy + r * Math.sin(rad);
  const endRad = rad + (sweep * Math.PI) / 180;
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const large = sweep > 180 ? 1 : 0;

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={cn("text-primary/20", className)}
    >
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

type PebbleDotProps = {
  size?: number;
  className?: string;
};

export function PebbleDot({ size = 6, className }: PebbleDotProps) {
  return (
    <span
      aria-hidden
      className={cn("inline-block rounded-full bg-primary/20", className)}
      style={{ width: size, height: size }}
    />
  );
}

type PebbleBlobProps = {
  size?: number;
  className?: string;
};

export function PebbleBlob({ size = 120, className }: PebbleBlobProps) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={cn("text-primary/8", className)}
    >
      <path
        d="M60 10C80 10 100 25 105 45C110 65 100 85 80 95C60 105 35 100 20 85C5 70 5 45 20 30C35 15 40 10 60 10Z"
        fill="currentColor"
      />
    </svg>
  );
}

type PebbleOrbitProps = {
  size?: number;
  processing?: boolean;
  done?: boolean;
  className?: string;
};

export function PebbleOrbit({
  size = 96,
  processing = false,
  done = true,
  className,
}: PebbleOrbitProps) {
  const failed = !processing && !done;
  const tone = failed ? "text-rose-400" : "text-pebble-dark";
  return (
    <div
      className={cn("relative", tone, className)}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        className="text-current"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 3) / 2}
          stroke="currentColor"
          strokeWidth={3}
        />
      </svg>
      {processing ? (
        <span className="absolute inset-0 animate-spin [animation-duration:2.5s]" aria-hidden>
          <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
        </span>
      ) : (
        <>
          <span
            aria-hidden
            className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
          />
          <span
            aria-hidden
            className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-current opacity-50"
          />
        </>
      )}
    </div>
  );
}
