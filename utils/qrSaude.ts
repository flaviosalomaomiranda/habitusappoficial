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

export const createQRSaudeToken = (professionalId: string): string => {
  const payload: QRSaudePayload = {
    professionalId,
    issuedAt: Date.now(),
    nonce: crypto.randomUUID(),
  };
  return toBase64Url(JSON.stringify(payload));
};

export const buildQRSaudeLink = (token: string): string => {
  const origin = window.location.origin;
  return `${origin}/?qrsaude=${encodeURIComponent(token)}`;
};

export const buildQRSaudeImageUrl = (link: string): string => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(link)}`;
};
