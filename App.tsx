// App.tsx
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { useAppContext } from "./context/AppContext";
import { useFeedback } from "./context/FeedbackContext";

import { isAdminUser } from "./src/lib/admin";
import { auth, db } from "./src/lib/firebase";
import { registerPushToken } from "./src/lib/pushNotifications";
import { resolveProfessionalPlanType } from "./utils/professionalPlan";
import type { Child, Professional } from "./types";
import { collection, getDocs, query, where } from "firebase/firestore";

type ViewMode = "parent" | "tv" | "child";

const ParentDashboard = lazy(() => import("./components/ParentDashboard"));
const ManagerDashboard = lazy(() => import("./components/ManagerDashboard"));
const ProfessionalDashboard = lazy(() => import("./components/ProfessionalDashboard"));
const ProfessionalAccessPage = lazy(() => import("./components/ProfessionalAccessPage"));
const TvView = lazy(() => import("./components/TvView"));
const ChildView = lazy(() => import("./components/ChildView"));
const PinModal = lazy(() => import("./components/PinModal"));

const isProfessionalPlanEligible = (professional: Professional) => {
  const plan = resolveProfessionalPlanType(professional);
  return plan === "FREE" || plan === "VIP" || plan === "PRO" || plan === "PREMIUM" || plan === "MASTER";
};

