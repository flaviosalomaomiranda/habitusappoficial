// components/AuthGate.tsx
import React, { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "@/src/lib/firebase";
import Login from "@/components/Login";
import { acceptInvite, ensureUserAndFamily } from "@/src/lib/db";
import { doc, getDoc } from "firebase/firestore";
import { useFeedback } from "@/context/FeedbackContext";

// ✅ pega o setter do contexto (AuthGate precisa estar dentro do <AppProvider>)
import { useAppContext } from "@/context/AppContext";

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ NOVO
  const { setFamilyId } = useAppContext();
  const { confirm, showToast } = useFeedback();

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(true);

      // ? NOVO: se deslogou, zera familyId (evita "vazar" dados entre contas)
      if (!u) {
        setFamilyId(null);
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get("invite");

        if (inviteCode) {
          const userSnap = await getDoc(doc(db, "users", u.uid));
          const currentFamilyId = (userSnap.data() as any)?.familyId ?? null;

          if (currentFamilyId) {
            const confirmReplace = await confirm({
              title: "Trocar de família?",
              message:
                "Você já pertence a outra família. Ao entrar pelo convite, seus dados atuais serão desconectados.",
              confirmText: "Trocar",
              cancelText: "Manter família atual",
              tone: "danger",
            });
            if (!confirmReplace) {
              const { familyId } = await ensureUserAndFamily(u);
              if (!cancelled) setFamilyId(familyId);
              params.delete("invite");
              window.history.replaceState({}, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
              setLoading(false);
              return;
            }
          }

          const { familyId } = await acceptInvite({ user: u, code: inviteCode, allowReplace: true });
          if (!cancelled) setFamilyId(familyId);
          params.delete("invite");
          window.history.replaceState({}, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
          setLoading(false);
          return;
        }

        const { familyId } = await ensureUserAndFamily(u);

        if (!cancelled) {
          setFamilyId(familyId); // ? NOVO: agora o AppContext sabe a familia atual
        }
      } catch (e) {
        console.error("AuthGate falhou:", e);
        showToast({
          title: "Falha ao processar login",
          message: "Tentando recuperar seu acesso automaticamente.",
          tone: "error",
        });

        if (!cancelled) {
          const params = new URLSearchParams(window.location.search);
          if (params.has("invite")) {
            params.delete("invite");
            window.history.replaceState({}, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
          }
          try {
            const { familyId } = await ensureUserAndFamily(u);
            setFamilyId(familyId);
          } catch (err) {
            console.error("Fallback ensureUserAndFamily falhou:", err);
            setFamilyId(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [setFamilyId, confirm, showToast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Carregando...
      </div>
    );
  }

  if (!user) return <Login />;

  return <>{children}</>;
}

