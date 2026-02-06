type SessionLike = {
  access_token: string;
  expires_at?: number | null;
  expires_in?: number | null;
} | null;

export function writeAuthCookie(session: SessionLike) {
  if (typeof document === "undefined") return;

  if (!session?.access_token) {
    document.cookie = "budgetapp-auth=; Path=/; Max-Age=0; SameSite=Lax";
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    session.expires_at ??
    (session.expires_in ? now + session.expires_in : now + 3600);
  const maxAge = Math.max(60, expiresAt - now);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `budgetapp-auth=${session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}
