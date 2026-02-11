import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";

type ToastPayload = {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ConfirmPayload = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
};

type ToastState = ToastPayload & { id: string; tone: ToastTone };

type ConfirmState = {
  options: ConfirmPayload;
  resolve: (value: boolean) => void;
};

type FeedbackContextType = {
  showToast: (payload: ToastPayload | string) => void;
  confirm: (payload: ConfirmPayload) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

const toneClasses: Record<ToastTone, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

export const FeedbackProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const showToast = useCallback((payload: ToastPayload | string) => {
    const normalized: ToastPayload =
      typeof payload === "string" ? { title: payload } : payload;

    const id = crypto.randomUUID();
    const tone = normalized.tone ?? "info";
    const durationMs = normalized.durationMs ?? 2800;

    setToasts((prev) => [...prev, { ...normalized, id, tone }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, durationMs);
  }, []);

  const confirm = useCallback((payload: ConfirmPayload) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options: payload, resolve });
    });
  }, []);

  const handleConfirmClose = useCallback(
    (accepted: boolean) => {
      if (!confirmState) return;
      confirmState.resolve(accepted);
      setConfirmState(null);
    },
    [confirmState]
  );

  const value = useMemo(
    () => ({
      showToast,
      confirm,
    }),
    [showToast, confirm]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="fixed top-4 right-4 z-[200] w-[92vw] max-w-sm space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 shadow-md ${toneClasses[toast.tone]}`}
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.message ? <p className="mt-0.5 text-xs opacity-90">{toast.message}</p> : null}
          </div>
        ))}
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">{confirmState.options.title}</h3>
            <p className="mt-2 text-sm text-gray-600">{confirmState.options.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={() => handleConfirmClose(false)}
              >
                {confirmState.options.cancelText ?? "Cancelar"}
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  confirmState.options.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
                onClick={() => handleConfirmClose(true)}
              >
                {confirmState.options.confirmText ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback deve ser usado dentro de um FeedbackProvider");
  }
  return context;
};
