// App.tsx
import React, { useMemo, useState } from "react";

import { useAppContext } from "./context/AppContext";
import { useFeedback } from "./context/FeedbackContext";

import ParentDashboard from "./components/ParentDashboard";
import ManagerDashboard from "./components/ManagerDashboard";
import ProfessionalDashboard from "./components/ProfessionalDashboard";
import { isAdminUser } from "./src/lib/admin";
import { auth } from "./src/lib/firebase";
import TvView from "./components/TvView";
import ChildView from "./components/ChildView";
import PinModal from "./components/PinModal";
import type { Child } from "./types";

type ViewMode = "parent" | "tv" | "child";

const AppContent: React.FC = () => {
  const { settings, setPin, checkPin, isManager, supportNetworkProfessionals } = useAppContext();
  const { showToast } = useFeedback();

  const [viewMode, setViewMode] = useState<ViewMode>("parent");
  const [activeChildForChildMode, setActiveChildForChildMode] = useState<Child | null>(null);
  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState<"login" | "set">("login");

  const activeProfessional = useMemo(() => {
    const email = (auth.currentUser?.email || "").trim().toLowerCase();
    if (!email) return null;
    return (
      supportNetworkProfessionals.find((p) => {
        const profEmail = (p.contacts?.email || "").trim().toLowerCase();
        const isEligibleTier = p.tier === "master" || p.tier === "exclusive" || p.tier === "top" || p.tier === "pro";
        return isEligibleTier && p.isActive !== false && profEmail === email;
      }) || null
    );
  }, [supportNetworkProfessionals]);

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
        <PinModal
          isSettingPin={pinAction === "set"}
          onCorrectPin={handlePinSubmit}
          onClose={() => setPinModalOpen(false)}
        />
      )}

      {renderView()}

    </div>
  );
};

export default function App() {
  return <AppContent />;
}
