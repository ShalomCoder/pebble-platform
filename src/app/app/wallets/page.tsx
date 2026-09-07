import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { listWalletsForAccount } from "@/lib/wallets/service";
import { db } from "@/lib/db";
import { clientWallet } from "@/lib/serialize";
import { Card, CardContent } from "@/components/ui/card";
import { CreateWalletDialog } from "@/components/create-wallet-form";
import { WalletCard } from "@/components/wallet-card";
import { PebbleDot } from "@/components/pebble-primitives";

export const metadata = { title: "Wallets" };

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const user = await requireAuth();
  const account = await requireAccountForUser(db, user.id);
  const walletRows = await listWalletsForAccount(db, account.id);
  const wallets = walletRows.map(clientWallet);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative">
          <PebbleDot size={6} className="absolute -top-3 -left-3 bg-pebble-light" />
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Wallets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every wallet has a unique address others can send funds to.
          </p>
        </div>
        <CreateWalletDialog />
      </div>

      {wallets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You have no wallets yet. Create your first wallet to start sending
            and receiving money.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((w, i) => (
            <WalletCard key={w.id} wallet={w} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}