"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import {
  LayoutDashboardIcon,
  WalletCardsIcon,
  SendIcon,
  ArrowLeftRightIcon,
  CreditCardIcon,
  SettingsIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PebbleArc, PebbleDot } from "@/components/pebble-primitives";
import { PebbleLogo } from "@/components/pebble-logo";

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/app/wallets", label: "Wallets", icon: WalletCardsIcon },
  { href: "/app/send", label: "Send money", icon: SendIcon },
  { href: "/app/transactions", label: "Transactions", icon: ArrowLeftRightIcon },
  { href: "/app/cards", label: "Cards", icon: CreditCardIcon },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar({
  email,
  onNavigate,
}: {
  email: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="relative flex h-full flex-col overflow-hidden px-3 py-4">
      <PebbleArc
        size={220}
        strokeWidth={28}
        sweep={110}
        rotation={200}
        className="pointer-events-none absolute -right-16 -bottom-16 text-pebble-light"
      />
      <PebbleDot
        size={8}
        className="pointer-events-none absolute top-3 right-4 bg-pebble-light"
      />

      <PebbleLogo onClick={onNavigate} className="relative px-2 py-1.5" />

      <nav className="relative mt-5 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                buttonVariants({ variant: active ? "secondary" : "ghost" }),
                "justify-start gap-2.5 rounded-lg",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("size-4", !active && "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="relative mt-auto px-2 pt-4 text-xs text-muted-foreground">
        <p className="truncate">{email}</p>
      </div>
    </div>
  );
}