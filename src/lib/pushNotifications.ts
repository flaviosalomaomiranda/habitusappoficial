import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { app, db } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

const hashToken = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export async function registerPushToken(params: { uid: string; familyId: string }) {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (!VAPID_KEY) {
    console.warn("VITE_FIREBASE_VAPID_KEY não configurada; push FCM desativado (não afeta upload de fotos/vídeos).");
    return false;
  }
  const supported = await isSupported().catch(() => false);
  if (!supported) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;

  const tokenId = `${params.uid}__${hashToken(token)}`;
  await setDoc(
    doc(db, "userPushTokens", tokenId),
    {
      id: tokenId,
      uid: params.uid,
      familyId: params.familyId,
      token,
      isActive: true,
      userAgent: navigator.userAgent || null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  onMessage(messaging, (payload) => {
    const title = payload?.notification?.title || "Lembrete";
    const body = payload?.notification?.body || "Você tem uma rotina para concluir.";
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  });

  return true;
}
