// App.tsx
import React, { useState } from "react";

import AuthGate from "./components/AuthGate";
import { AppProvider, useAppContext } from "./context/AppContext";

import ParentDashboard from "./components/ParentDashboard";
import ManagerDashboard from "./components/ManagerDashboard";
import { isAdminUser } from "./src/lib/admin";
import { auth } from "./src/lib/firebase";
import TvView from "./components/TvView";
import ChildView from "./components/ChildView";
import PinModal from "./components/PinModal";
import { TvIcon, UserIcon } from "./components/icons/MiscIcons";
import type { Child } from "./types";

type ViewMode = "parent" | "tv" | "child";

const AppContent: React.FC = () => {
  const { settings, setPin, checkPin, isManager } = useAppContext();

  const [viewMode, setViewMode] = useState<ViewMode>("parent");
  const [activeChildForChildMode, setActiveChildForChildMode] = useState<Child | null>(null);
  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState<"login" | "set">("login");

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
      alert("PIN incorreto!");
    }
  };

  const toggleTvMode = () => {
    setViewMode((prev) => (prev === "parent" ? "tv" : "parent"));
  };

  const renderView = () => {
    const isAdmin = isAdminUser(auth.currentUser?.email);
    if (viewMode === "parent" && isManager && !isAdmin) {
      return <ManagerDashboard />;
    }
    switch (viewMode) {
      case "child":
        return activeChildForChildMode ? (
          <ChildView child={activeChildForChildMode} onSwitchToParent={handleRequestSwitchToParent} />
        ) : (
          <ParentDashboard onEnterChildMode={handleSwitchToChildMode} />
        );

      case "tv":
        return <TvView />;

      case "parent":
      default:
        return <ParentDashboard onEnterChildMode={handleSwitchToChildMode} />;
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

      {viewMode !== "child" && (
        <button
          onClick={toggleTvMode}
          className="fixed bottom-4 right-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center gap-2 z-50"
          aria-label={viewMode === "parent" ? "Mudar para Modo TV" : "Mudar para Modo dos Pais"}
        >
          {viewMode === "parent" ? <TvIcon /> : <UserIcon />}
          <span className="hidden sm:inline">
            {viewMode === "parent" ? "Modo TV" : "Modo dos Pais"}
          </span>
        </button>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AuthGate>
        <AppContent />
      </AuthGate>
    </AppProvider>
  );
}
