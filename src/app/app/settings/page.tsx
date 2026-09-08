import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getCurrentSessionId } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { listUserSessions } from "@/lib/auth/service";
import { listAccountActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { demoFundingEnabled } from "@/lib/demo";
import { Card, CardContent } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { ProfileNameEditor } from "@/components/profile-name-editor";
import { ChangePassword } from "@/components/change-password";
import { SignOutOtherSessions } from "@/components/sign-out-other-sessions";
import { PebbleArc, PebbleDot } from "@/components/pebble-primitives";
import { formatDate } from "@/components/money";
import {
  summarizeUserAgent,
  formatActivityDate,
  activityLabel,
} from "@/lib/settings-helpers";
import { cn } from "cn";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

const ACTIVITY_SHOWN = 8;

export default async function SettingsPage() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);
  const [sessions, activity] = await Promise.all([
    listUserSessions(user.id),
    listAccountActivity(user.id, ACTIVITY_SHOWN),
  ]);
  const currentSessionId = await getCurrentSessionId();
  const hasOtherSessions = sessions.some((s) => s.id !== currentSessionId);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and security.</p>
      </div>

      <div className="relative overflow-hidden rounded-[1.75rem] bg-pebble-light/60 pebble-inset ring-1 ring-pebble-light">
        <PebbleArc
          size={240}
          strokeWidth={28}
          sweep={120}
          rotation={200}
          className="pointer-events-none absolute -right-12 -top-16 text-primary/[0.07]"
        />
        <PebbleDot size={8} className="pointer-events-none absolute top-10 right-24 bg-pebble/25" />
        <PebbleDot size={5} className="pointer-events-none absolute top-6 right-36 bg-pebble/35" />

        <div className="relative divide-y divide-pebble/10">
          {/* Profile */}
          <section className="p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold tracking-tight">Profile</h2>
              <PebbleDot size={5} className="bg-pebble/40" />
            </div>
            <div className="mt-5 space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-muted-foreground">Full name</p>
                  <ProfileNameEditor initialName={user.fullName} className="mt-1.5" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="mt-1.5 font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-muted-foreground">Member since</p>
                  <p className="mt-1.5 font-medium">{formatDate(user.createdAt)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Security */}
          <section className="p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold tracking-tight">Security</h2>
              <PebbleDot size={5} className="bg-pebble/40" />
            </div>
            <div className="mt-5 space-y-6">
              <ChangePassword />

              <div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Sessions</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {sessions.length === 0
                        ? "No other active sessions."
                        : `${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <SignOutOtherSessions hasOtherSessions={hasOtherSessions} />
                </div>

                {sessions.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {sessions.map((s) => {
                      const { browser, os } = summarizeUserAgent(s.userAgent);
                      const isCurrent = s.id === currentSessionId;
                      return (
                        <li
                          key={s.id}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1",
                            isCurrent
                              ? "bg-card/70 ring-pebble-light/50"
                              : "bg-card/40 ring-foreground/[0.04]",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {os} · {browser}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {isCurrent ? "Active now" : formatActivityDate(s.lastSeenAt)}
                            </p>
                          </div>
                          {isCurrent && (
                            <span className="shrink-0 rounded-full bg-pebble-light px-2 py-0.5 text-[0.68rem] font-semibold text-pebble-dark ring-1 ring-pebble-light/50">
                              Current
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Activity */}
          <section className="p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold tracking-tight">Activity</h2>
              <PebbleDot size={5} className="bg-pebble/40" />
            </div>
            {activity.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">No security activity recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-pebble/10">
                {activity.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="font-medium">{activityLabel(item.action)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatActivityDate(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sign out */}
          <section className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ends this session on this device.
                </p>
              </div>
              <LogoutButton variant="outline" />
            </div>
          </section>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
          <div className="flex items-center gap-2">
            <PebbleDot size={6} />
            <span>
              Account code <span className="font-mono">{account.publicCode}</span>
            </span>
            <span className="text-muted-foreground">· Status {account.status.toLowerCase()}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Demo funding: {demoFundingEnabled() ? "Enabled" : "Disabled"}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
