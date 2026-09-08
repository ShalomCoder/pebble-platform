/**
 * Small server-side helpers for rendering the Settings page (session/agent
 * summaries and human-friendly relative timestamps). Pure string logic only.
 */

export function summarizeUserAgent(userAgent: string | null | undefined): {
  browser: string;
  os: string;
} {
  const ua = userAgent ?? "";
  let browser = "Browser";
  let os = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Chrome\/([\d.]+)/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/MSIE|Trident/i.test(ua)) browser = "Internet Explorer";

  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  return { browser, os };
}

/** Renders a timestamp as a short relative or absolute label. */
export function formatActivityDate(value: Date): string {
  const now = Date.now();
  const diffMs = now - value.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) {
    return `Today · ${value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffMs < 2 * day) return "Yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;
  return value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Friendly labels for known audit actions; falls back to the raw action. */
export function activityLabel(action: string): string {
  switch (action) {
    case "login_success":
      return "Signed in";
    case "login_failure":
      return "Failed sign-in attempt";
    case "logout":
      return "Signed out";
    case "password_changed":
      return "Password changed";
    case "account_updated":
      return "Profile updated";
    case "registration":
      return "Account created";
    case "session_invalidated":
      return "Sessions signed out";
    default:
      return action.replace(/_/g, " ");
  }
}
