// context/AppContext.tsx
import React, {
  createContext,
  useContext,
  Dispatch,
  SetStateAction,
  PropsWithChildren,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";

import useLocalStorage from "../hooks/useLocalStorage";
import {
  type Child,
  type Habit,
  RewardType,
  RoutineTemplate,
  ShopReward,
  RedeemedReward,
  AppSettings,
  Professional,
  Recommendation,
  FamilyLocation,
  UserProfile,
  Manager,
  SupportNetworkPricing,
  TagTaxonomy,
  SuggestedTag,
} from "../types";

import {
  getTodayDateString,
  getMondayOfCurrentWeek,
  getFirstDayOfCurrentMonth,
} from "../utils/dateUtils";

import { PRODUCTS_SEED } from "../data/products";

// ✅ Firestore
import {
  collection,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  limit,
  increment,
  writeBatch,
} from "firebase/firestore";

import { db } from "../src/lib/firebase";
import {
  ensureUserAndFamily,
  listenFamilySettings,
  updateFamilySettings,
  updateUserDoc,
} from "../src/lib/db";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { useFeedback } from "./FeedbackContext";
import { bumpTagScores, inferSemanticTags } from "../utils/semanticTags";
import {
  canonicalizeTags,
  DEFAULT_OFFICIAL_TAGS,
  extractFreeTextTags,
  normalizeTag,
  normalizeTags,
} from "../utils/tagTaxonomy";
import { deriveSemanticTagsFromProfile } from "../utils/profileSemantic";

export interface RewardAvailability {
  isAvailable: boolean;
  count: number;
  max: number;
  availableAgainText: string | null;
}

const MAX_CHILD_NAME_LENGTH = 12;

interface AppContextType {
  // ✅ NOVO (para o AuthGate setar)
  familyId: string | null;
  setFamilyId: (id: string | null) => void;

  children: Child[];
  setChildren: Dispatch<SetStateAction<Child[]>>;

  addChild: (name: string, avatar: string, birthDate?: string) => void;
  updateChild: (
    childId: string,
    name: string,
    avatar: string,
    birthDate?: string,
    showAgeInfo?: boolean
  ) => void;
  deleteChild: (childId: string) => void;

  addHabit: (childId: string, habit: Omit<Habit, "id" | "completions">) => void;
  addHabitToMultipleChildren: (
    childIds: string[],
    habitData: Omit<Habit, "id" | "completions">
  ) => string[];

  deleteHabit: (childId: string, habitId: string) => void;
  skipHabitForDate: (childId: string, habitId: string, date: string) => void;
  toggleHabitCompletion: (childId: string, habitId: string, date: string) => void;

  getHabitsForChildOnDate: (childId: string, dateStr: string) => Habit[];

  requestHabitCompletion: (childId: string, habitId: string, date: string) => void;
  rejectHabitCompletion: (childId: string, habitId: string, date: string) => void;

  routineTemplates: RoutineTemplate[];
  addRoutineTemplate: (template: Omit<RoutineTemplate, "id">) => void;
  updateRoutineTemplate: (template: RoutineTemplate) => void;
  deleteRoutineTemplate: (templateId: string) => void;

  shopRewards: ShopReward[];
  addShopReward: (reward: Omit<ShopReward, "id">) => void;
  updateShopReward: (reward: ShopReward) => void;
  deleteShopReward: (rewardId: string) => void;

  redeemedRewards: RedeemedReward[];
  redeemReward: (childId: string, reward: ShopReward) => boolean;
  toggleRewardDelivery: (redeemedRewardId: string) => void;
  resetRedemptionLogs: () => void;
  checkRewardAvailability: (childId: string, reward: ShopReward) => RewardAvailability;

  settings: AppSettings;
  setPin: (pin: string) => void;
  checkPin: (pin: string) => boolean;
  setAdminPin: (pin: string) => void;
  checkAdminPin: (pin: string) => boolean;

  setFamilyLocation: (location: FamilyLocation) => void;
  setDefaultMasterProfessionalId: (professionalId: string | null) => Promise<void>;

  getStarStats: (childId: string) => { today: number; week: number; month: number };

  favoriteProfessionalIds: string[];
  toggleFavoriteProfessional: (professionalId: string) => void;
  trackProfessionalEvent: (
    professionalId: string,
    eventType: "whatsapp_click" | "contact_click" | "location_click" | "favorite_add" | "routine_import",
    metadata?: Record<string, any>
  ) => void;
  trackAdEvent: (
    adId: string,
    eventType: "impression" | "click",
    metadata?: Record<string, any>
  ) => void;

  supportNetworkProfessionals: Professional[];
  activeSupportNetworkProfessionals: Professional[];
  addProfessional: (professional: Omit<Professional, "id">) => void;
  updateProfessional: (professional: Professional) => void;
  deleteProfessional: (professionalId: string) => void;
  setSupportNetworkProfessionals: Dispatch<SetStateAction<Professional[]>>;
  getFavoriteProfessionals: () => Professional[];
  supportNetworkPricing: SupportNetworkPricing;
  updateSupportNetworkPricing: (plans: SupportNetworkPricing["plans"]) => Promise<void>;
  supportNetworkDefaultMasters: {
    globalProfessionalId: string | null;
    byCityId: Record<string, string>;
    byUfLegacy: Record<string, string>;
  };
  updateSupportNetworkDefaultMasters: (payload: {
    globalProfessionalId: string | null;
    byCityId: Record<string, string>;
  }) => Promise<void>;

  isFamilyOwner: boolean;
  canManageMembers: boolean;
  canEditChildren: boolean;
  canEditHabits: boolean;
  canMarkHabits: boolean;

  userProfile: UserProfile | null;
  updateUserProfile: (profile: UserProfile) => Promise<void>;

  productRecommendations: Recommendation[];
  replaceProductRecommendations: (recommendations: Recommendation[]) => Promise<void>;
  addRecommendation: (recommendation: Omit<Recommendation, "id" | "createdAt" | "updatedAt">) => void;
  updateRecommendation: (recommendation: Recommendation) => void;
  deleteRecommendation: (recommendationId: string) => void;
  tagTaxonomy: TagTaxonomy;
  suggestedTagCandidates: SuggestedTag[];
  tagSuggestionThreshold: { minUsers: number; minOccurrences: number; totalUsers: number };
  updateTagTaxonomy: (taxonomy: Partial<TagTaxonomy>) => Promise<void>;

  managerProfile: Manager | null;
  isManager: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/** ✅ remove undefined de objetos/arrays (Firestore NÃO aceita undefined) */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => stripUndefinedDeep(v))
      .filter((v) => v !== undefined) as any;
  }
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

function normalizeSpecialties(value: Professional[] | undefined): Professional[] | undefined {
  if (!value) return value;
  return value.map((prof) => {
    const specialty = (prof as any).specialty;
    const specialties = Array.isArray((prof as any).specialties)
      ? (prof as any).specialties
      : typeof specialty === "string" && specialty.trim()
        ? [specialty.trim()]
        : [];
    return { ...prof, specialties };
  });
}

function isProfessionalActiveNow(prof: Professional, todayStr: string): boolean {
  if (prof.isActive === false) return false;
  const todayStart = new Date(todayStr + "T00:00:00");
  const from = prof.validFrom ? new Date(prof.validFrom + "T00:00:00") : null;
  const to = prof.validTo ? new Date(prof.validTo + "T23:59:59") : null;
  if (from && todayStart < from) return false;
  if (to && todayStart > to) return false;
  if (prof.tier === "master") {
    const day = todayStart.getDate();
    if (day === 15 || day === 31) return false;
    if (day >= 1 && day <= 14) return true;
    if (day >= 16 && day <= 30) return true;
    return false;
  }
  return true;
}

