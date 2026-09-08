import Link from "next/link";
import { cn } from "cn";

export function PebbleLogo({
  href = "/app/dashboard",
  showWordmark = true,
  onClick,
  className,
}: {
  href?: string;
  showWordmark?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn("flex items-center gap-2.5", className)}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground pebble-shadow">
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="4" cy="11" r="1.3" fill="currentColor" />
          <circle cx="8.5" cy="4.5" r="1.8" fill="currentColor" opacity="0.9" />
          <circle cx="12" cy="10" r="1.4" fill="currentColor" opacity="0.8" />
        </svg>
      </span>
      {showWordmark && (
        <span className="font-heading text-[1.05rem] font-semibold tracking-tight">
          Pebble
        </span>
      )}
    </Link>
  );
}