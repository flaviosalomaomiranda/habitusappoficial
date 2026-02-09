// src/lib/db.ts
import type { User } from "firebase/auth";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";

/**
 * Cria ou garante:
 * - users/{uid}
 * - families/{familyId}
 * - families/{familyId}/members/{uid}
 */
export async function ensureUserAndFamily(user: User) {
  const uid = user.uid;
  const email = user.email ?? null;
  const emailLower = email ? email.trim().toLowerCase() : null;

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

// Se não existe user, cria user + family + member
if (!userSnap.exists()) {
  const familyRef = doc(collection(db, "families")); // id automático
  const familyId = familyRef.id;

  await setDoc(familyRef, {
    ownerUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "userDirectory", uid),
    {
      uid,
      email,
      emailLower,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(doc(db, "families", familyId, "members", uid), {
    role: "owner",
    email,
    canEditChildren: true,
    canEditHabits: true,
    canMarkHabits: true,
    createdAt: serverTimestamp(),
  });

  await setDoc(userRef, {
    uid,
    email,
    familyId,
    favoriteProfessionalIds: [], // ✅ NOVO: favoritos por usuário (não vaza para outros)
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { familyId };
}


  const data = userSnap.data() as any;
  const familyId: string | undefined = data.familyId;

  // Se ja existe e ja tem familyId
  if (familyId) {
    await setDoc(
      doc(db, "families", familyId, "members", uid),
      {
        email,
        role: "owner",
        canEditChildren: true,
        canEditHabits: true,
        canMarkHabits: true,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      userRef,
      {
        email,
        updatedAt: serverTimestamp(),
        // ? NOVO: se nao existir ainda, garante um array
        ...(Array.isArray(data.favoriteProfessionalIds) ? {} : { favoriteProfessionalIds: [] }),
      },
      { merge: true }
    );

    await setDoc(
      doc(db, "userDirectory", uid),
      {
        uid,
        email,
        emailLower,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { familyId };
  }

  // Se existe user mas sem familyId: cria family e vincula
  const familyRef = doc(collection(db, "families"));
  const newFamilyId = familyRef.id;

  await setDoc(familyRef, {
    ownerUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, "families", newFamilyId, "members", uid), {
    role: "owner",
    email,
    canEditChildren: true,
    canEditHabits: true,
    canMarkHabits: true,
    createdAt: serverTimestamp(),
  });

  await setDoc(
  userRef,
  {
    familyId: newFamilyId,
    updatedAt: serverTimestamp(),
    // ✅ NOVO
    favoriteProfessionalIds: [],
  },
  { merge: true }
);

  await setDoc(
    doc(db, "userDirectory", uid),
    {
      uid,
      email,
      emailLower,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );


  return { familyId: newFamilyId };
}

/* ============================================================
   SETTINGS DA FAMÍLIA (cidade, preferências, etc)
   Salva em: families/{familyId}/settings/main
   ============================================================ */

function familySettingsRef(familyId: string) {
  return doc(db, "families", familyId, "settings", "main");
}

/** ✅ EXPORT: escuta settings da família em tempo real */
export function listenFamilySettings(
  familyId: string,
  cb: (data: Record<string, any>) => void
) {
  return onSnapshot(familySettingsRef(familyId), (snap) => {
    cb(snap.exists() ? (snap.data() as any) : {});
  });
}

/** ✅ EXPORT: atualiza (merge) settings da família */
export async function updateFamilySettings(
  familyId: string,
  patch: Record<string, any>
) {
  await setDoc(
    familySettingsRef(familyId),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
// ✅ NOVO: escutar documento do usuário (para favoritos, etc.)
export function listenUserDoc(uid: string, cb: (data: Record<string, any>) => void) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    cb(snap.exists() ? (snap.data() as any) : {});
  });
}

// ✅ NOVO: atualizar (merge) o doc do usuário
export async function updateUserDoc(uid: string, patch: Record<string, any>) {
  await setDoc(
    doc(db, "users", uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

function generateInviteCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function ensureUserDoc(user: User) {
  const uid = user.uid;
  const email = user.email ?? null;
  const emailLower = email ? email.trim().toLowerCase() : null;

  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      email,
      emailLower,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "userDirectory", uid),
    {
      uid,
      email,
      emailLower,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createFamilyInvite(params: {
  familyId: string;
  createdByUid: string;
  role: "responsible" | "caregiver";
  permissions: { canEditHabits: boolean; canMarkHabits: boolean };
  expiresAt?: Date | null;
}) {
  for (let i = 0; i < 5; i += 1) {
    const code = generateInviteCode(8);
    const ref = doc(db, "invites", code);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;

    await setDoc(ref, {
      code,
      familyId: params.familyId,
      role: params.role,
      permissions: params.permissions,
      createdByUid: params.createdByUid,
      createdAt: serverTimestamp(),
      isActive: true,
      ...(params.expiresAt ? { expiresAt: Timestamp.fromDate(params.expiresAt) } : {}),
    });
    return code;
  }
  throw new Error("Nao foi possivel gerar um codigo de convite.");
}

export async function acceptInvite(params: {
  user: User;
  code: string;
  allowReplace: boolean;
}) {
  const { user, code, allowReplace } = params;
  const inviteRef = doc(db, "invites", code);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) {
    throw new Error("Convite invalido ou expirado.");
  }

  const invite = inviteSnap.data() as any;
  if (!invite.isActive) {
    throw new Error("Convite ja utilizado.");
  }
  if (invite.expiresAt?.toMillis && invite.expiresAt.toMillis() < Date.now()) {
    throw new Error("Convite invalido ou expirado.");
  }

  await ensureUserDoc(user);

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const currentFamilyId = (userSnap.data() as any)?.familyId ?? null;

  if (currentFamilyId && currentFamilyId !== invite.familyId && !allowReplace) {
    throw new Error("FAMILY_EXISTS");
  }

  if (currentFamilyId && currentFamilyId !== invite.familyId) {
    await deleteDoc(doc(db, "families", currentFamilyId, "members", user.uid)).catch(() => null);
  }

  const isResponsible = invite.role === "responsible";
  const permissions = invite.permissions || {};

  await setDoc(
    doc(db, "families", invite.familyId, "members", user.uid),
    {
      role: invite.role,
      email: user.email ?? null,
      canEditChildren: isResponsible ? true : false,
      canEditHabits: isResponsible ? true : Boolean(permissions.canEditHabits),
      canMarkHabits: isResponsible ? true : Boolean(permissions.canMarkHabits),
      ...(invite.expiresAt ? { expiresAt: invite.expiresAt } : {}),
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    userRef,
    {
      familyId: invite.familyId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    inviteRef,
    {
      isActive: false,
      usedByUid: user.uid,
      usedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { familyId: invite.familyId };
}