const AppContent: React.FC = () => {
  const { familyId, settings, setPin, checkPin, isManager, supportNetworkProfessionals } = useAppContext();
  const { showToast } = useFeedback();

  const [viewMode, setViewMode] = useState<ViewMode>("parent");
  const [activeChildForChildMode, setActiveChildForChildMode] = useState<Child | null>(null);
  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState<"login" | "set">("login");
  const [remoteMatchedProfessionals, setRemoteMatchedProfessionals] = useState<Professional[]>([]);

  const matchedProfessionals = useMemo<Professional[]>(() => {
    const email = (auth.currentUser?.email || "").trim().toLowerCase();
    if (!email) return [];
    return supportNetworkProfessionals.filter((p) => {
        const profEmailPrimary = String(p.contacts?.email || "").trim().toLowerCase();
        const profEmailLegacy = String((p as any).email || "").trim().toLowerCase();
        const profEmailAlt = String((p as any).professionalEmail || "").trim().toLowerCase();
        const isEligibleTier = isProfessionalPlanEligible(p);
        const emailMatches = profEmailPrimary === email || profEmailLegacy === email || profEmailAlt === email;
        return isEligibleTier && p.isActive !== false && emailMatches;
      });
  }, [supportNetworkProfessionals]);
  const selectedProfessionalIdFromQuery = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("pid") || "").trim();
  }, []);
  const hasProfessionalAmbiguity = matchedProfessionals.length > 1 && !selectedProfessionalIdFromQuery;
  const effectiveMatchedProfessionals = useMemo(() => {
    const byId = new Map<string, Professional>();
    matchedProfessionals.forEach((p) => byId.set(p.id, p));
    remoteMatchedProfessionals.forEach((p) => byId.set(p.id, p));
    return Array.from(byId.values());
  }, [matchedProfessionals, remoteMatchedProfessionals]);
  const hasEffectiveProfessionalAmbiguity =
    effectiveMatchedProfessionals.length > 1 && !selectedProfessionalIdFromQuery;
  const activeProfessional = useMemo(() => {
    if (effectiveMatchedProfessionals.length === 0) return null;
    if (selectedProfessionalIdFromQuery) {
      const selected = effectiveMatchedProfessionals.find((p) => p.id === selectedProfessionalIdFromQuery);
      if (selected) return selected;
    }
    return effectiveMatchedProfessionals[0] || null;
  }, [effectiveMatchedProfessionals, selectedProfessionalIdFromQuery]);
  const isProfessionalRoute =
    typeof window !== "undefined" &&
    window.location.pathname.replace(/\/+$/, "").toLowerCase() === "/professional";

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !familyId) return;
    registerPushToken({ uid, familyId }).catch((err) => {
      console.error("Falha ao registrar push token:", err);
    });
  }, [familyId]);

  useEffect(() => {
    const emailRaw = String(auth.currentUser?.email || "").trim();
    const emailLower = emailRaw.toLowerCase();
    if (!emailRaw) {
      setRemoteMatchedProfessionals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const candidates: Professional[] = [];
        const q1 = query(collection(db, "supportNetwork"), where("contacts.email", "==", emailRaw));
        const q2 = query(collection(db, "supportNetwork"), where("contacts.email", "==", emailLower));
        const q3 = query(collection(db, "supportNetwork"), where("email", "==", emailRaw));
        const q4 = query(collection(db, "supportNetwork"), where("email", "==", emailLower));
        const q5 = query(collection(db, "supportNetwork"), where("professionalEmail", "==", emailRaw));
        const q6 = query(collection(db, "supportNetwork"), where("professionalEmail", "==", emailLower));
        const snaps = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3), getDocs(q4), getDocs(q5), getDocs(q6)]);
        snaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            candidates.push({ ...(d.data() as any), id: d.id } as Professional);
          });
        });
        const eligible = candidates.filter((p) => {
          const isEligibleTier = isProfessionalPlanEligible(p);
          return isEligibleTier && p.isActive !== false;
        });
        const dedup = new Map<string, Professional>();
        eligible.forEach((p) => dedup.set(p.id, p));
        if (!cancelled) setRemoteMatchedProfessionals(Array.from(dedup.values()));
      } catch {
        if (!cancelled) setRemoteMatchedProfessionals([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.currentUser?.email]);

  const handleSwitchToChildMode = (child: Child) => {
    if (!settings.pin) {
      setPinAction("set");
      setPinModalOpen(true);
      setActiveChildForChildMode(child);
      return;
    }
    setActiveChildForChildMode(child);
    setViewMode("child");
  };

  const handleRequestSwitchToParent = () => {
    setPinAction("login");
    setPinModalOpen(true);
  };

  const handlePinSubmit = (pin: string) => {
    if (pinAction === "set") {
      setPin(pin);
      setPinModalOpen(false);
      if (activeChildForChildMode) setViewMode("child");
      return;
    }

    if (checkPin(pin)) {
      setViewMode("parent");
      setActiveChildForChildMode(null);
      setPinModalOpen(false);
    } else {
      showToast({ title: "PIN incorreto", message: "Tente novamente.", tone: "error" });
    }
  };

  const renderView = () => {
    const isAdmin = isAdminUser(auth.currentUser?.email);
    const shouldForceProfessionalSelection =
      Boolean(auth.currentUser) && !isAdmin && !isManager && hasEffectiveProfessionalAmbiguity;
    if (isProfessionalRoute) {
      const requiresSelection = hasEffectiveProfessionalAmbiguity;
      if (activeProfessional && !requiresSelection) {
        return <ProfessionalDashboard professional={activeProfessional} />;
      }
      return (
        <ProfessionalAccessPage
          activeProfessional={activeProfessional}
          isLoggedIn={Boolean(auth.currentUser)}
          currentEmail={auth.currentUser?.email ?? null}
          matchedProfessionals={effectiveMatchedProfessionals}
          requiresSelection={requiresSelection}
          selectionBasePath="/professional"
        />
      );
    }
    if (shouldForceProfessionalSelection) {
      return (
        <ProfessionalAccessPage
          activeProfessional={activeProfessional}
          isLoggedIn={Boolean(auth.currentUser)}
          currentEmail={auth.currentUser?.email ?? null}
          matchedProfessionals={effectiveMatchedProfessionals}
          requiresSelection
          selectionBasePath="/"
        />
      );
    }
    if (viewMode === "parent" && isManager && !isAdmin) {
      return <ManagerDashboard />;
    }
    if (viewMode === "parent" && !isManager && !isAdmin && activeProfessional) {
      return <ProfessionalDashboard professional={activeProfessional} />;
    }
    switch (viewMode) {
      case "child":
        return activeChildForChildMode ? (
          <ChildView child={activeChildForChildMode} onSwitchToParent={handleRequestSwitchToParent} />
        ) : (
          <ParentDashboard onEnterTvMode={() => setViewMode("tv")} />
        );

      case "tv":
        return <TvView onExitToParent={() => setViewMode("parent")} />;

      case "parent":
      default:
        return <ParentDashboard onEnterTvMode={() => setViewMode("tv")} />;
    }
  };

  return (
    <div className="min-h-screen font-sans text-gray-800">
      {isPinModalOpen && (
        <Suspense fallback={null}>
          <PinModal
            isSettingPin={pinAction === "set"}
            onCorrectPin={handlePinSubmit}
            onClose={() => setPinModalOpen(false)}
          />
        </Suspense>
      )}

      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando painel...</div>}>
        {renderView()}
      </Suspense>

    </div>
  );
};

export default function App() {
  return <AppContent />;
}
