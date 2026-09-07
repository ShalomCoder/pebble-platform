import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { listWalletsForAccount } from "@/lib/wallets/service";
import { db } from "@/lib/db";
import { SendMoneyForm } from "@/components/send-money-form";
import { clientWallet } from "@/lib/serialize";

export const metadata = { title: "Send money" };

export const dynamic = "force-dynamic";

export default async function SendMoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);
  const walletRows = await listWalletsForAccount(db, account.id);
  const wallets = walletRows.map(clientWallet);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Send money</h1>
        <p className="text-sm text-muted-foreground">
          Transfer by wallet address. Money settles the moment you confirm.
        </p>
      </div>
      <SendMoneyForm wallets={wallets} initialFrom={from} />
    </div>
  );
}