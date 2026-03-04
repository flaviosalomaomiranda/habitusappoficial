import { FamilyLocation, Professional, Recommendation } from "../types";

const FOOTER_SESSION_KEY = "ad-footer-recommendation";
const PREMIUM_ROTATION_MS = 5 * 60 * 1000;
const FOOTER_STICKY_MS = 10 * 60 * 1000;

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
  const ordered = [...candidates].sort((a, b) => {
    const aTime = a.tierJoinedAt ? new Date(a.tierJoinedAt).getTime() : 0;
    const bTime = b.tierJoinedAt ? new Date(b.tierJoinedAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.name.localeCompare(b.name);
  });
  const bucket = Math.floor(now / PREMIUM_ROTATION_MS);
  const cityHash = cityId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const index = (bucket + cityHash) % ordered.length;
  return ordered[index] || ordered[0];
};

export const pickContextualFooterAd = (params: {
  recommendations: Recommendation[];
  lastRewardTags?: string[];
  lastTaskTags?: string[];
}): Recommendation | null => {
  const pickWithRotation = (candidates: Recommendation[], bucket: string): Recommendation | null => {
    if (candidates.length === 0) return null;
    if (typeof window === "undefined") return candidates[0] || null;
    const now = Date.now();
    try {
      const raw = sessionStorage.getItem(FOOTER_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          recommendationId: string;
          expiresAt: number;
          bucket: string;
        };
        if (parsed.bucket === bucket && parsed.expiresAt > now) {
          const found = candidates.find((r) => r.id === parsed.recommendationId);
          if (found) return found;
        }
      }
    } catch {}

    const rrKey = `ad-footer-rr:${bucket}`;
    let index = Number(localStorage.getItem(rrKey));
    if (!Number.isFinite(index) || index < 0) {
      index = Math.floor(Math.random() * candidates.length);
    } else {
      index = index % candidates.length;
    }
    const picked = candidates[index] || candidates[0];
    localStorage.setItem(rrKey, String((index + 1) % candidates.length));
    try {
      sessionStorage.setItem(
        FOOTER_SESSION_KEY,
        JSON.stringify({
          recommendationId: picked.id,
          bucket,
          expiresAt: now + FOOTER_STICKY_MS,
        })
      );
    } catch {}
    return picked;
  };

  const { recommendations, lastRewardTags, lastTaskTags } = params;
  const active = recommendations.filter((r) => r.isActive !== false);
  if (active.length === 0) return null;

  const rewardMatches = active.filter((r) => hasTagMatch(lastRewardTags, r.tags));
  if (rewardMatches.length > 0) return pickWithRotation(rewardMatches, "reward_match");

  const taskMatches = active.filter((r) => hasTagMatch(lastTaskTags, r.tags));
  if (taskMatches.length > 0) return pickWithRotation(taskMatches, "task_match");

  return pickWithRotation(active, "fallback");
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
