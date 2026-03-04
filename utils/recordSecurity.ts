export const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const buildPatientUniqueCode = async (seed: string): Promise<string> => {
  const hash = await sha256Hex(seed);
  return `pac_${hash.slice(0, 32)}`;
};

export const buildRecordSecurityHash = async (params: {
  professionalId: string;
  timestampIso: string;
  recordText: string;
}): Promise<string> => {
  const payload = `${params.professionalId}::${params.timestampIso}::${params.recordText}`;
  return sha256Hex(payload);
};