function isTierProLike(tier?: string): boolean {
  return tier === "top" || tier === "pro";
}

function isTierListedLike(tier?: string): boolean {
  return tier === "verified" || tier === "listed";
}

function isFavoritableTier(tier?: string): boolean {
  return isTierProLike(tier) || tier === "exclusive";
}

function readLocalStorageJson<T>(keys: readonly string[]): T | null {
  for (const key of keys) {
    try {
      const item = window.localStorage.getItem(key);
      if (item) return JSON.parse(item) as T;
    } catch {}
  }
  return null;
}

function normalizeChildName(name: string): string {
  return name.trim().slice(0, MAX_CHILD_NAME_LENGTH);
}

function readFirestorePrimitive(value: any): any {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const values = value.arrayValue?.values || [];
    return values.map((item: any) => readFirestorePrimitive(item));
  }
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields || {};
    const out: Record<string, any> = {};
    Object.entries(fields).forEach(([k, v]) => {
      out[k] = readFirestorePrimitive(v);
    });
    return out;
  }
  return undefined;
}

function parseFirestoreDocumentToProfessional(doc: any): Professional | null {
  const fields = doc?.document?.fields;
  if (!fields || typeof fields !== "object") return null;
  const mapped: Record<string, any> = {};
  Object.entries(fields).forEach(([key, value]) => {
    mapped[key] = readFirestorePrimitive(value);
  });
  if (!mapped.id && typeof doc?.document?.name === "string") {
    const parts = doc.document.name.split("/");
    mapped.id = parts[parts.length - 1];
  }
  if (!mapped.id || !mapped.name) return null;
  return mapped as Professional;
}

function parseFirestoreDocumentToRoutineTemplate(doc: any): RoutineTemplate | null {
  const fields = doc?.document?.fields;
  if (!fields || typeof fields !== "object") return null;
  const mapped: Record<string, any> = {};
  Object.entries(fields).forEach(([key, value]) => {
    mapped[key] = readFirestorePrimitive(value);
  });
  if (!mapped.id && typeof doc?.document?.name === "string") {
    const parts = doc.document.name.split("/");
    mapped.id = parts[parts.length - 1];
  }
  if (!mapped.id || !mapped.name) return null;
  return {
    id: mapped.id,
    name: String(mapped.name),
    imageUrl: typeof mapped.imageUrl === "string" ? mapped.imageUrl : undefined,
    isActive: mapped.isActive !== false,
    semanticTags: Array.isArray(mapped.semanticTags) ? mapped.semanticTags : undefined,
    uf: typeof mapped.uf === "string" ? mapped.uf : undefined,
    cityId: typeof mapped.cityId === "string" ? mapped.cityId : undefined,
    cityName: typeof mapped.cityName === "string" ? mapped.cityName : undefined,
    icon: mapped.icon,
    reward: mapped.reward,
    schedule: mapped.schedule,
  } as RoutineTemplate;
}

