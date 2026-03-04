export interface QRSaudePayload {
  professionalId: string;
  issuedAt: number;
  nonce: string;
}

const toBase64Url = (value: string) =>
  btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
};

export const createQRSaudeToken = (professionalId: string): string => {
  const payload: QRSaudePayload = {
    professionalId,
    // Payload curto para melhorar leitura do QR em telas
    issuedAt: 0,
    nonce: "",
  };
  return toBase64Url(JSON.stringify(payload));
};

export const buildQRSaudeLink = (token: string): string => {
  const origin = window.location.origin;
  return `${origin}/?qrsaude=${encodeURIComponent(token)}`;
};

export const buildQRSaudeImageUrl = (link: string): string => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(link)}`;
};

export const parseQRSaudeToken = (token: string): QRSaudePayload | null => {
  try {
    const raw = fromBase64Url(String(token || ""));
    const parsed = JSON.parse(raw) as Partial<QRSaudePayload>;
    if (!parsed || typeof parsed.professionalId !== "string" || !parsed.professionalId.trim()) {
      return null;
    }
    return {
      professionalId: parsed.professionalId,
      issuedAt: Number(parsed.issuedAt || 0),
      nonce: String(parsed.nonce || ""),
    };
  } catch {
    return null;
  }
};
