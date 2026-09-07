import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { listWalletsForAccount } from "@/lib/wallets/service";
import { listCardsForAccount } from "@/lib/cards/service";
import { db } from "@/lib/db";
import { Card as UICard, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyToClipboard } from "@/components/copy-button";
import { CreateCardDialog } from "@/components/create-card-dialog";
import { DeactivateCardButton } from "@/components/deactivate-card-button";
import { clientWallet } from "@/lib/serialize";
import { PebbleArc, PebbleDot } from "@/components/pebble-primitives";
import { cn } from "cn";

export const metadata = { title: "Cards" };

export const dynamic = "force-dynamic";

function cardFace(type: string | null): string {
  switch (type) {
    case "MASTERCARD":
      return "bg-card-face-2 text-card-face-2-foreground";
    case "VERVE":
      return "bg-card-face-3 text-card-face-3-foreground";
    case "VISA":
    default:
      return "bg-card-face text-card-face-foreground";
  }
}

export default async function CardsPage() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);
  const [walletRows, rows] = await Promise.all([listWalletsForAccount(db, account.id), listCardsForAccount(account.id)]);
  const wallets = walletRows.map(clientWallet);
  const cards = rows.map((r) => ({
    id: r.card.id,
    walletName: r.wallet.name,
    walletAddress: r.wallet.address,
    walletId: r.wallet.id,
    lastFour: r.card.lastFour,
    cardType: r.card.cardType,
    status: r.card.status as "ACTIVE" | "INACTIVE",
    expiresAt: r.card.expiresAt.toISOString(),
    createdAt: r.card.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Virtual cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cards draw on the wallet they are linked to. Card numbers and CVVs
            are never stored — only the last four digits.
          </p>
        </div>
        <CreateCardDialog wallets={wallets} />
      </div>

      {cards.length === 0 ? (
        <UICard>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You have no cards yet. Create a virtual card linked to one of your
            wallets.
          </CardContent>
        </UICard>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div key={card.id} className="space-y-3">
              <div className={cn("relative aspect-[8/5] w-full overflow-hidden rounded-2xl pebble-shadow", cardFace(card.cardType))}>
                <PebbleArc
                  size={200}
                  strokeWidth={26}
                  sweep={150}
                  rotation={200}
                  className="pointer-events-none absolute -right-10 -bottom-10 text-foreground/10"
                />
                <PebbleDot
                  size={7}
                  className="pointer-events-none absolute top-4 right-6 bg-foreground/25"
                />
                <PebbleDot
                  size={4}
                  className="pointer-events-none absolute top-6 right-14 bg-foreground/25"
                />
                <div className="absolute top-4 left-5 flex items-center gap-1.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-foreground/90 text-[0.6rem] font-bold text-card-face">
                    P
                  </span>
                  <span className="text-sm font-semibold tracking-tight">Pebble</span>
                </div>
                <div className="absolute top-4 right-5 text-sm font-bold tracking-wide opacity-90">
                  {card.cardType}
                </div>
                <div className="absolute top-1/2 right-5 left-5 -translate-y-1/2 font-mono text-xl tracking-[0.18em] sm:text-2xl">
                  •••• •••• •••• {card.lastFour}
                </div>
                <div className="absolute right-4 bottom-4 left-5 flex items-end justify-between text-xs opacity-90">
                  <span>{card.walletName}</span>
                  <span className="font-medium">
                    EXP {new Date(card.expiresAt).toLocaleDateString("en", { month: "2-digit", year: "2-digit" })}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/app/wallets/${card.walletId}`} className="min-w-0">
                  <span className="block truncate font-mono text-xs text-muted-foreground hover:text-foreground">
                    {card.walletAddress}
                  </span>
                </Link>
                <CopyToClipboard value={card.walletAddress} label="Copy" />
              </div>
              <div className="flex items-center gap-2">
                {card.status === "ACTIVE" ? <Badge variant="default">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                {card.status === "ACTIVE" && <DeactivateCardButton card={card} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}