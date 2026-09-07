import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { db } from "@/lib/db";
import { demoFundingEnabled } from "@/lib/demo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { formatDate } from "@/components/money";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Pebble is a prototype — profile editing is out of scope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Full name</span>
            <span className="font-medium">{user.fullName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium">{formatDate(user.createdAt)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Account code</span>
            <span className="font-mono">{account.publicCode}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{account.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Demo funding</span>
            <span className="font-medium">{demoFundingEnabled() ? "Enabled" : "Disabled"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">Ends this session on this device.</p>
          </div>
          <LogoutButton variant="outline" />
        </CardContent>
      </Card>
    </div>
  );
}