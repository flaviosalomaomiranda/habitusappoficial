import { auth } from "./firebase";

export async function createManagerAuthUser(params: {
  email: string;
  fullName?: string;
  managerId?: string;
}) {
  const url = (import.meta.env.VITE_CREATE_MANAGER_URL || "").trim();
  if (!url) {
    throw new Error("CREATE_MANAGER_URL_NOT_CONFIGURED");
  }

  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      email: params.email,
      fullName: params.fullName || "",
      managerId: params.managerId || "",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CREATE_MANAGER_FAILED: ${res.status} ${text}`);
  }

  return res.json().catch(() => ({}));
}
