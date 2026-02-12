import { FamilyLocation, Professional, Recommendation } from "../types";

const SESSION_KEY = "ad-hero-exclusive";
const TEN_MIN_MS = 10 * 60 * 1000;

const normalizeTag = (value: string) => value.trim().toLowerCase();

const hasTagMatch = (a?: string[], b?: string[]) => {
  if (!a?.length || !b?.length) return false;
  const setA = new Set(a.map(normalizeTag));
  return b.some((tag) => setA.has(normalizeTag(tag)));
};

export const pickRoundRobinExclusive = (
  professionals: Professional[],
  location?: FamilyLocation
): Professional | null => {
  const now = Date.now();
  const cityId = location?.cityId || "global";
  const candidates = professionals.filter((p) => {
    if (p.tier !== "exclusive") return false;
    if (p.isActive === false) return false;
    if (!location?.cityId) return true;
    return p.cityId === location.cityId;
  });
  if (candidates.length === 0) return null;

  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { professionalId: string; expiresAt: number; cityId: string };
      if (parsed.cityId === cityId && parsed.expiresAt > now) {
        const existing = candidates.find((p) => p.id === parsed.professionalId);
        if (existing) return existing;
      }
    }
  } catch {}

  const rrKey = `ad-hero-exclusive-rr:${cityId}`;
  const previous = Number(localStorage.getItem(rrKey) || "0");
  const index = Number.isFinite(previous) ? previous % candidates.length : 0;
  const picked = candidates[index] || candidates[0];
  localStorage.setItem(rrKey, String((index + 1) % candidates.length));
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        professionalId: picked.id,
        cityId,
        expiresAt: now + TEN_MIN_MS,
      })
    );
  } catch {}
  return picked;
};

export const pickContextualFooterAd = (params: {
  recommendations: Recommendation[];
  lastRewardTags?: string[];
  lastTaskTags?: string[];
}): Recommendation | null => {
  const { recommendations, lastRewardTags, lastTaskTags } = params;
  const active = recommendations.filter((r) => r.isActive !== false);
  if (active.length === 0) return null;

  const rewardMatch = active.find((r) => hasTagMatch(lastRewardTags, r.tags));
  if (rewardMatch) return rewardMatch;

  const taskMatch = active.find((r) => hasTagMatch(lastTaskTags, r.tags));
  if (taskMatch) return taskMatch;

  return active[0] || null;
};

export const getAdContent = (params: {
  userTaskTags?: string[];
  userRewardTags?: string[];
  userLocation?: FamilyLocation;
  adProducts: Recommendation[];
  exclusiveProfessionals: Professional[];
  generalAds: Recommendation[];
}): { type: "product" | "exclusive_professional" | "general"; payload: Recommendation | Professional | null } => {
  const { userTaskTags, userRewardTags, userLocation, adProducts, exclusiveProfessionals, generalAds } = params;
  const rewardProduct = adProducts.find((ad) => hasTagMatch(userRewardTags, ad.tags));
  if (rewardProduct) return { type: "product", payload: rewardProduct };

  const taskExclusive = exclusiveProfessionals.find((prof) =>
    hasTagMatch(userTaskTags, prof.semanticTags || prof.spotlightKeywords)
  );
  if (taskExclusive) {
    const rr = pickRoundRobinExclusive(exclusiveProfessionals, userLocation);
    return { type: "exclusive_professional", payload: rr };
  }

  return { type: "general", payload: generalAds[0] || null };
};