export const AppProvider = ({ children }: PropsWithChildren) => {
  const { confirm, showToast } = useFeedback();
  // ✅ Agora as crianças vêm do Firestore
  const [childrenData, setChildrenData] = useState<Child[]>([]);

  // ✅ NOVO: vem do AuthGate
  const [familyId, setFamilyId] = useState<string | null>(null);
  const storageScope = familyId ?? "guest";
  const storageKey = (base: string) => `${base}:${storageScope}`;

  // ✅ Templates agora vêm do Firestore (com migração do localStorage)
  const [templatesData, setTemplatesData] = useState<RoutineTemplate[]>([]);

  const [shopRewardsData, setShopRewardsData] = useLocalStorage<ShopReward[]>(
    storageKey("kiddo-routines-shop-rewards"),
    [],
    ["kiddo-routines-shop-rewards"]
  );
  const [redeemedRewardsData, setRedeemedRewardsData] = useLocalStorage<RedeemedReward[]>(
    storageKey("kiddo-routines-redeemed"),
    [],
    ["kiddo-routines-redeemed"]
  );

  // ✅ continua local, MAS familyLocation vai ser controlado pelo Firestore
  const [settings, setSettings] = useLocalStorage<AppSettings>(
    storageKey("kiddo-routines-settings"),
    {
      pin: null,
      adminPin: null,
      defaultMasterProfessionalId: null,
      semanticTagScores: {},
    },
    ["kiddo-routines-settings"]
  );

  const [favoriteProfessionalIds, setFavoriteProfessionalIds] = useState<string[]>([]);
  const [uid, setUid] = useState<string | null>(null);


  const [supportNetworkProfessionals, setSupportNetworkProfessionals] = useLocalStorage<Professional[]>(
    storageKey("support-network-professionals"),
    [],
    ["support-network-professionals"]
  );
  const [supportNetworkPricing, setSupportNetworkPricing] = useState<SupportNetworkPricing>({
    plans: {
      verified: { monthly: 0, annual: 0 },
      top: { monthly: 0, annual: 0 },
      exclusive: { monthly: 0, annual: 0 },
      master: { monthly: 0, annual: 0 },
    },
  });
  const [supportNetworkDefaultMasters, setSupportNetworkDefaultMasters] = useState<{
    globalProfessionalId: string | null;
    byCityId: Record<string, string>;
    byUfLegacy: Record<string, string>;
  }>({
    globalProfessionalId: null,
    byCityId: {},
    byUfLegacy: {},
  });
  const latestSupportNetworkRef = useRef<Professional[]>(supportNetworkProfessionals);

  const [productRecommendations, setProductRecommendations] = useState<Recommendation[]>(PRODUCTS_SEED);
  const [tagTaxonomy, setTagTaxonomy] = useState<TagTaxonomy>({
    officialTags: DEFAULT_OFFICIAL_TAGS,
    synonyms: {},
  });
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [distinctUsersByTag, setDistinctUsersByTag] = useState<Record<string, number>>({});

  const [isFamilyOwner, setIsFamilyOwner] = useState(false);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [canEditChildren, setCanEditChildren] = useState(false);
  const [canEditHabits, setCanEditHabits] = useState(false);
  const [canMarkHabits, setCanMarkHabits] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [managerProfile, setManagerProfile] = useState<Manager | null>(null);
  const [isManager, setIsManager] = useState(false);

  const fetchSupportNetworkViaRest = async () => {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
    if (!projectId || !apiKey) return [] as Professional[];

    const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: "supportNetwork" }],
        limit: 250,
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`REST supportNetwork status ${response.status}`);
    }
    const raw = await response.json();
    if (!Array.isArray(raw)) return [] as Professional[];
    return raw
      .map(parseFirestoreDocumentToProfessional)
      .filter((item): item is Professional => Boolean(item));
  };

  const fetchSupportNetworkPricingViaRest = async (): Promise<SupportNetworkPricing | null> => {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
    if (!projectId || !apiKey) return null;
    const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/supportNetworkSettings/pricing?key=${apiKey}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) return null;
    const raw = await response.json();
    const fields = raw?.fields;
    if (!fields || typeof fields !== "object") return null;
    const plans = readFirestorePrimitive(fields.plans) || {};
    return {
      plans: {
        verified: { monthly: Number(plans?.verified?.monthly ?? 0), annual: Number(plans?.verified?.annual ?? 0) },
        top: { monthly: Number(plans?.top?.monthly ?? 0), annual: Number(plans?.top?.annual ?? 0) },
        exclusive: { monthly: Number(plans?.exclusive?.monthly ?? 0), annual: Number(plans?.exclusive?.annual ?? 0) },
        master: { monthly: Number(plans?.master?.monthly ?? 0), annual: Number(plans?.master?.annual ?? 0) },
      },
      updatedAt: readFirestorePrimitive(fields.updatedAt),
      updatedByEmail: readFirestorePrimitive(fields.updatedByEmail) ?? null,
    };
  };

  const fetchRoutineTemplatesViaRest = async () => {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
    if (!projectId || !apiKey) return [] as RoutineTemplate[];

    const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: "routineTemplatesGlobal" }],
        limit: 250,
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`REST routineTemplatesGlobal status ${response.status}`);
    }
    const raw = await response.json();
    if (!Array.isArray(raw)) return [] as RoutineTemplate[];
    return raw
      .map(parseFirestoreDocumentToRoutineTemplate)
      .filter((item): item is RoutineTemplate => Boolean(item));
  };

  // ? NOVO: pega uid do usuario logado
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUid(null);
        setFamilyId(null);
        setFavoriteProfessionalIds([]); // evita vazar entre logins
        setUserProfile(null);
        setManagerProfile(null);
        setIsManager(false);
        return;
      }

      setUid(u.uid);
      void ensureUserAndFamily(u)
        .then((res) => {
          if (res?.familyId) setFamilyId(res.familyId);
        })
        .catch((err) => console.error("Falha ao garantir user/family:", err));
    });
    return () => unsub();
  }, [setFamilyId]);

  // ? NOVO: escuta favoritos do usuario no Firestore
  useEffect(() => {
    if (!uid) return;

    const userRef = doc(db, "users", uid);
    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() as any;
      const favs = Array.isArray(data?.favoriteProfessionalIds)
        ? (data.favoriteProfessionalIds as string[])
        : [];
      setFavoriteProfessionalIds(favs);
      setUserProfile((data?.profile as UserProfile | undefined) ?? null);
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const userRef = doc(db, "users", uid);
    let unsubManager: (() => void) | null = null;

    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() as any;
      const emailLower = (data?.email ?? "").toString().trim().toLowerCase();
      if (!emailLower) {
        setManagerProfile(null);
        setIsManager(false);
        if (unsubManager) {
          unsubManager();
          unsubManager = null;
        }
        return;
      }

      if (unsubManager) {
        unsubManager();
        unsubManager = null;
      }

      const managersRef = collection(db, "managers");
      const q = query(managersRef, where("emailLower", "==", emailLower), limit(1));
      unsubManager = onSnapshot(q, (mSnap) => {
        if (mSnap.empty) {
          setManagerProfile(null);
          setIsManager(false);
          return;
        }
        const m = mSnap.docs[0].data() as Manager;
        if (m.status === "inactive") {
          setManagerProfile(null);
          setIsManager(false);
          return;
        }
        setManagerProfile({ id: mSnap.docs[0].id, ...m });
        setIsManager(true);
      });
    });

    return () => {
      if (unsubManager) unsubManager();
      unsub();
    };
  }, [uid]);

  useEffect(() => {
    if (!familyId || !uid) {
      setIsFamilyOwner(false);
      setCanManageMembers(false);
      setCanEditChildren(false);
      setCanEditHabits(false);
      setCanMarkHabits(false);
      return;
    }

    const memberRef = doc(db, "families", familyId, "members", uid);
    const unsub = onSnapshot(memberRef, (snap) => {
      const data = snap.data() as any;
      const role = data?.role ?? null;
      const isOwner = role === "owner";
      setIsFamilyOwner(isOwner);
      setCanManageMembers(isOwner || role === "responsible");
      setCanEditChildren(Boolean(data?.canEditChildren));
      setCanEditHabits(Boolean(data?.canEditHabits));
      setCanMarkHabits(Boolean(data?.canMarkHabits));
    });

    return () => unsub();
  }, [familyId, uid]);

  /** ? Listener unico baseado em familyId:
   *  - limpa estado ao trocar de conta
   *  - escuta settings da familia (familyLocation)
   *  - escuta children da familia
   */
  useEffect(() => {
    // limpa imediatamente para nao "vazar"
    setChildrenData([]);
    setSettings((prev) => ({
      ...prev,
      familyLocation: undefined,
      defaultMasterProfessionalId: null,
      semanticTagScores: {},
    }));
    if (!familyId) return;

    const unsubSettings = listenFamilySettings(familyId, (data) => {
      setSettings((prev) => ({
        ...prev,
        familyLocation: data?.familyLocation ?? undefined,
        defaultMasterProfessionalId: data?.defaultMasterProfessionalId ?? null,
        semanticTagScores:
          (data?.semanticTagScores && typeof data.semanticTagScores === "object")
            ? data.semanticTagScores
            : (prev.semanticTagScores || {}),
      }));
    });

    const colRef = collection(db, "families", familyId, "children");
    const unsubKids = onSnapshot(colRef, (snap) => {
      const kids = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name,
          avatar: data.avatar,
          stars: data.stars ?? 0,
          habits: data.habits ?? [],
          starHistory: data.starHistory ?? {},
          birthDate: data.birthDate,
          showAgeInfo: data.showAgeInfo ?? true,
        } as Child;
      });
      setChildrenData(kids);
    });

    return () => {
      unsubSettings();
      unsubKids();
    };
  }, [familyId, setSettings]);

  useEffect(() => {
    const templatesRef = collection(db, "routineTemplatesGlobal");
    let cancelled = false;

    const applyRestFallback = async () => {
      try {
        const docs = await fetchRoutineTemplatesViaRest();
        if (cancelled || docs.length === 0) return;
        setTemplatesData(docs);
      } catch (err) {
        console.error("Falha no fallback REST routineTemplatesGlobal:", err);
      }
    };

    const unsubTemplates = onSnapshot(
      templatesRef,
      (snap) => {
        const templates = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name,
            imageUrl: data.imageUrl,
            isActive: data.isActive ?? true,
            semanticTags: Array.isArray(data.semanticTags) ? data.semanticTags : undefined,
            uf: data.uf,
            cityId: data.cityId,
            cityName: data.cityName,
            icon: data.icon,
            reward: data.reward,
            schedule: data.schedule,
          } as RoutineTemplate;
        });
        if (templates.length === 0) {
          applyRestFallback().catch(() => null);
        }
        setTemplatesData(templates);
      },
      (err) => {
        console.error("Falha ao carregar modelos globais:", err);
        applyRestFallback().catch(() => null);
      }
    );

    return () => {
      cancelled = true;
      unsubTemplates();
    };
  }, []);

  useEffect(() => {
    const recRef = collection(db, "productRecommendations");
    const unsub = onSnapshot(
      recRef,
      (snap) => {
        if (snap.empty) {
          setProductRecommendations(PRODUCTS_SEED);
          return;
        }
        const docs = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const normalizedTags = canonicalizeTags(
              normalizeTags([
                ...(Array.isArray(data.tags) ? data.tags : []),
                ...inferSemanticTags(data.title, data.description, data.category),
                ...extractFreeTextTags(data.title),
                ...extractFreeTextTags(data.description),
              ]),
              tagTaxonomy.synonyms
            );
            return {
              id: d.id,
              title: data.title || "",
              category: data.category || "",
              description: data.description || "",
              imageUrl: data.imageUrl || "",
              ctaLabel: data.ctaLabel || "Ver oferta",
              linkUrl: data.linkUrl || "",
              isAffiliate: data.isAffiliate ?? true,
              isActive: data.isActive ?? true,
              tags: normalizedTags,
              ageMin: data.ageMin ?? null,
              ageMax: data.ageMax ?? null,
              priority: Number(data.priority ?? 0),
              placement: data.placement,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || new Date().toISOString()),
            } as Recommendation;
          })
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.title.localeCompare(b.title));
        setProductRecommendations(docs);
      },
      (err) => {
        console.error("Falha ao ler productRecommendations:", err);
      }
    );
    return () => unsub();
  }, [tagTaxonomy.synonyms]);

  useEffect(() => {
    const defaultsRef = doc(db, "supportNetworkSettings", "defaultMasters");
    const unsub = onSnapshot(defaultsRef, (snap) => {
      if (!snap.exists()) {
        setSupportNetworkDefaultMasters({
          globalProfessionalId: null,
          byCityId: {},
          byUfLegacy: {},
        });
        return;
      }
      const data = snap.data() as any;
      setSupportNetworkDefaultMasters({
        globalProfessionalId: data?.globalProfessionalId ?? null,
        byCityId: (data?.byCityId && typeof data.byCityId === "object") ? data.byCityId : {},
        byUfLegacy: (data?.byUf && typeof data.byUf === "object") ? data.byUf : {},
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const taxonomyRef = doc(db, "supportNetworkSettings", "tagTaxonomy");
    const unsub = onSnapshot(taxonomyRef, (snap) => {
      if (!snap.exists()) {
        setTagTaxonomy({ officialTags: DEFAULT_OFFICIAL_TAGS, synonyms: {} });
        return;
      }
      const data = snap.data() as any;
      setTagTaxonomy({
        officialTags: normalizeTags(Array.isArray(data?.officialTags) ? data.officialTags : DEFAULT_OFFICIAL_TAGS),
        synonyms: (data?.synonyms && typeof data.synonyms === "object") ? data.synonyms : {},
        updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data?.updatedAt,
        updatedByEmail: data?.updatedByEmail ?? null,
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsub = onSnapshot(
      usersRef,
      (snap) => {
        setTotalUsersCount(snap.size);
        const counters = new Map<string, number>();
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const profileTags = normalizeTags(data?.profile?.semanticTags || []);
          const unique = new Set(profileTags);
          unique.forEach((tag) => {
            counters.set(tag, (counters.get(tag) || 0) + 1);
          });
        });
        const map: Record<string, number> = {};
        counters.forEach((count, tag) => {
          map[tag] = count;
        });
        setDistinctUsersByTag(map);
      },
      (err) => console.error("Falha ao ler usuários para métricas de tags:", err)
    );
    return () => unsub();
  }, []);

  /** ? Helper pra salvar child (merge) */
  const saveChild = (child: Child) => {
    if (!familyId) return;
    const payload = stripUndefinedDeep({
      ...child,
      updatedAt: serverTimestamp(),
    });

    void setDoc(doc(db, "families", familyId, "children", child.id), payload, { merge: true }).catch(
      (err) => console.error("Falha ao salvar child:", err)
    );
  };

  /** ? Salva familyLocation no Firestore */
  const setFamilyLocation = (location: FamilyLocation) => {
    setSettings((prev) => ({ ...prev, familyLocation: location }));

    if (!familyId) return;

    updateFamilySettings(familyId, { familyLocation: location }).catch((err) =>
      console.error("Falha ao salvar familyLocation:", err)
    );
  };

  // ============================================================
  // PROFISSIONAIS / RECOMENDACOES (mantidos como estavam)
  // ============================================================

  useEffect(() => {
    const versionKey = "support-network-professionals-version";
    const targetVersion = "2";
    const current = localStorage.getItem(versionKey);
    if (current !== targetVersion) {
      localStorage.setItem(versionKey, targetVersion);
    }

    const professionals = supportNetworkProfessionals as any[];
    const needsMigration = professionals.length > 0 && "isTop" in professionals[0];

    if (needsMigration) {
      const migrated = professionals.map((prof: any) => {
        const newProf = { ...prof };
        if (!newProf.tier) {
          if (newProf.isTop) newProf.tier = "top";
          else newProf.tier = "verified";
          newProf.tierJoinedAt = newProf.topJoinedAt || new Date().toISOString();
        }
        delete newProf.isTop;
        delete newProf.topJoinedAt;
        if (newProf.isActive === undefined) newProf.isActive = true;
        if (!Array.isArray(newProf.specialties)) {
          const legacy = typeof newProf.specialty === "string" ? newProf.specialty.trim() : "";
          newProf.specialties = legacy ? [legacy] : [];
        }
        return newProf as Professional;
      });
      setSupportNetworkProfessionals(migrated);
    }
  }, []);

  useEffect(() => {
    if (supportNetworkProfessionals.length === 0) return;
    const normalized = normalizeSpecialties(supportNetworkProfessionals);
    if (!normalized) return;
    const changed = normalized.some((p, i) => p.specialties !== supportNetworkProfessionals[i]?.specialties);
    if (changed) {
      setSupportNetworkProfessionals(normalized);
    }
    latestSupportNetworkRef.current = supportNetworkProfessionals;
  }, [supportNetworkProfessionals]);

  useEffect(() => {
    const pricingRef = doc(db, "supportNetworkSettings", "pricing");
    let cancelled = false;

    const applyPricing = (data: any) => {
      setSupportNetworkPricing({
        plans: {
          verified: { monthly: Number(data.plans?.verified?.monthly ?? 0), annual: Number(data.plans?.verified?.annual ?? 0) },
          top: { monthly: Number(data.plans?.top?.monthly ?? 0), annual: Number(data.plans?.top?.annual ?? 0) },
          exclusive: { monthly: Number(data.plans?.exclusive?.monthly ?? 0), annual: Number(data.plans?.exclusive?.annual ?? 0) },
          master: { monthly: Number(data.plans?.master?.monthly ?? 0), annual: Number(data.plans?.master?.annual ?? 0) },
        },
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        updatedByEmail: data.updatedByEmail ?? null,
      });
    };

    const applyRestFallback = async () => {
      try {
        const pricing = await fetchSupportNetworkPricingViaRest();
        if (cancelled || !pricing) return;
        setSupportNetworkPricing(pricing);
      } catch (err) {
        console.error("Falha no fallback REST supportNetworkPricing:", err);
      }
    };

    applyRestFallback().catch(() => null);

    const unsub = onSnapshot(pricingRef, (snap) => {
      if (!snap.exists()) {
        setSupportNetworkPricing((prev) => ({
          ...prev,
          plans: {
            verified: { monthly: 0, annual: 0 },
            top: { monthly: 0, annual: 0 },
            exclusive: { monthly: 0, annual: 0 },
            master: { monthly: 0, annual: 0 },
          },
        }));
        return;
      }
      const data = snap.data() as any;
      if (data?.plans) {
        applyPricing(data);
      }
    }, (err) => {
      console.error("Falha ao ler supportNetworkPricing:", err);
      applyRestFallback().catch(() => null);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyRestFallback = async () => {
      try {
        const docs = await fetchSupportNetworkViaRest();
        if (cancelled) return;
        setSupportNetworkProfessionals(docs);
      } catch (err) {
        console.error("Falha no fallback REST supportNetwork:", err);
      }
    };

    // Força reconciliação com a nuvem ao iniciar (evita "fantasma" de cache local).
    applyRestFallback().catch(() => null);

    const unsub = onSnapshot(
      collection(db, "supportNetwork"),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Professional[];
        // Reflete exatamente o estado da coleção na nuvem (inclusive quando vazia)
        setSupportNetworkProfessionals(docs);
      },
      (err) => {
        console.error("Falha ao ler supportNetwork:", err);
        applyRestFallback().catch(() => null);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  const updateSupportNetworkPricing = async (plans: SupportNetworkPricing["plans"]) => {
    await setDoc(
      doc(db, "supportNetworkSettings", "pricing"),
      {
        plans,
        updatedAt: serverTimestamp(),
        updatedByEmail: auth.currentUser?.email ?? null,
      },
      { merge: true }
    );
  };

  const saveSemanticTagScores = (scores: Record<string, number>) => {
    setSettings((prev) => ({ ...prev, semanticTagScores: scores }));
    if (!familyId) return;
    updateFamilySettings(familyId, { semanticTagScores: scores }).catch((err) =>
      console.error("Falha ao salvar semanticTagScores:", err)
    );
  };

  const updateSupportNetworkDefaultMasters = async (payload: {
    globalProfessionalId: string | null;
    byCityId: Record<string, string>;
  }) => {
    await setDoc(
      doc(db, "supportNetworkSettings", "defaultMasters"),
      {
        globalProfessionalId: payload.globalProfessionalId ?? null,
        byCityId: payload.byCityId || {},
        updatedAt: serverTimestamp(),
        updatedByEmail: auth.currentUser?.email ?? null,
      },
      { merge: true }
    );
  };

  const setDefaultMasterProfessionalId = async (professionalId: string | null) => {
    setSettings((prev) => ({ ...prev, defaultMasterProfessionalId: professionalId ?? null }));
    if (!familyId) return;
    await updateFamilySettings(familyId, { defaultMasterProfessionalId: professionalId ?? null });
  };

  const addRecommendation = (data: Omit<Recommendation, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const canonicalTags = canonicalizeTags(
      normalizeTags([
        ...(data.tags || []),
        ...inferSemanticTags(data.title, data.description, data.category),
        ...extractFreeTextTags(data.title),
        ...extractFreeTextTags(data.description),
      ]),
      tagTaxonomy.synonyms
    );
    const newRec: Recommendation = {
      ...data,
      tags: canonicalTags,
      id: `prod-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    setProductRecommendations((prev) => [...prev, newRec]);
    setDoc(
      doc(db, "productRecommendations", newRec.id),
      {
        ...newRec,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedByEmail: auth.currentUser?.email ?? null,
      },
      { merge: true }
    ).catch((err) => console.error("Falha ao criar recomendação:", err));
  };

  const updateRecommendation = (updatedRec: Recommendation) => {
    const canonicalTags = canonicalizeTags(
      normalizeTags([
        ...(updatedRec.tags || []),
        ...inferSemanticTags(updatedRec.title, updatedRec.description, updatedRec.category),
        ...extractFreeTextTags(updatedRec.title),
        ...extractFreeTextTags(updatedRec.description),
      ]),
      tagTaxonomy.synonyms
    );
    const nextRec = {
      ...updatedRec,
      tags: canonicalTags,
      updatedAt: new Date().toISOString(),
    };
    setProductRecommendations((prev) =>
      prev.map((rec) => (rec.id === nextRec.id ? nextRec : rec))
    );
    setDoc(
      doc(db, "productRecommendations", nextRec.id),
      {
        ...nextRec,
        updatedAt: serverTimestamp(),
        updatedByEmail: auth.currentUser?.email ?? null,
      },
      { merge: true }
    ).catch((err) => console.error("Falha ao atualizar recomendação:", err));
  };

  const deleteRecommendation = (recommendationId: string) => {
    setProductRecommendations((prev) => prev.filter((rec) => rec.id !== recommendationId));
    deleteDoc(doc(db, "productRecommendations", recommendationId)).catch((err) =>
      console.error("Falha ao excluir recomendação:", err)
    );
  };

  const replaceProductRecommendations = async (recommendations: Recommendation[]) => {
    const batch = writeBatch(db);
    const colRef = collection(db, "productRecommendations");
    const existing = await getDocs(colRef);
    existing.docs.forEach((docSnap) => batch.delete(docSnap.ref));

    const now = new Date().toISOString();
    const normalized = recommendations.map((rec) => {
      const id = rec.id || `prod-${crypto.randomUUID()}`;
      const canonicalTags = canonicalizeTags(
        normalizeTags([
          ...(rec.tags || []),
          ...inferSemanticTags(rec.title, rec.description, rec.category),
          ...extractFreeTextTags(rec.title),
          ...extractFreeTextTags(rec.description),
        ]),
        tagTaxonomy.synonyms
      );
      const next: Recommendation = {
        ...rec,
        tags: canonicalTags,
        id,
        createdAt: rec.createdAt || now,
        updatedAt: now,
      };
      batch.set(doc(db, "productRecommendations", id), {
        ...next,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByEmail: auth.currentUser?.email ?? null,
      });
      return next;
    });
    await batch.commit();
    setProductRecommendations(normalized);
  };

  const tagSuggestionThreshold = useMemo(() => {
    const total = Math.max(1, totalUsersCount);
    const minUsers = total < 30 ? 2 : Math.max(3, Math.ceil(total * 0.03));
    const minOccurrences = total < 30 ? 3 : Math.max(4, Math.ceil(total * 0.08));
    return { minUsers, minOccurrences, totalUsers: totalUsersCount };
  }, [totalUsersCount]);

  const suggestedTagCandidates = useMemo<SuggestedTag[]>(() => {
    const official = new Set(tagTaxonomy.officialTags.map(normalizeTag));
    const counters = new Map<string, number>();

    const addTagList = (tags?: string[], weight = 1) => {
      (tags || []).forEach((raw) => {
        const tag = normalizeTag(raw);
        if (!tag) return;
        if (official.has(tag)) return;
        counters.set(tag, (counters.get(tag) || 0) + weight);
      });
    };

    productRecommendations.forEach((rec) => addTagList(rec.tags, 3));
    supportNetworkProfessionals.forEach((prof) => {
      addTagList(prof.semanticTags, 2);
      addTagList(prof.spotlightKeywords, 1);
      addTagList(prof.specialties.map((s) => normalizeTag(s)), 1);
    });
    templatesData.forEach((tpl) => addTagList(tpl.semanticTags && tpl.semanticTags.length > 0 ? tpl.semanticTags : inferSemanticTags(tpl.name), 2));
    shopRewardsData.forEach((reward) => addTagList(reward.semanticTags && reward.semanticTags.length > 0 ? reward.semanticTags : inferSemanticTags(reward.name), 1));

    Object.keys(settings.semanticTagScores || {}).forEach((tag) => {
      addTagList([tag], Math.max(1, Number(settings.semanticTagScores?.[tag] || 0)));
    });

    return Array.from(counters.entries())
      .map(([tag, count]) => ({ tag, count, distinctUsers: Number(distinctUsersByTag[tag] || 0) }))
      .filter((item) => {
        const distinct = item.distinctUsers || 0;
        return item.count >= tagSuggestionThreshold.minOccurrences && distinct >= tagSuggestionThreshold.minUsers;
      })
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 30);
  }, [
    distinctUsersByTag,
    productRecommendations,
    settings.semanticTagScores,
    shopRewardsData,
    supportNetworkProfessionals,
    tagSuggestionThreshold.minOccurrences,
    tagSuggestionThreshold.minUsers,
    tagTaxonomy.officialTags,
    templatesData,
  ]);

  const updateTagTaxonomy = async (taxonomy: Partial<TagTaxonomy>) => {
    const nextOfficial = normalizeTags(taxonomy.officialTags ?? tagTaxonomy.officialTags);
    const nextSynonyms = taxonomy.synonyms ?? tagTaxonomy.synonyms ?? {};
    await setDoc(
      doc(db, "supportNetworkSettings", "tagTaxonomy"),
      {
        officialTags: nextOfficial,
        synonyms: nextSynonyms,
        updatedAt: serverTimestamp(),
        updatedByEmail: auth.currentUser?.email ?? null,
      },
      { merge: true }
    );
  };

  const toggleFavoriteProfessional = (professionalId: string) => {
    if (!uid) return;
    const professional = supportNetworkProfessionals.find((p) => p.id === professionalId);
    if (!professional || !isFavoritableTier(professional.tier)) return;

    const next = favoriteProfessionalIds.includes(professionalId)
      ? favoriteProfessionalIds.filter((id) => id !== professionalId)
      : [...favoriteProfessionalIds, professionalId];

    // ? atualiza UI na hora (otimista)
    setFavoriteProfessionalIds(next);

    // ? salva por usuario no Firestore
    setDoc(
      doc(db, "users", uid),
      { favoriteProfessionalIds: next, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((err) => console.error("Falha ao salvar favoritos:", err));
  };

  const trackProfessionalEvent = (
    professionalId: string,
    eventType: "whatsapp_click" | "contact_click" | "location_click" | "favorite_add" | "routine_import",
    metadata: Record<string, any> = {}
  ) => {
    if (!professionalId) return;
    const fieldMap: Record<string, string> = {
      whatsapp_click: "whatsappClicks",
      contact_click: "contactClicks",
      location_click: "locationClicks",
      favorite_add: "favoriteAdds",
      routine_import: "routineImportClicks",
    };
    const statField = fieldMap[eventType];

    setDoc(
      doc(db, "supportNetworkStats", professionalId),
      {
        professionalId,
        [statField]: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => console.error("Falha ao incrementar métrica profissional:", err));

    const user = auth.currentUser;
    addDoc(collection(db, "supportNetworkEvents"), {
      professionalId,
      eventType,
      userId: user?.uid ?? null,
      userEmail: user?.email ?? null,
      createdAt: serverTimestamp(),
      metadata,
    }).catch((err) => console.error("Falha ao registrar evento profissional:", err));
  };

  const trackAdEvent = (
    adId: string,
    eventType: "impression" | "click",
    metadata: Record<string, any> = {}
  ) => {
    if (!adId) return;
    const statField = eventType === "impression" ? "impressions" : "clicks";
    setDoc(
      doc(db, "supportAdStats", adId),
      {
        adId,
        [statField]: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => console.error("Falha ao incrementar métrica de anúncio:", err));

    const user = auth.currentUser;
    addDoc(collection(db, "supportAdEvents"), {
      adId,
      eventType,
      userId: user?.uid ?? null,
      userEmail: user?.email ?? null,
      createdAt: serverTimestamp(),
      metadata,
    }).catch((err) => console.error("Falha ao registrar evento de anúncio:", err));
  };

  const activeSupportNetworkProfessionals = useMemo(() => {
    const todayStr = getTodayDateString();
    return supportNetworkProfessionals.filter((p) => isProfessionalActiveNow(p, todayStr));
  }, [supportNetworkProfessionals]);

  const updateUserProfile = async (profile: UserProfile) => {
    if (!uid) {
      throw new Error("Usuario nao autenticado.");
    }
    const derived = deriveSemanticTagsFromProfile({
      healthComplaints: profile.healthComplaints,
      neuroConditions: profile.neuroConditions,
      extraTags: profile.semanticTags,
    });
    const enrichedProfile: UserProfile = {
      ...profile,
      semanticTags: derived.semanticTags,
      recommendedProfessionalSpecialties: derived.recommendedProfessionalSpecialties,
    };
    setUserProfile(enrichedProfile);
    await updateUserDoc(uid, { profile: enrichedProfile });
  };
  const addProfessional = (professionalData: Omit<Professional, "id">) => {
    const newProfessional: Professional = { ...professionalData, id: `prof-${crypto.randomUUID()}` };
    setSupportNetworkProfessionals((prev) => [...prev, newProfessional]);
    setDoc(
      doc(db, "supportNetwork", newProfessional.id),
      { ...newProfessional, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((err) => console.error("Falha ao salvar profissional:", err));
  };

  const updateProfessional = (updatedProfessional: Professional) => {
    setSupportNetworkProfessionals((prev) => prev.map((p) => (p.id === updatedProfessional.id ? updatedProfessional : p)));
    setDoc(
      doc(db, "supportNetwork", updatedProfessional.id),
      { ...updatedProfessional, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((err) => console.error("Falha ao atualizar profissional:", err));
  };

  const deleteProfessional = (professionalId: string) => {
    setSupportNetworkProfessionals((prev) => prev.filter((p) => p.id !== professionalId));
    deleteDoc(doc(db, "supportNetwork", professionalId)).catch((err) =>
      console.error("Falha ao excluir profissional:", err)
    );
  };

  // ============================================================
  // CRIANÇAS (Firestore)
  // ============================================================

  const addChild = (name: string, avatar: string, birthDate?: string) => {
    if (!familyId) return;
    const normalizedName = normalizeChildName(name);
    if (!normalizedName) return;

    const id = `child-${crypto.randomUUID()}`;
    const newChild: Child = {
      id,
      name: normalizedName,
      avatar,
      stars: 0,
      habits: [],
      starHistory: {},
      birthDate,
      showAgeInfo: true,
    };

    const payload = stripUndefinedDeep({
      ...newChild,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    void setDoc(doc(db, "families", familyId, "children", id), payload).catch((err) =>
      console.error("Falha ao criar child:", err)
    );
  };

  const updateChild = (
    childId: string,
    name: string,
    avatar: string,
    birthDate?: string,
    showAgeInfo?: boolean
  ) => {
    const current = childrenData.find((c) => c.id === childId);
    if (!current) return;
    const normalizedName = normalizeChildName(name);
    if (!normalizedName) return;

    const updated: Child = { ...current, name: normalizedName, avatar, birthDate, showAgeInfo };
    saveChild(updated);
  };

  const deleteChild = (childId: string) => {
    if (!familyId) return;
    void deleteDoc(doc(db, "families", familyId, "children", childId)).catch((err) =>
      console.error("Falha ao deletar child:", err)
    );
  };

  // ============================================================
  // HÁBITOS (agora também persistem no Firestore via saveChild)
  // ============================================================

  const addHabit = (childId: string, habitData: Omit<Habit, "id" | "completions">) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return;

    const habitExists = child.habits.some(
      (h) => h.name.trim().toLowerCase() === habitData.name.trim().toLowerCase()
    );
    if (habitExists) return;

    const inferredTags = canonicalizeTags(
      normalizeTags(
        habitData.semanticTags && habitData.semanticTags.length > 0
          ? habitData.semanticTags
          : [...inferSemanticTags(habitData.name, habitData.category), ...extractFreeTextTags(habitData.name)]
      ),
      tagTaxonomy.synonyms
    );
    const newHabit: Habit = {
      ...habitData,
      id: `habit-${crypto.randomUUID()}`,
      completions: {},
      semanticTags: inferredTags,
      source: habitData.source || "manual",
    };
    const updatedChild: Child = { ...child, habits: [...child.habits, newHabit] };

    // otimista
    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild);
  };

  const addHabitToMultipleChildren = (
    childIds: string[],
    habitData: Omit<Habit, "id" | "completions">
  ): string[] => {
    const addedToChildIds: string[] = [];

    setChildrenData((prevChildren) => {
      const next = prevChildren.map((child) => {
        if (!childIds.includes(child.id)) return child;

        const exists = child.habits.some(
          (h) => h.name.trim().toLowerCase() === habitData.name.trim().toLowerCase()
        );
        if (exists) return child;

        addedToChildIds.push(child.id);

        const inferredTags = canonicalizeTags(
          normalizeTags(
            habitData.semanticTags && habitData.semanticTags.length > 0
              ? habitData.semanticTags
              : [...inferSemanticTags(habitData.name, habitData.category), ...extractFreeTextTags(habitData.name)]
          ),
          tagTaxonomy.synonyms
        );
        const newHabit: Habit = {
          ...habitData,
          id: `habit-${crypto.randomUUID()}`,
          completions: {},
          semanticTags: inferredTags,
          source: habitData.source || "manual",
        };
        const updatedChild: Child = { ...child, habits: [...child.habits, newHabit] };

        // salva no Firestore
        saveChild(updatedChild);

        return updatedChild;
      });
      return next;
    });

    return addedToChildIds;
  };

  const deleteHabit = (childId: string, habitId: string) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return;

    const updatedChild: Child = { ...child, habits: child.habits.filter((h) => h.id !== habitId) };

    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild);
  };

  const skipHabitForDate = (childId: string, habitId: string, date: string) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return;

    const updatedChild: Child = {
      ...child,
      habits: child.habits.map((h) =>
        h.id === habitId ? { ...h, completions: { ...h.completions, [date]: "SKIPPED" } } : h
      ),
    };

    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild);
  };

  const requestHabitCompletion = (childId: string, habitId: string, date: string) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return;

    const updatedChild: Child = {
      ...child,
      habits: child.habits.map((h) =>
        h.id === habitId && !h.completions[date]
          ? { ...h, completions: { ...h.completions, [date]: "PENDING" } }
          : h
      ),
    };

    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild);
  };

  const rejectHabitCompletion = (childId: string, habitId: string, date: string) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return;

    const updatedChild: Child = {
      ...child,
      habits: child.habits.map((h) => {
        if (h.id === habitId && h.completions[date] === "PENDING") {
          const newCompletions = { ...h.completions };
          delete newCompletions[date];
          return { ...h, completions: newCompletions };
        }
        return h;
      }),
    };

    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild);
  };

  const toggleHabitCompletion = (childId: string, habitId: string, date: string) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return;

    let starChange = 0;
    let isStarReward = false;
    let semanticTagsDelta = 0;
    let semanticTagsForHabit: string[] = [];

    const newHabits = child.habits.map((habit) => {
      if (habit.id !== habitId) return habit;

      const currentStatus = habit.completions[date];
      if (habit.reward.type === RewardType.STARS) isStarReward = true;

      const newCompletions = { ...habit.completions };

      if (currentStatus === "COMPLETED") {
        delete newCompletions[date];
        if (isStarReward) starChange = -habit.reward.value;
        semanticTagsDelta = -1;
      } else {
        newCompletions[date] = "COMPLETED";
        if (isStarReward) starChange = habit.reward.value;
        semanticTagsDelta = 1;
      }
      semanticTagsForHabit = canonicalizeTags(
        normalizeTags(
          habit.semanticTags && habit.semanticTags.length > 0
            ? habit.semanticTags
            : [...inferSemanticTags(habit.name, habit.category), ...extractFreeTextTags(habit.name)]
        ),
        tagTaxonomy.synonyms
      );

      return { ...habit, completions: newCompletions };
    });

    const newStarHistory = { ...(child.starHistory || {}) };
    if (isStarReward && starChange !== 0) {
      newStarHistory[date] = Math.max(0, (newStarHistory[date] || 0) + starChange);
    }

    const updatedChild: Child = {
      ...child,
      habits: newHabits,
      stars: Math.max(0, child.stars + starChange),
      starHistory: newStarHistory,
    };

    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild);
    if (semanticTagsDelta !== 0 && semanticTagsForHabit.length > 0) {
      const nextScores = bumpTagScores(settings.semanticTagScores, semanticTagsForHabit, semanticTagsDelta);
      saveSemanticTagScores(nextScores);
    }
  };

  const getHabitsForChildOnDate = (childId: string, dateStr: string): Habit[] => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return [];

    const targetDate = new Date(dateStr + "T00:00:00");
    const dayOfWeek = targetDate.getDay();
    const dayOfMonth = targetDate.getDate();

    return child.habits.filter((habit) => {
      if (habit.completions[dateStr] === "SKIPPED") return false;

      const scheduleType = habit.schedule.type;

      if (scheduleType === "ONCE") return habit.schedule.date === dateStr;
      if (habit.startDate && habit.startDate > dateStr) return false;

      switch (scheduleType) {
        case "DAILY":
          return true;
        case "WEEKLY":
          return habit.schedule.days?.includes(dayOfWeek) ?? false;
        case "MONTHLY":
          if (habit.schedule.dayOfMonth) return dayOfMonth === habit.schedule.dayOfMonth;
          return true;
        default:
          return !habit.startDate && !scheduleType;
      }
    });
  };

  // ============================================================
  // TEMPLATES / LOJA / RECOMPENSAS (mantidos)
  // ============================================================

  const addRoutineTemplate = (templateData: Omit<RoutineTemplate, "id">) => {
    const id = `template-${crypto.randomUUID()}`;
    const newTemplate: RoutineTemplate = {
      ...templateData,
      id,
      semanticTags: canonicalizeTags(
        normalizeTags(
          templateData.semanticTags && templateData.semanticTags.length > 0
            ? templateData.semanticTags
            : [...inferSemanticTags(templateData.name), ...extractFreeTextTags(templateData.name)]
        ),
        tagTaxonomy.synonyms
      ),
    };

    setTemplatesData((prev) => [...prev, newTemplate]);
    const payload = stripUndefinedDeep({
      ...newTemplate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setDoc(doc(db, "routineTemplatesGlobal", id), payload, { merge: true }).catch(
      (err) => console.error("Falha ao salvar template:", err)
    );
  };
  const updateRoutineTemplate = (template: RoutineTemplate) => {
    const normalizedTemplate: RoutineTemplate = {
      ...template,
      semanticTags: canonicalizeTags(
        normalizeTags(
          template.semanticTags && template.semanticTags.length > 0
            ? template.semanticTags
            : [...inferSemanticTags(template.name), ...extractFreeTextTags(template.name)]
        ),
        tagTaxonomy.synonyms
      ),
    };
    setTemplatesData((prev) => prev.map((t) => (t.id === normalizedTemplate.id ? normalizedTemplate : t)));
    const payload = stripUndefinedDeep({
      ...normalizedTemplate,
      updatedAt: serverTimestamp(),
    });
    setDoc(doc(db, "routineTemplatesGlobal", normalizedTemplate.id), payload, { merge: true }).catch(
      (err) => console.error("Falha ao atualizar template:", err)
    );
  };
  const deleteRoutineTemplate = (templateId: string) => {
    setTemplatesData((prev) => prev.filter((t) => t.id !== templateId));
    deleteDoc(doc(db, "routineTemplatesGlobal", templateId)).catch((err) =>
      console.error("Falha ao excluir template:", err)
    );
  };

  const addShopReward = (rewardData: Omit<ShopReward, "id">) => {
    const withTags: ShopReward = {
      ...rewardData,
      id: `reward-${Date.now()}`,
      semanticTags: canonicalizeTags(
        normalizeTags(
          rewardData.semanticTags && rewardData.semanticTags.length > 0
            ? rewardData.semanticTags
            : [...inferSemanticTags(rewardData.name), ...extractFreeTextTags(rewardData.name)]
        ),
        tagTaxonomy.synonyms
      ),
    };
    setShopRewardsData((prev) => [...prev, withTags]);
  };
  const updateShopReward = (reward: ShopReward) => {
    const withTags: ShopReward = {
      ...reward,
      semanticTags: canonicalizeTags(
        normalizeTags(
          reward.semanticTags && reward.semanticTags.length > 0
            ? reward.semanticTags
            : [...inferSemanticTags(reward.name), ...extractFreeTextTags(reward.name)]
        ),
        tagTaxonomy.synonyms
      ),
    };
    setShopRewardsData((prev) => prev.map((r) => (r.id === withTags.id ? withTags : r)));
  };
  const deleteShopReward = (rewardId: string) => {
    setShopRewardsData((prev) => prev.filter((r) => r.id !== rewardId));
  };

  const checkRewardAvailability = (childId: string, reward: ShopReward): RewardAvailability => {
    if (!reward.limit || reward.limit.period === "NONE") {
      return { isAvailable: true, count: 0, max: 0, availableAgainText: null };
    }
    const { count, period } = reward.limit;
    const today = getTodayDateString();
    const monday = getMondayOfCurrentWeek();
    const firstOfMonth = getFirstDayOfCurrentMonth();
    const relatedRedemptions = redeemedRewardsData.filter((r) => r.childId === childId && r.reward.id === reward.id);

    let currentPeriodCount = 0;
    let nextAvailableText = "";

    if (period === "DAY") {
      currentPeriodCount = relatedRedemptions.filter((r) => r.date === today).length;
      nextAvailableText = "amanhã";
    } else if (period === "WEEK") {
      currentPeriodCount = relatedRedemptions.filter((r) => new Date(r.date + "T00:00:00") >= monday).length;
      nextAvailableText = "próxima segunda";
    } else if (period === "MONTH") {
      currentPeriodCount = relatedRedemptions.filter((r) => new Date(r.date + "T00:00:00") >= firstOfMonth).length;
      nextAvailableText = "próximo mês";
    }

    return {
      isAvailable: currentPeriodCount < count,
      count: currentPeriodCount,
      max: count,
      availableAgainText: currentPeriodCount >= count ? nextAvailableText : null,
    };
  };

  const redeemReward = (childId: string, reward: ShopReward): boolean => {
    const availability = checkRewardAvailability(childId, reward);
    if (!availability.isAvailable) return false;

    const childToUpdate = childrenData.find((c) => c.id === childId);
    if (!childToUpdate || childToUpdate.stars < reward.cost) return false;

    const updatedChild: Child = { ...childToUpdate, stars: childToUpdate.stars - reward.cost };

    setChildrenData((prev) => prev.map((c) => (c.id === childId ? updatedChild : c)));
    saveChild(updatedChild); // ✅ agora também persiste

    const newRedemption: RedeemedReward = {
      id: `redeemed-${crypto.randomUUID()}`,
      childId,
      childName: childToUpdate.name,
      reward,
      date: getTodayDateString(),
      createdAt: Date.now(),
      isDelivered: false,
    };
    setRedeemedRewardsData((prev) => [newRedemption, ...prev]);
    if (reward.semanticTags && reward.semanticTags.length > 0) {
      const nextScores = bumpTagScores(settings.semanticTagScores, reward.semanticTags, 2);
      saveSemanticTagScores(nextScores);
    }

    return true;
  };

  const toggleRewardDelivery = (redeemedRewardId: string) => {
    setRedeemedRewardsData((prev) =>
      prev.map((r) => {
        if (r.id === redeemedRewardId) {
          const nowDelivered = !r.isDelivered;
          return {
            ...r,
            isDelivered: nowDelivered,
            deliveryDate: nowDelivered ? getTodayDateString() : undefined,
          };
        }
        return r;
      })
    );
  };

  const resetRedemptionLogs = () => {
    void confirm({
      title: "Limpar histórico de resgates?",
      message: "Isso apagará todo o histórico de resgates e os limites serão zerados.",
      confirmText: "Limpar histórico",
      cancelText: "Cancelar",
      tone: "danger",
    }).then((accepted) => {
      if (!accepted) return;
      setRedeemedRewardsData([]);
      showToast({ title: "Histórico limpo com sucesso.", tone: "success" });
    });
  };

  // ============================================================
  // PINs / Stats / Favoritos
  // ============================================================

  const setPin = (pin: string) => setSettings((s) => ({ ...s, pin }));
  const checkPin = (pin: string): boolean => settings.pin === pin;

  const setAdminPin = (pin: string) => setSettings((s) => ({ ...s, adminPin: pin }));
  const checkAdminPin = (pin: string): boolean => settings.adminPin === pin;

  const getStarStats = (childId: string) => {
    const child = childrenData.find((c) => c.id === childId);
    if (!child) return { today: 0, week: 0, month: 0 };

    const todayStr = getTodayDateString();
    const firstDayOfWeek = getMondayOfCurrentWeek();
    const firstDayOfMonth = getFirstDayOfCurrentMonth();

    let weekStars = 0;
    let monthStars = 0;

    const starHistory = child.starHistory || {};
    for (const dateStr in starHistory) {
      const starsEarned = starHistory[dateStr];
      const completionDate = new Date(dateStr + "T00:00:00");
      if (completionDate >= firstDayOfWeek) weekStars += starsEarned;
      if (completionDate >= firstDayOfMonth) monthStars += starsEarned;
    }

    return { today: starHistory[todayStr] || 0, week: weekStars, month: monthStars };
  };

  const getFavoriteProfessionals = (): Professional[] => {
    return supportNetworkProfessionals.filter(
      (p) => favoriteProfessionalIds.includes(p.id) && isFavoritableTier(p.tier)
    );
  };

  const value: AppContextType = {
    familyId,
    setFamilyId,

    children: childrenData,
    setChildren: setChildrenData,

    addChild,
    updateChild,
    deleteChild,

    addHabit,
    addHabitToMultipleChildren,
    deleteHabit,
    skipHabitForDate,
    toggleHabitCompletion,
    getHabitsForChildOnDate,
    requestHabitCompletion,
    rejectHabitCompletion,

    routineTemplates: templatesData,
    addRoutineTemplate,
    updateRoutineTemplate,
    deleteRoutineTemplate,

    shopRewards: shopRewardsData,
    addShopReward,
    updateShopReward,
    deleteShopReward,

    redeemedRewards: redeemedRewardsData,
    redeemReward,
    toggleRewardDelivery,
    resetRedemptionLogs,
    checkRewardAvailability,

    settings,
    setPin,
    checkPin,
    setAdminPin,
    checkAdminPin,
    setFamilyLocation,
    setDefaultMasterProfessionalId,

    getStarStats,

    favoriteProfessionalIds,
    toggleFavoriteProfessional,
    trackProfessionalEvent,
    trackAdEvent,

    supportNetworkProfessionals,
    activeSupportNetworkProfessionals,
    addProfessional,
    updateProfessional,
    deleteProfessional,
    setSupportNetworkProfessionals,
    getFavoriteProfessionals,
    supportNetworkPricing,
    updateSupportNetworkPricing,
    supportNetworkDefaultMasters,
    updateSupportNetworkDefaultMasters,

    isFamilyOwner,
    canManageMembers,
    canEditChildren,
    canEditHabits,
    canMarkHabits,

    userProfile,
    updateUserProfile,

    productRecommendations,
    replaceProductRecommendations,
    addRecommendation,
    updateRecommendation,
    deleteRecommendation,
    tagTaxonomy,
    suggestedTagCandidates,
    tagSuggestionThreshold,
    updateTagTaxonomy,

    managerProfile,
    isManager,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext deve ser usado dentro de um AppProvider");
  }
  return context;
};
