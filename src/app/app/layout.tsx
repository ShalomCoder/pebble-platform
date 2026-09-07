import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { LogoutButton } from "@/components/logout-button";
import { TransactionMonitor } from "@/components/transaction-monitor";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-dvh">
      <TransactionMonitor />
      <div className="grid min-h-dvh lg:grid-cols-[240px_1fr]">
        <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar lg:block">
          <AppSidebar email={user.email} />
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/70 px-4 backdrop-blur-md lg:px-8">
            <div className="flex items-center gap-2">
              <MobileNav email={user.email} />
              <p className="hidden text-sm text-muted-foreground sm:block">
                Signed in as <span className="font-medium text-foreground">{user.fullName}</span>
              </p>
            </div>
            <LogoutButton />
          </header>
          <main className="flex-1 px-4 py-8 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}