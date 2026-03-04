const fnv1a32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const buildProfessionalConnectCode = (professionalId: string) => {
  const clean = String(professionalId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const hashPart = fnv1a32(clean || "0").toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
  const tail = (clean.slice(-2) || "00").toUpperCase();
  return `PRO-${hashPart}${tail}`;
};

export const buildLegacyProfessionalConnectCode = (professionalId: string) => {
  const clean = String(professionalId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const suffix = clean.slice(-6).padStart(6, "0");
  return `PRO-${suffix}`;
};

export const normalizeProfessionalConnectCode = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
