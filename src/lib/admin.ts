// src/lib/admin.ts
function normalize(email: string) {
  return email.trim().toLowerCase();
}

const DEFAULT_ADMINS = ["ndsuporte1@gmail.com"].map(normalize);

export function isAdminUser(email: string | null | undefined): boolean {
  const raw = (import.meta.env.VITE_ADMIN_EMAILS || "").trim();

  const list = raw
    ? raw.split(",").map(normalize).filter(Boolean)
    : DEFAULT_ADMINS;

  const e = email ? normalize(email) : "";
  return !!e && list.includes(e);
}
