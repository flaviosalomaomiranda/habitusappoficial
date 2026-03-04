
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Manager, Professional, ProfessionalPlanType } from '../types';
import { getStates, getCitiesByState, UF, Municipio } from '../services/ibgeService';
import { SPECIALTIES, SUPPORT_NETWORK_AREAS, SUPPORT_NETWORK_SPECIALTIES_BY_AREA } from '../data/supportNetworkData';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { isAdminUser } from "../src/lib/admin";
import { buildProfessionalConnectCode } from "../utils/professionalCode";
import { PROFESSIONAL_PLAN_CONFIG } from "../utils/professionalPlan";

interface ManageSupportNetworkModalProps {
    onClose: () => void;
    embedded?: boolean;
}

const PROFILE_IMAGE_MAX_BYTES = 1_500_000;
const PROFILE_IMAGE_WIDTH = 600;
const PROFILE_IMAGE_HEIGHT = 600;
const MASTER_VIDEO_MAX_BYTES = 20_000_000;
const MASTER_VIDEO_MAX_SECONDS = 16;
const MASTER_VIDEO_WIDTH = 1920;
const MASTER_VIDEO_HEIGHT = 1080;
const VIDEO_UPLOAD_TIMEOUT_MS = 120_000;

const MAX_SPECIALTIES = 5;
const MAX_OTHER_SPECIALTIES = 3;
const BIO_MAX_CHARS = 180;
const formatBytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)}MB`;
const buildDefaultBookingMessage = (name: string, greeting: "dr" | "dra" | "clinic") => {
    if (greeting === "clinic") {
        return "Oi, pessoal! Estou usando o Habitus App e gostaria de agendar uma consulta.";
    }
    const label = greeting === "dr" ? "Dr." : "Dra.";
    const suffix = name ? ` ${name}` : "";
    return `Olá ${label}${suffix}, estou usando o Habitus App e gostaria de agendar uma consulta.`;
};

const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const { width, height } = img;
            URL.revokeObjectURL(url);
            resolve({ width, height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Falha ao ler imagem.'));
        };
        img.src = url;
    });

const getUploadErrorMessage = (err: unknown, fallback: string) => {
    const message = (err as { message?: string; code?: string } | null)?.message || "";
    const code = (err as { code?: string } | null)?.code || "";
    if (message.includes("Upload demorou demais")) return message;
    if (code.includes("storage/unauthorized")) return "Sem permissão para upload (Storage).";
    if (code.includes("storage/canceled")) return "Upload cancelado.";
    if (code.includes("storage/quota-exceeded")) return "Limite do Storage excedido.";
    if (code.includes("storage/retry-limit-exceeded")) return "Tempo de upload excedido. Tente novamente.";
    if (code.includes("storage/invalid-format")) return "Formato inválido para upload.";
    if (message.trim()) return message;
    return fallback;
};
const getVideoMetadata = (file: File): Promise<{ duration: number; width: number; height: number }> =>
    new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration = video.duration;
            const width = video.videoWidth;
            const height = video.videoHeight;
            URL.revokeObjectURL(url);
            resolve({ duration, width, height });
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Falha ao ler vídeo."));
        };
        video.src = url;
    });

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const formatCpf = (value: string) => {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
const formatCnpj = (value: string) => {
    const digits = onlyDigits(value).slice(0, 14);
    return digits
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};
const formatPhone = (value: string) => {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 10) {
        return digits
            .replace(/(\d{2})(\d)/, "($1) $2")
            .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2");
};
const formatCep = (value: string) => {
    const digits = onlyDigits(value).slice(0, 8);
    return digits.replace(/(\d{5})(\d)/, "$1-$2");
};

const buildMapsLinkFromAddress = (address: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    uf?: string;
}) => {
    const parts = [address.street, address.number, address.neighborhood, address.city, address.uf]
        .map((item) => (item || "").trim())
        .filter(Boolean);
    if (parts.length === 0) return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
};

const addMonthsToIsoDate = (dateStr: string, months: number) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const base = new Date(y, (m || 1) - 1, d || 1);
    base.setMonth(base.getMonth() + months);
    const yy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
};

const formatDateIso = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const escapeCsvValue = (value: string | number) => {
    const raw = String(value ?? "");
    if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
};

const getTierLabel = (tier?: string) => {
    if (tier === "free") return "FREE";
    if (tier === "master") return "MASTER";
    if (tier === "exclusive") return "PREMIUM";
    if (tier === "top") return "PRO";
    return "LISTA VIP";
};

const isProfessionalPanelTier = (tier?: string) => tier === "top" || tier === "exclusive" || tier === "master";

const mapTierToPlanType = (tier?: string): ProfessionalPlanType => {
    const normalized = String(tier || "").trim().toLowerCase();
    if (normalized === "master") return "MASTER";
    if (normalized === "exclusive" || normalized === "premium") return "PREMIUM";
    if (normalized === "top" || normalized === "pro") return "PRO";
    if (normalized === "verified" || normalized === "vip") return "VIP";
    return "FREE";
};

const readFirestorePrimitive = (value: any): any => {
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
};

const parseFirestoreDocToProfessional = (doc: any): Professional | null => {
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
};

const ManageSupportNetworkModal: React.FC<ManageSupportNetworkModalProps> = ({ onClose, embedded = false }) => {
    const { 
        supportNetworkProfessionals, 
        setSupportNetworkProfessionals,
        settings, 
        setAdminPin,
        checkAdminPin,
        deleteProfessional,
        managerProfile,
        isManager
    } = useAppContext();
    
    const [isAuthenticated, setIsAuthenticated] = useState(!settings.adminPin || isManager);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const isAdminEmail = isAdminUser(currentUserEmail);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const todayStr = new Date().toISOString().slice(0, 10);
    const [restProfessionals, setRestProfessionals] = useState<Professional[]>([]);
    const [filterUf, setFilterUf] = useState("");
    const [filterTier, setFilterTier] = useState<"" | "free" | "master" | "top" | "exclusive" | "verified">("");
    const [reportProfessional, setReportProfessional] = useState<Professional | null>(null);
    const [quotaSettings, setQuotaSettings] = useState<{
        defaults: { premiumHeroTarget: number; proCarouselTarget: number };
        byCityId: Record<string, { premiumHeroTarget?: number; proCarouselTarget?: number; cityName?: string; uf?: string }>;
    }>({
        defaults: { premiumHeroTarget: 400, proCarouselTarget: 250 },
        byCityId: {},
    });
    const [selectedQuotaCityId, setSelectedQuotaCityId] = useState("");
    const [quotaPremiumValue, setQuotaPremiumValue] = useState("400");
    const [quotaProValue, setQuotaProValue] = useState("250");
    const [quotaDefaultPremiumValue, setQuotaDefaultPremiumValue] = useState("400");
    const [quotaDefaultProValue, setQuotaDefaultProValue] = useState("250");
    const [isSavingQuota, setIsSavingQuota] = useState(false);
    const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
    const [performanceDate, setPerformanceDate] = useState(todayStr);
    const [performanceCityId, setPerformanceCityId] = useState("");
    const [performanceWindowDays, setPerformanceWindowDays] = useState<7 | 30>(7);
    const [isLoadingPerformance, setIsLoadingPerformance] = useState(false);
    const [performanceRows, setPerformanceRows] = useState<Array<{
        professionalId: string;
        professionalName: string;
        cityId: string;
        cityLabel: string;
        slotGroup: string;
        impressions: number;
        contactClicks: number;
        whatsappClicks: number;
        totalContacts: number;
        ctrPercent: number;
        target: number;
        saturationPercent: number;
        isAlert: boolean;
    }>>([]);
    const [performanceTrendRows, setPerformanceTrendRows] = useState<Array<{
        date: string;
        impressions: number;
        totalContacts: number;
        ctrPercent: number;
    }>>([]);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setCurrentUserEmail(user?.email ?? null);
        });
        return () => unsub();
    }, []);

    const fetchSupportNetworkFromCloud = async (syncContext = false) => {
        try {
            const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
            const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
            if (!projectId || !apiKey) return [] as Professional[];
            const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
            const body = {
                structuredQuery: {
                    from: [{ collectionId: "supportNetwork" }],
                    limit: 500,
                },
            };
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) return [] as Professional[];
            const raw = await response.json();
            if (!Array.isArray(raw)) return [] as Professional[];
            const docs = raw
                .map(parseFirestoreDocToProfessional)
                .filter((item): item is Professional => Boolean(item));
            setRestProfessionals(docs);
            if (syncContext) {
                setSupportNetworkProfessionals(docs);
            }
            return docs;
        } catch {
            return [] as Professional[];
        }
    };

    useEffect(() => {
        let cancelled = false;
        const fetchSupportNetwork = async () => {
            const docs = await fetchSupportNetworkFromCloud(false);
            if (cancelled || docs.length === 0) return;
        };
        fetchSupportNetwork();
        return () => {
            cancelled = true;
        };
    }, []);

    const professionalsForAdmin = React.useMemo(() => {
        const byId = new Map<string, Professional>();
        // Primeiro fallback da REST, depois estado principal (mais recente) sobrescreve.
        restProfessionals.forEach((p) => byId.set(p.id, p));
        supportNetworkProfessionals.forEach((p) => byId.set(p.id, p));
        return Array.from(byId.values());
    }, [supportNetworkProfessionals, restProfessionals]);
    const availableUfs = Array.from(new Set(professionalsForAdmin.map((p) => p.uf).filter(Boolean))).sort();
    const availableCities = React.useMemo(() => {
        const byId = new Map<string, { cityId: string; cityName: string; uf: string }>();
        professionalsForAdmin.forEach((prof) => {
            const cityId = String(prof.cityId || "").trim();
            if (!cityId) return;
            if (!byId.has(cityId)) {
                byId.set(cityId, {
                    cityId,
                    cityName: prof.city || cityId,
                    uf: prof.uf || "",
                });
            }
        });
        return Array.from(byId.values()).sort((a, b) => {
            if (a.uf !== b.uf) return a.uf.localeCompare(b.uf);
            return a.cityName.localeCompare(b.cityName);
        });
    }, [professionalsForAdmin]);
    const professionalsById = React.useMemo(() => {
        const map = new Map<string, Professional>();
        professionalsForAdmin.forEach((prof) => map.set(prof.id, prof));
        return map;
    }, [professionalsForAdmin]);

    const resolveQuotaTarget = React.useCallback((cityId: string, slotGroup: string) => {
        const cityCfg = quotaSettings.byCityId?.[cityId];
        if (slotGroup === "hero_exclusive") {
            return Math.max(1, Number(cityCfg?.premiumHeroTarget ?? quotaSettings.defaults.premiumHeroTarget ?? 400));
        }
        return Math.max(1, Number(cityCfg?.proCarouselTarget ?? quotaSettings.defaults.proCarouselTarget ?? 250));
    }, [quotaSettings]);

    const loadQuotaSettings = React.useCallback(async () => {
        try {
            const snap = await getDoc(doc(db, "supportNetworkSettings", "adQuotaTargets"));
            if (!snap.exists()) {
                setQuotaSettings({
                    defaults: { premiumHeroTarget: 400, proCarouselTarget: 250 },
                    byCityId: {},
                });
                return;
            }
            const data = snap.data() as any;
            setQuotaSettings({
                defaults: {
                    premiumHeroTarget: Math.max(1, Number(data?.defaults?.premiumHeroTarget ?? 400)),
                    proCarouselTarget: Math.max(1, Number(data?.defaults?.proCarouselTarget ?? 250)),
                },
                byCityId: (data?.byCityId && typeof data.byCityId === "object") ? data.byCityId : {},
            });
        } catch (err) {
            console.error("Falha ao carregar metas de cota:", err);
        }
    }, []);

    useEffect(() => {
        loadQuotaSettings().catch(() => null);
    }, [loadQuotaSettings]);

    useEffect(() => {
        if (!selectedQuotaCityId && availableCities.length > 0) {
            setSelectedQuotaCityId(availableCities[0].cityId);
        }
    }, [availableCities, selectedQuotaCityId]);

    useEffect(() => {
        if (!selectedQuotaCityId) return;
        const cityCfg = quotaSettings.byCityId?.[selectedQuotaCityId];
        setQuotaPremiumValue(String(Math.max(1, Number(cityCfg?.premiumHeroTarget ?? quotaSettings.defaults.premiumHeroTarget ?? 400))));
        setQuotaProValue(String(Math.max(1, Number(cityCfg?.proCarouselTarget ?? quotaSettings.defaults.proCarouselTarget ?? 250))));
    }, [selectedQuotaCityId, quotaSettings]);

    useEffect(() => {
        setQuotaDefaultPremiumValue(String(Math.max(1, Number(quotaSettings.defaults.premiumHeroTarget ?? 400))));
        setQuotaDefaultProValue(String(Math.max(1, Number(quotaSettings.defaults.proCarouselTarget ?? 250))));
    }, [quotaSettings.defaults.premiumHeroTarget, quotaSettings.defaults.proCarouselTarget]);

    const saveQuotaForCity = async () => {
        if (!selectedQuotaCityId) return;
        const premiumHeroTarget = Math.max(1, Number(quotaPremiumValue || "0"));
        const proCarouselTarget = Math.max(1, Number(quotaProValue || "0"));
        if (!Number.isFinite(premiumHeroTarget) || !Number.isFinite(proCarouselTarget)) {
            alert("Metas inválidas. Informe números maiores que zero.");
            return;
        }
        const cityInfo = availableCities.find((item) => item.cityId === selectedQuotaCityId);
        const next = {
            ...quotaSettings,
            byCityId: {
                ...quotaSettings.byCityId,
                [selectedQuotaCityId]: {
                    ...(quotaSettings.byCityId?.[selectedQuotaCityId] || {}),
                    premiumHeroTarget,
                    proCarouselTarget,
                    cityName: cityInfo?.cityName || quotaSettings.byCityId?.[selectedQuotaCityId]?.cityName || "",
                    uf: cityInfo?.uf || quotaSettings.byCityId?.[selectedQuotaCityId]?.uf || "",
                },
            },
        };
        setIsSavingQuota(true);
        try {
            await setDoc(
                doc(db, "supportNetworkSettings", "adQuotaTargets"),
                {
                    defaults: next.defaults,
                    byCityId: next.byCityId,
                    updatedAt: serverTimestamp(),
                    updatedByEmail: auth.currentUser?.email ?? null,
                },
                { merge: true }
            );
            setQuotaSettings(next);
            alert("Metas da cidade salvas com sucesso.");
        } catch (err) {
            console.error("Falha ao salvar metas da cidade:", err);
            alert("Não foi possível salvar as metas agora.");
        } finally {
            setIsSavingQuota(false);
        }
    };

    const saveQuotaDefaults = async () => {
        const premiumHeroTarget = Math.max(1, Number(quotaDefaultPremiumValue || "0"));
        const proCarouselTarget = Math.max(1, Number(quotaDefaultProValue || "0"));
        if (!Number.isFinite(premiumHeroTarget) || !Number.isFinite(proCarouselTarget)) {
            alert("Metas padrão inválidas. Informe números maiores que zero.");
            return;
        }
        const next = {
            ...quotaSettings,
            defaults: {
                premiumHeroTarget,
                proCarouselTarget,
            },
        };
        setIsSavingQuota(true);
        try {
            await setDoc(
                doc(db, "supportNetworkSettings", "adQuotaTargets"),
                {
                    defaults: next.defaults,
                    byCityId: next.byCityId,
                    updatedAt: serverTimestamp(),
                    updatedByEmail: auth.currentUser?.email ?? null,
                },
                { merge: true }
            );
            setQuotaSettings(next);
            alert("Metas padrão salvas com sucesso.");
        } catch (err) {
            console.error("Falha ao salvar metas padrão:", err);
            alert("Não foi possível salvar as metas padrão agora.");
        } finally {
            setIsSavingQuota(false);
        }
    };

    const exportPerformanceCsv = () => {
        if (performanceRows.length === 0) {
            alert("Sem dados para exportar.");
            return;
        }
        const header = [
            "date",
            "city_filter",
            "professional_id",
            "professional_name",
            "city_label",
            "slot_group",
            "impressions",
            "target",
            "saturation_percent",
            "contact_clicks",
            "whatsapp_clicks",
            "total_contacts",
            "ctr_percent",
            "is_alert_80_plus",
        ];
        const lines = performanceRows.map((row) => [
            performanceDate,
            performanceCityId || "all",
            row.professionalId,
            row.professionalName,
            row.cityLabel,
            row.slotGroup,
            row.impressions,
            row.target,
            row.saturationPercent.toFixed(2),
            row.contactClicks,
            row.whatsappClicks,
            row.totalContacts,
            row.ctrPercent.toFixed(2),
            row.isAlert ? "yes" : "no",
        ].map(escapeCsvValue).join(","));
        const csv = [header.join(","), ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dashboard-cotas-${performanceDate}-${performanceCityId || "all"}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const refreshPerformanceDashboard = async () => {
        setIsLoadingPerformance(true);
        try {
            const dailyQ = query(
                collection(db, "supportNetworkDailyStats"),
                where("date", "==", performanceDate),
                limit(3000)
            );
            const snap = await getDocs(dailyQ);
            const aggregate = new Map<string, {
                professionalId: string;
                cityId: string;
                slotGroup: string;
                impressions: number;
                contactClicks: number;
                whatsappClicks: number;
            }>();

            snap.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const cityId = String(data?.cityId || "");
                if (performanceCityId && cityId !== performanceCityId) return;
                const professionalId = String(data?.professionalId || "");
                const slotGroup = String(data?.slotGroup || "");
                if (!professionalId) return;
                if (slotGroup !== "hero_exclusive" && slotGroup !== "pro_carousel") return;
                const key = `${professionalId}::${cityId || "global"}::${slotGroup}`;
                const current = aggregate.get(key) || {
                    professionalId,
                    cityId,
                    slotGroup,
                    impressions: 0,
                    contactClicks: 0,
                    whatsappClicks: 0,
                };
                current.impressions += Number(data?.impressions || 0);
                current.contactClicks += Number(data?.contactClicks || 0);
                current.whatsappClicks += Number(data?.whatsappClicks || 0);
                aggregate.set(key, current);
            });

            const rows = Array.from(aggregate.values()).map((item) => {
                const professional = professionalsById.get(item.professionalId);
                const cityLabel = professional ? `${professional.city}/${professional.uf}` : (item.cityId || "Global");
                const totalContacts = item.contactClicks + item.whatsappClicks;
                const ctrPercent = item.impressions > 0 ? (totalContacts / item.impressions) * 100 : 0;
                const target = resolveQuotaTarget(item.cityId, item.slotGroup);
                const saturationPercent = item.impressions > 0 ? (item.impressions / target) * 100 : 0;
                return {
                    professionalId: item.professionalId,
                    professionalName: professional?.name || item.professionalId,
                    cityId: item.cityId,
                    cityLabel,
                    slotGroup: item.slotGroup,
                    impressions: item.impressions,
                    contactClicks: item.contactClicks,
                    whatsappClicks: item.whatsappClicks,
                    totalContacts,
                    ctrPercent,
                    target,
                    saturationPercent,
                    isAlert: saturationPercent >= 80,
                };
            }).sort((a, b) => b.saturationPercent - a.saturationPercent || b.impressions - a.impressions);
            setPerformanceRows(rows);
        } catch (err) {
            console.error("Falha ao atualizar dashboard de cotas:", err);
            alert("Não foi possível carregar o dashboard agora.");
        } finally {
            setIsLoadingPerformance(false);
        }
    };

    const refreshPerformanceTrend = async () => {
        setIsLoadingPerformance(true);
        try {
            const baseDate = new Date(`${performanceDate}T00:00:00`);
            const dates = Array.from({ length: performanceWindowDays }, (_, index) => {
                const d = new Date(baseDate);
                d.setDate(baseDate.getDate() - (performanceWindowDays - 1 - index));
                return formatDateIso(d);
            });
            const rows: Array<{
                date: string;
                impressions: number;
                totalContacts: number;
                ctrPercent: number;
            }> = [];

            for (const date of dates) {
                const dailyQ = query(
                    collection(db, "supportNetworkDailyStats"),
                    where("date", "==", date),
                    limit(3000)
                );
                const snap = await getDocs(dailyQ);
                let impressions = 0;
                let totalContacts = 0;
                snap.docs.forEach((docSnap) => {
                    const data = docSnap.data() as any;
                    const cityId = String(data?.cityId || "");
                    if (performanceCityId && cityId !== performanceCityId) return;
                    const slotGroup = String(data?.slotGroup || "");
                    if (slotGroup !== "hero_exclusive" && slotGroup !== "pro_carousel") return;
                    impressions += Number(data?.impressions || 0);
                    totalContacts += Number(data?.contactClicks || 0) + Number(data?.whatsappClicks || 0);
                });
                const ctrPercent = impressions > 0 ? (totalContacts / impressions) * 100 : 0;
                rows.push({ date, impressions, totalContacts, ctrPercent });
            }

            setPerformanceTrendRows(rows);
        } catch (err) {
            console.error("Falha ao carregar tendência:", err);
            alert("Não foi possível carregar o histórico de tendência agora.");
        } finally {
            setIsLoadingPerformance(false);
        }
    };

    const getStatusLabel = (prof: Professional) => {
        const todayStart = new Date(todayStr + "T00:00:00");
        const from = prof.validFrom ? new Date(prof.validFrom + "T00:00:00") : null;
        const to = prof.validTo ? new Date(prof.validTo + "T23:59:59") : null;
        if (prof.isActive === false) return { label: "❌", warning: false };
        if (from && todayStart < from) return { label: "⏳", warning: false };
        if (to && todayStart > to) return { label: "⌛", warning: false };
        if (to) {
            const ms = to.getTime() - todayStart.getTime();
            const days = Math.ceil(ms / 86400000);
            if (days >= 0 && days <= 7) {
                return { label: `⚠️ vence em ${days} dias`, warning: true };
            }
        }
        return { label: "✅", warning: false };
    };

    const getDaysUntilExpiry = (prof: Professional) => {
        if (!prof.validTo) return null;
        const todayStart = new Date(todayStr + "T00:00:00");
        const to = new Date(prof.validTo + "T23:59:59");
        const ms = to.getTime() - todayStart.getTime();
        const days = Math.ceil(ms / 86400000);
        return days;
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings.adminPin) { 
            setAdminPin(pin);
            setIsAuthenticated(true);
        } else {
            if (checkAdminPin(pin)) {
                setIsAuthenticated(true);
            } else {
                setError('PIN incorreto.');
            }
        }
    };

    useEffect(() => {
        if (isManager) setIsAuthenticated(true);
    }, [isManager]);

    const handleBackup = () => {
        const json = JSON.stringify(supportNetworkProfessionals, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `backup-rede-de-apoio-${date}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handlePublishToCloud = async () => {
        if (!window.confirm("Publicar todos os profissionais na nuvem agora?")) return;
        try {
            for (const prof of supportNetworkProfessionals) {
                await setDoc(
                    doc(db, "supportNetwork", prof.id),
                    { ...prof, updatedAt: serverTimestamp() },
                    { merge: true }
                );
            }
            alert("Publicado com sucesso!");
        } catch (err) {
            alert("Falha ao publicar. Verifique sua conexão.");
        }
    };

    const handleSyncSpecialtyCatalogDefaults = async () => {
        if (!window.confirm("Sincronizar agora o catalogo padrao de grandes areas e especialidades?")) return;
        setIsSyncingCatalog(true);
        try {
            await setDoc(
                doc(db, "supportNetworkSettings", "specialtyCatalog"),
                {
                    areas: SUPPORT_NETWORK_AREAS,
                    specialtiesByArea: SUPPORT_NETWORK_SPECIALTIES_BY_AREA,
                    updatedAt: serverTimestamp(),
                    updatedByEmail: currentUserEmail || null,
                },
                { merge: true }
            );
            alert("Catalogo de especialidades sincronizado com sucesso.");
        } catch (err) {
            console.error("Falha ao sincronizar catalogo:", err);
            alert("Nao foi possivel sincronizar o catalogo agora.");
        } finally {
            setIsSyncingCatalog(false);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = String(reader.result || '');
                const data = JSON.parse(text);
                if (!Array.isArray(data)) {
                    alert('Erro: o arquivo não contém uma lista válida.');
                    return;
                }
                const confirmReplace = window.confirm(
                    'Atenção: este upload irá substituir toda a lista existente da Rede de Serviços Profissionais. Deseja continuar?'
                );
                if (!confirmReplace) return;
                setSupportNetworkProfessionals(data);
                alert('Dados importados com sucesso!');
            } catch (e) {
                alert('Erro: arquivo JSON inválido.');
            }
        };
        reader.readAsText(file);
    };
    
    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[120]">
              <div className="bg-white rounded-2xl p-8 text-center text-gray-800 shadow-lg mx-4">
                <h3 className="text-2xl font-bold">{settings.adminPin ? 'Digite o PIN de Admin' : 'Crie um PIN de Admin'}</h3>
                <form onSubmit={handlePinSubmit}>
                  <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} className="w-40 text-center text-4xl tracking-[.5em] font-bold mt-6 p-2 border-b-2 focus:border-purple-500 outline-none" autoFocus />
                  {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                  <div className="flex justify-center gap-4 mt-8">
                    <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300">Cancelar</button>
                    <button type="submit" className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700">Confirmar</button>
                  </div>
                </form>
              </div>
            </div>
        );
    }
    
    return (
        <div className={embedded ? "w-full" : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"}>
            <div
                className={`bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl m-4 flex flex-col overflow-y-auto ${embedded ? "mx-auto my-0" : ""}`}
                style={{ maxHeight: embedded ? 'calc(100vh - 140px)' : '90vh' }}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Admin: Rede de Serviços Profissionais</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                
                <div className="flex flex-wrap gap-2 border-b pb-4 mb-4">
                    <button onClick={() => { setEditingProfessional(null); setIsFormOpen(true); }} className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold">Adicionar Profissional</button>
                    <button
                        onClick={async () => {
                            const docs = await fetchSupportNetworkFromCloud(true);
                            if (docs.length > 0) alert(`Sincronizado com a nuvem: ${docs.length} profissionais.`);
                            else alert("Não foi possível sincronizar agora.");
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                    >
                        Puxar da nuvem
                    </button>
                    <button onClick={handleBackup} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700">Exportar backup (.json)</button>
                    {(!isManager || isAdminEmail) && (
                        <button
                            onClick={() => { void handleSyncSpecialtyCatalogDefaults(); }}
                            disabled={isSyncingCatalog}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-60"
                        >
                            {isSyncingCatalog ? "Sincronizando catalogo..." : "Sincronizar catalogo de especialidades"}
                        </button>
                    )}
                    {(!isManager || isAdminEmail) && (
                        <button onClick={handlePublishToCloud} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold">Enviar para nuvem</button>
                    )}
                    {(!isManager || isAdminEmail) && (
                        <>
                            <button onClick={handleUploadClick} className="px-4 py-2 bg-orange-500 text-white rounded-lg font-semibold">Importar backup (.json)</button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImportFile(file);
                                    if (e.target) e.target.value = '';
                                }}
                            />
                        </>
                    )}
                </div>
                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                        value={filterUf}
                        onChange={(e) => setFilterUf(e.target.value)}
                        className="p-2 border rounded bg-white"
                    >
                        <option value="">Filtrar por Estado (todos)</option>
                        {availableUfs.map((uf) => (
                            <option key={uf} value={uf}>{uf}</option>
                        ))}
                    </select>
                    <select
                        value={filterTier}
                        onChange={(e) => setFilterTier((e.target.value || "") as any)}
                        className="p-2 border rounded bg-white"
                    >
                        <option value="">Filtrar por Categoria (todas)</option>
                        <option value="free">FREE</option>
                        <option value="master">MASTER</option>
                        <option value="top">PRO</option>
                        <option value="exclusive">PREMIUM</option>
                        <option value="verified">LISTA VIP</option>
                    </select>
                </div>
                {(!isManager || isAdminEmail) && (
                    <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50/40 p-3 space-y-3">
                        <h3 className="text-sm font-bold text-purple-800">Metas de cota diária por cidade</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input
                                type="number"
                                min={1}
                                value={quotaDefaultPremiumValue}
                                onChange={(e) => setQuotaDefaultPremiumValue(e.target.value)}
                                className="p-2 border rounded bg-white"
                                placeholder="Padrão PREMIUM hero"
                            />
                            <input
                                type="number"
                                min={1}
                                value={quotaDefaultProValue}
                                onChange={(e) => setQuotaDefaultProValue(e.target.value)}
                                className="p-2 border rounded bg-white"
                                placeholder="Padrão PRO carrossel"
                            />
                            <div className="md:col-span-2 flex md:justify-end">
                                <button
                                    type="button"
                                    onClick={saveQuotaDefaults}
                                    disabled={isSavingQuota}
                                    className="px-3 py-2 bg-purple-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                                >
                                    {isSavingQuota ? "Salvando..." : "Salvar metas padrão"}
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <select
                                value={selectedQuotaCityId}
                                onChange={(e) => setSelectedQuotaCityId(e.target.value)}
                                className="p-2 border rounded bg-white md:col-span-2"
                            >
                                {availableCities.length === 0 && <option value="">Sem cidades</option>}
                                {availableCities.map((city) => (
                                    <option key={`quota-city-${city.cityId}`} value={city.cityId}>
                                        {city.cityName}/{city.uf} ({city.cityId})
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={quotaPremiumValue}
                                onChange={(e) => setQuotaPremiumValue(e.target.value)}
                                className="p-2 border rounded bg-white"
                                placeholder="Meta PREMIUM hero"
                            />
                            <input
                                type="number"
                                min={1}
                                value={quotaProValue}
                                onChange={(e) => setQuotaProValue(e.target.value)}
                                className="p-2 border rounded bg-white"
                                placeholder="Meta PRO carrossel"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-purple-800">
                                Padrão atual: PREMIUM {quotaSettings.defaults.premiumHeroTarget}/dia • PRO {quotaSettings.defaults.proCarouselTarget}/dia.
                                Metas por cidade sobrescrevem o padrão.
                            </p>
                            <button
                                type="button"
                                onClick={saveQuotaForCity}
                                disabled={isSavingQuota || !selectedQuotaCityId}
                                className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                            >
                                {isSavingQuota ? "Salvando..." : "Salvar metas da cidade"}
                            </button>
                        </div>
                    </div>
                )}

                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-3">
                    <h3 className="text-sm font-bold text-blue-800">Dashboard diário de cotas e performance</h3>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                        <input
                            type="date"
                            value={performanceDate}
                            onChange={(e) => setPerformanceDate(e.target.value)}
                            className="p-2 border rounded bg-white"
                        />
                        <select
                            value={performanceCityId}
                            onChange={(e) => setPerformanceCityId(e.target.value)}
                            className="p-2 border rounded bg-white md:col-span-2"
                        >
                            <option value="">Todas as cidades</option>
                            {availableCities.map((city) => (
                                <option key={`perf-city-${city.cityId}`} value={city.cityId}>
                                    {city.cityName}/{city.uf}
                                </option>
                            ))}
                        </select>
                        <select
                            value={String(performanceWindowDays)}
                            onChange={(e) => setPerformanceWindowDays((Number(e.target.value) === 30 ? 30 : 7))}
                            className="p-2 border rounded bg-white"
                        >
                            <option value="7">Histórico 7 dias</option>
                            <option value="30">Histórico 30 dias</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => { void refreshPerformanceDashboard(); void refreshPerformanceTrend(); }}
                            disabled={isLoadingPerformance}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                        >
                            {isLoadingPerformance ? "Carregando..." : "Atualizar dashboard"}
                        </button>
                        <button
                            type="button"
                            onClick={exportPerformanceCsv}
                            disabled={isLoadingPerformance || performanceRows.length === 0}
                            className="px-3 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold disabled:opacity-60"
                        >
                            Exportar CSV
                        </button>
                    </div>
                    {performanceRows.length > 0 && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                <div className="bg-white border border-blue-100 rounded-lg p-2">
                                    <div className="text-blue-700 font-semibold">Profissionais com alerta (&gt;=80%)</div>
                                    <div className="text-lg font-bold text-blue-900">{performanceRows.filter((row) => row.isAlert).length}</div>
                                </div>
                                <div className="bg-white border border-blue-100 rounded-lg p-2">
                                    <div className="text-blue-700 font-semibold">Impressões totais no dia</div>
                                    <div className="text-lg font-bold text-blue-900">{performanceRows.reduce((acc, row) => acc + row.impressions, 0)}</div>
                                </div>
                                <div className="bg-white border border-blue-100 rounded-lg p-2">
                                    <div className="text-blue-700 font-semibold">CTR contato médio</div>
                                    <div className="text-lg font-bold text-blue-900">
                                        {(
                                            (performanceRows.reduce((acc, row) => acc + row.totalContacts, 0) /
                                                Math.max(1, performanceRows.reduce((acc, row) => acc + row.impressions, 0))) * 100
                                        ).toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto border rounded-lg bg-white">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-blue-50">
                                        <tr>
                                            <th className="p-2">Profissional</th>
                                            <th className="p-2">Cidade</th>
                                            <th className="p-2">Slot</th>
                                            <th className="p-2">Impressões</th>
                                            <th className="p-2">Meta</th>
                                            <th className="p-2">% Cota</th>
                                            <th className="p-2">CTR contato</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {performanceRows.map((row) => (
                                            <tr key={`${row.professionalId}-${row.cityId}-${row.slotGroup}`} className="border-t">
                                                <td className="p-2 font-semibold">{row.professionalName}</td>
                                                <td className="p-2">{row.cityLabel}</td>
                                                <td className="p-2">{row.slotGroup === "hero_exclusive" ? "PREMIUM hero" : "PRO carrossel"}</td>
                                                <td className="p-2">{row.impressions}</td>
                                                <td className="p-2">{row.target}</td>
                                                <td className={`p-2 font-bold ${row.isAlert ? "text-amber-700" : "text-gray-700"}`}>
                                                    {row.saturationPercent.toFixed(1)}%
                                                </td>
                                                <td className="p-2">{row.ctrPercent.toFixed(2)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {performanceRows.some((row) => row.isAlert) && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                    <div className="font-bold mb-1">Alertas de saturação (&gt;=80%)</div>
                                    <ul className="space-y-1">
                                        {performanceRows
                                            .filter((row) => row.isAlert)
                                            .slice(0, 8)
                                            .map((row) => (
                                                <li key={`alert-${row.professionalId}-${row.slotGroup}`}>
                                                    {row.professionalName} • {row.slotGroup === "hero_exclusive" ? "PREMIUM hero" : "PRO carrossel"} • {row.saturationPercent.toFixed(1)}%
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                    {performanceTrendRows.length > 0 && (
                        <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-blue-800">Tendência de CTR ({performanceWindowDays} dias)</div>
                                <div className="text-[11px] text-blue-700">
                                    {(() => {
                                        const first = performanceTrendRows[0]?.ctrPercent ?? 0;
                                        const last = performanceTrendRows[performanceTrendRows.length - 1]?.ctrPercent ?? 0;
                                        const delta = last - first;
                                        const signal = delta > 0.05 ? "alta" : delta < -0.05 ? "queda" : "estável";
                                        return `Início ${first.toFixed(2)}% • Fim ${last.toFixed(2)}% • Tendência ${signal}`;
                                    })()}
                                </div>
                            </div>
                            <div className="max-h-44 overflow-y-auto border rounded-lg">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-blue-50">
                                        <tr>
                                            <th className="p-2">Data</th>
                                            <th className="p-2">Impressões</th>
                                            <th className="p-2">Contatos</th>
                                            <th className="p-2">CTR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {performanceTrendRows.map((row) => (
                                            <tr key={`trend-${row.date}`} className="border-t">
                                                <td className="p-2">{row.date}</td>
                                                <td className="p-2">{row.impressions}</td>
                                                <td className="p-2">{row.totalContacts}</td>
                                                <td className="p-2 font-semibold">{row.ctrPercent.toFixed(2)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {performanceRows.length === 0 && !isLoadingPerformance && (
                        <p className="text-xs text-blue-800">
                            Sem dados para o filtro atual. Clique em "Atualizar dashboard". Se estiver filtrando por cidade, tente "Todas as cidades".
                        </p>
                    )}
                </div>

                {(() => {
                    const expiring = supportNetworkProfessionals
                        .map((p) => ({ prof: p, days: getDaysUntilExpiry(p) }))
                        .filter((item) => item.days !== null && item.days >= 0 && item.days <= 7);
                    if (expiring.length === 0) return null;
                    return (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                            <div className="text-sm font-bold text-amber-800 mb-1">Vencendo em até 7 dias</div>
                            <div className="text-xs text-amber-700 mb-2">Aviso para contato com os profissionais.</div>
                            <ul className="text-xs text-amber-900 space-y-1">
                                {expiring.map(({ prof, days }) => (
                                    <li key={prof.id}>
                                        <span className="font-semibold">{prof.name}</span> • {prof.city}/{prof.uf} • vence em {days} dia(s)
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })()}
                
                <div className="pr-2">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr><th className="p-2">Nome</th><th>Cidade/UF</th><th>Especialidades</th><th>Categoria</th><th>Status</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                            {professionalsForAdmin
                                .filter((prof) => {
                                    if (!isManager || !managerProfile || isAdminEmail) return true;
                                    return prof.uf === managerProfile.uf && managerProfile.cityIds.includes(String(prof.cityId));
                                })
                                .filter((prof) => !filterUf || prof.uf === filterUf)
                                .filter((prof) => !filterTier || prof.tier === filterTier)
                                .map(prof => (
                                <tr key={prof.id} className="border-b hover:bg-gray-50">
                                    <td className="p-2 font-medium">{prof.name}</td>
                                    <td>{prof.city}/{prof.uf}</td>
                                    <td>{(Array.isArray(prof.specialties) ? prof.specialties : (prof.specialty ? [prof.specialty] : [])).join(", ") || "-"}</td>
                                    <td>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                            prof.tier === 'master' ? 'bg-purple-100 text-purple-700' :
                                            prof.tier === 'exclusive' ? 'bg-purple-100 text-purple-700' :
                                            prof.tier === 'top' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            {getTierLabel(prof.tier)}
                                        </span>
                                    </td>
                                    <td>
                                        {(() => {
                                            const status = getStatusLabel(prof);
                                            return (
                                                <span className={status.warning ? "text-amber-700 font-semibold" : ""}>
                                                    {status.label}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="space-x-2">
                                        <button onClick={() => { setEditingProfessional(prof); setIsFormOpen(true); }} className="text-purple-600 font-semibold">Editar</button>
                                        <button onClick={() => setReportProfessional(prof)} className="text-blue-600 font-semibold">Relatório</button>
                                        {!isManager ? (
                                            <button
                                                onClick={() => {
                                                    if (window.confirm(`Excluir ${prof.name}?`)) {
                                                        setRestProfessionals((prev) => prev.filter((item) => item.id !== prof.id));
                                                        deleteProfessional(prof.id);
                                                    }
                                                }}
                                                className="text-red-600 font-semibold"
                                            >
                                                Excluir
                                            </button>
                                        ) : (
                                            <button
                                                onClick={async () => {
                                                    const reason = window.prompt("Motivo da solicitação (opcional):", "");
                                                    await setDoc(doc(collection(db, "deletionRequests")), {
                                                        professionalId: prof.id,
                                                        professionalName: prof.name,
                                                        cityId: prof.cityId,
                                                        uf: prof.uf,
                                                        requestedByEmail: managerProfile?.email || null,
                                                        requestedByManagerId: managerProfile?.id || null,
                                                        reason: reason || "",
                                                        status: "pending",
                                                        createdAt: serverTimestamp(),
                                                    });
                                                    alert("Solicitação enviada para o admin.");
                                                }}
                                                className="text-purple-600 font-semibold"
                                            >
                                                Solicitar exclusão
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {isFormOpen && (
                    <ProfessionalForm
                        professional={editingProfessional}
                        onClose={() => setIsFormOpen(false)}
                        onRequestBackup={handleBackup}
                        managerProfile={managerProfile}
                        isManager={isManager}
                    />
                )}
                {reportProfessional && (
                    <ProfessionalReportModal
                        professional={reportProfessional}
                        onClose={() => setReportProfessional(null)}
                    />
                )}
            </div>
        </div>
    );
};


interface ProfessionalReportModalProps {
    professional: Professional;
    onClose: () => void;
}

const ProfessionalReportModal: React.FC<ProfessionalReportModalProps> = ({ professional, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Record<string, number>>({});
    const [events, setEvents] = useState<Array<{ eventType: string; userEmail?: string | null; createdAt?: any }>>([]);
    const todayIso = new Date().toISOString().slice(0, 10);
    const [fromDate, setFromDate] = useState(todayIso);
    const [toDate, setToDate] = useState(todayIso);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                setLoading(true);
                const statsSnap = await getDoc(doc(db, "supportNetworkStats", professional.id));
                const statsData = (statsSnap.data() || {}) as Record<string, any>;

                const eventsQ = query(
                    collection(db, "supportNetworkEvents"),
                    where("professionalId", "==", professional.id),
                    limit(100)
                );
                const eventsSnap = await getDocs(eventsQ);
                const rawEvents = eventsSnap.docs.map((d) => d.data() as any);
                const sortedEvents = rawEvents.sort((a, b) => {
                    const aTime = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                    const bTime = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                    return bTime - aTime;
                });

                if (cancelled) return;
                setStats({
                    whatsappClicks: Number(statsData.whatsappClicks || 0),
                    contactClicks: Number(statsData.contactClicks || 0),
                    locationClicks: Number(statsData.locationClicks || 0),
                    favoriteAdds: Number(statsData.favoriteAdds || 0),
                    routineImportClicks: Number(statsData.routineImportClicks || 0),
                });
                setEvents(sortedEvents);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run().catch(() => {
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [professional.id]);

    const eventLabel = (type: string) => {
        if (type === "whatsapp_click") return "Clique WhatsApp";
        if (type === "contact_click") return "Clique Contato";
        if (type === "location_click") return "Clique Localização";
        if (type === "favorite_add") return "Novo Favorito";
        if (type === "routine_import") return "Clique em Conteúdo Personalizado";
        return type;
    };

    const filteredEvents = useMemo(() => {
        const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
        const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
        return events.filter((evt) => {
            const dt = evt.createdAt?.toDate ? evt.createdAt.toDate() : null;
            const ms = dt ? dt.getTime() : null;
            if (ms === null) return false;
            return ms >= fromMs && ms <= toMs;
        });
    }, [events, fromDate, toDate]);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Relatório: {professional.name}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800">Fechar</button>
                </div>
                {loading ? (
                    <p className="text-sm text-gray-500">Carregando...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
                            <div className="bg-green-50 rounded-lg p-3"><div className="text-[11px] text-gray-500">WhatsApp</div><div className="text-lg font-bold">{stats.whatsappClicks || 0}</div></div>
                            <div className="bg-cyan-50 rounded-lg p-3"><div className="text-[11px] text-gray-500">Contato</div><div className="text-lg font-bold">{stats.contactClicks || 0}</div></div>
                            <div className="bg-blue-50 rounded-lg p-3"><div className="text-[11px] text-gray-500">Localização</div><div className="text-lg font-bold">{stats.locationClicks || 0}</div></div>
                            <div className="bg-pink-50 rounded-lg p-3"><div className="text-[11px] text-gray-500">Favoritos</div><div className="text-lg font-bold">{stats.favoriteAdds || 0}</div></div>
                            <div className="bg-purple-50 rounded-lg p-3"><div className="text-[11px] text-gray-500">Conteúdo personalizado</div><div className="text-lg font-bold">{stats.routineImportClicks || 0}</div></div>
                        </div>
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-2">
                                <h4 className="font-semibold">Últimos eventos</h4>
                                <div className="flex items-end gap-2 text-xs">
                                    <label className="flex flex-col">
                                        <span className="text-gray-500">De</span>
                                        <input
                                            type="date"
                                            value={fromDate}
                                            max={toDate || undefined}
                                            onChange={(e) => setFromDate(e.target.value)}
                                            className="p-1.5 border rounded"
                                        />
                                    </label>
                                    <label className="flex flex-col">
                                        <span className="text-gray-500">Até</span>
                                        <input
                                            type="date"
                                            value={toDate}
                                            min={fromDate || undefined}
                                            onChange={(e) => setToDate(e.target.value)}
                                            className="p-1.5 border rounded"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFromDate(todayIso);
                                            setToDate(todayIso);
                                        }}
                                        className="px-2 py-1.5 rounded border border-gray-300 text-gray-700 font-semibold"
                                    >
                                        Hoje
                                    </button>
                                </div>
                            </div>
                            {filteredEvents.length === 0 ? (
                                <p className="text-sm text-gray-500">Sem eventos ainda.</p>
                            ) : (
                                <ul className="space-y-1 text-sm">
                                    {filteredEvents.slice(0, 50).map((evt, idx) => {
                                        const dt = evt.createdAt?.toDate ? evt.createdAt.toDate() : null;
                                        return (
                                            <li key={`${evt.eventType}-${idx}`} className="flex items-center justify-between border-b py-1">
                                                <span>{eventLabel(evt.eventType)}</span>
                                                <span className="text-xs text-gray-500">{evt.userEmail || "usuário"} {dt ? `• ${dt.toLocaleString("pt-BR")}` : ""}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// Form Component
interface ProfessionalFormProps {
    professional: Professional | null,
    onClose: () => void;
    onRequestBackup: () => void;
    managerProfile: Manager | null;
    isManager: boolean;
}
const ProfessionalForm: React.FC<ProfessionalFormProps> = ({ professional, onClose, onRequestBackup, managerProfile, isManager }) => {
    const { addProfessional, updateProfessional, deleteProfessional, supportNetworkProfessionals, supportNetworkPricing } = useAppContext();
    const isEditing = !!professional;
    const splitOtherSpecialties = (value: string) =>
        value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    
    const emptyState: Partial<Professional> = {
        contacts: {},
        verified: false,
        tier: "verified",
        isActive: true,
        validFrom: "",
        validTo: "",
        spotlightDailyLimit: 2,
        spotlightKeywords: [],
        specialties: [],
        bookingGreeting: "dra",
        bookingChannel: "whatsapp",
        personType: "pf",
        paymentBilling: "monthly",
        paymentStatus: "pending",
    };

    const [formState, setFormState] = useState<Partial<Professional>>(() => {
        if (!professional) return emptyState;
        const baseSpecialties = professional.specialties || (professional.specialty ? [professional.specialty] : []);
        const predefined = baseSpecialties.filter((s) => SPECIALTIES.includes(s));
        return { ...professional, specialties: predefined };
    });
    const [keywordText, setKeywordText] = useState("");
    const [highlightsText, setHighlightsText] = useState("");
    const [otherSpecialtiesText, setOtherSpecialtiesText] = useState("");
    const [otherLinksText, setOtherLinksText] = useState("");
    const [states, setStates] = useState<UF[]>([]);
    const [cities, setCities] = useState<Municipio[]>([]);
    const panelAccessCode = professional?.id ? buildProfessionalConnectCode(professional.id) : "";
    const panelAccessLink = typeof window !== "undefined" ? `${window.location.origin}/professional` : "/professional";
    const [isUploading, setIsUploading] = useState(false);
    const [isPhotoUploading, setIsPhotoUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [masterMonth, setMasterMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const todayStr = new Date().toISOString().slice(0, 10);
    const photoUploadTaskRef = useRef<ReturnType<typeof uploadBytesResumable> | null>(null);
    const videoUploadTaskRef = useRef<ReturnType<typeof uploadBytesResumable> | null>(null);

    const resolvePricing = (tier?: string, billing?: string) => {
        if (!tier || !billing) return undefined;
        const plan = (supportNetworkPricing?.plans as any)?.[tier];
        if (!plan) return undefined;
        return billing === "annual" ? plan.annual : plan.monthly;
    };
    useEffect(() => { getStates().then(setStates); }, []);
    useEffect(() => {
        if (professional) {
            const baseSpecialties = professional.specialties || (professional.specialty ? [professional.specialty] : []);
            const predefined = baseSpecialties.filter((s) => SPECIALTIES.includes(s));
            setFormState({ ...professional, specialties: predefined });
            setKeywordText((professional.spotlightKeywords || []).join(", "));
            setHighlightsText((professional.highlights || []).join(", "));
            const other = baseSpecialties.filter((s) => !SPECIALTIES.includes(s));
            setOtherSpecialtiesText(other.join(", "));
            setOtherLinksText((professional.contacts?.otherLinks || []).join("\n"));
            return;
        }

        setFormState({
            ...emptyState,
            uf: managerProfile?.uf || "",
        });
        setKeywordText("");
        setHighlightsText("");
        setOtherSpecialtiesText("");
        setOtherLinksText("");
    }, [professional?.id]);

    useEffect(() => {
        if (professional) return;
        setFormState((prev) => ({ ...prev, uf: managerProfile?.uf || "" }));
    }, [professional, managerProfile?.uf]);

    useEffect(() => {
        return () => {
            try { photoUploadTaskRef.current?.cancel(); } catch {}
            try { videoUploadTaskRef.current?.cancel(); } catch {}
        };
    }, []);

    useEffect(() => {
        if (!formState.bookingMessage) {
            const greeting = formState.bookingGreeting || "dra";
            const name = formState.name || "";
            setFormState((p) => ({
                ...p,
                bookingMessage: buildDefaultBookingMessage(name, greeting),
            }));
        }
    }, [formState.bookingGreeting, formState.name]);
    useEffect(() => {
        const price = resolvePricing(formState.tier, formState.paymentBilling);
        if (price === undefined || price === null || price <= 0) return;
        if (formState.paymentPrice === price) return;
        setFormState((p) => ({ ...p, paymentPrice: price }));
    }, [formState.tier, formState.paymentBilling, supportNetworkPricing]);
    useEffect(() => {
        if (formState.uf) getCitiesByState(formState.uf).then(setCities);
    }, [formState.uf]);

    useEffect(() => {
        const tier = formState.tier || "verified";
        if (tier === "master") return;

        const start = formState.validFrom && formState.validFrom >= todayStr ? formState.validFrom : todayStr;
        const minEnd = addMonthsToIsoDate(start, 1);
        if (formState.validFrom !== start || !formState.validTo || formState.validTo < minEnd) {
            setFormState((p) => ({
                ...p,
                validFrom: start,
                validTo: !p.validTo || p.validTo < minEnd ? minEnd : p.validTo,
            }));
        }
    }, [formState.tier, formState.validFrom, formState.validTo, todayStr]);

    useEffect(() => {
        const generated = buildMapsLinkFromAddress({
            street: formState.addressStreet,
            number: formState.addressNumber,
            neighborhood: formState.addressNeighborhood,
            city: formState.addressCity,
            uf: formState.addressUf,
        });
        if (!generated) return;
        if (formState.contacts?.maps === generated) return;
        setFormState((prev) => ({ ...prev, contacts: { ...prev.contacts, maps: generated } }));
    }, [
        formState.addressStreet,
        formState.addressNumber,
        formState.addressNeighborhood,
        formState.addressCity,
        formState.addressUf,
    ]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        if (name.startsWith('contacts.')) {
            const field = name.split('.')[1];
            setFormState(p => ({ ...p, contacts: { ...p.contacts, [field]: value } }));
        } else if (name === "spotlightDailyLimit") {
            const asNumber = Number(value);
            setFormState(p => ({ ...p, spotlightDailyLimit: Number.isNaN(asNumber) ? undefined : asNumber }));
        } else if (name === "paymentPrice") {
            if (value === "") {
                setFormState(p => ({ ...p, paymentPrice: undefined }));
                return;
            }
            const asNumber = Number(value);
            setFormState(p => ({ ...p, paymentPrice: Number.isNaN(asNumber) ? undefined : asNumber }));
        } else if(type === 'checkbox') {
            setFormState(p => ({ ...p, [name]: checked }));
        } else if (name === "bio") {
            if (value.length > BIO_MAX_CHARS) return;
            setFormState(p => ({ ...p, [name]: value }));
        } else if (name === "validFrom") {
            const normalized = value && value < todayStr ? todayStr : value;
            setFormState((p) => ({ ...p, validFrom: normalized }));
        } else {
            setFormState(p => ({ ...p, [name]: value }));
        }
    };

    const toggleSpecialty = (value: string) => {
        setFormState(p => {
            const current = new Set(p.specialties || []);
            if (current.has(value)) {
                current.delete(value);
            } else {
                if (current.size >= MAX_SPECIALTIES) {
                    alert(`Você pode selecionar no máximo ${MAX_SPECIALTIES} especialidades.`);
                    return p;
                }
                current.add(value);
            }
            return { ...p, specialties: Array.from(current) };
        });
    };

    const uploadImage = async (
        file: File,
        path: string,
        timeoutMs: number,
        taskRef: React.MutableRefObject<ReturnType<typeof uploadBytesResumable> | null>
    ) => {
        const fileRef = ref(storage, path);
        return new Promise<string>((resolve, reject) => {
            if (taskRef.current) {
                try {
                    taskRef.current.cancel();
                } catch {}
            }
            const task = uploadBytesResumable(fileRef, file, { contentType: file.type });
            taskRef.current = task;
            const timeoutId = window.setTimeout(() => {
                task.cancel();
                reject(new Error("Upload demorou demais e foi cancelado. Tente novamente."));
            }, timeoutMs);

            task.on(
                "state_changed",
                () => {},
                (error) => {
                    window.clearTimeout(timeoutId);
                    if (taskRef.current === task) taskRef.current = null;
                    reject(error);
                },
                async () => {
                    try {
                        const url = await getDownloadURL(task.snapshot.ref);
                        window.clearTimeout(timeoutId);
                        if (taskRef.current === task) taskRef.current = null;
                        resolve(url);
                    } catch (error) {
                        window.clearTimeout(timeoutId);
                        if (taskRef.current === task) taskRef.current = null;
                        reject(error);
                    }
                }
            );
        });
    };

    const handleProfilePhotoUpload = async (file: File) => {
        setUploadError(null);
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setUploadError("Formato inválido. Envie uma imagem.");
            return;
        }
        if (file.size > PROFILE_IMAGE_MAX_BYTES) {
            setUploadError(`Imagem grande demais. Máximo ${formatBytes(PROFILE_IMAGE_MAX_BYTES)}.`);
            return;
        }

        try {
            setIsPhotoUploading(true);
            const { width, height } = await getImageDimensions(file);
            if (width !== PROFILE_IMAGE_WIDTH || height !== PROFILE_IMAGE_HEIGHT) {
                setUploadError(`A imagem precisa ter ${PROFILE_IMAGE_WIDTH}x${PROFILE_IMAGE_HEIGHT}px.`);
                return;
            }
            const id = professional?.id || crypto.randomUUID();
            const extension = file.name.includes(".")
                ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
                : ".jpg";
            const path = `support-network/profiles/${id}-${Date.now()}${extension}`;
            const fileRef = ref(storage, path);
            await uploadBytes(fileRef, file, { contentType: file.type });
            const url = await getDownloadURL(fileRef);
            setFormState((p) => ({ ...p, photoUrl: url }));
        } catch (err) {
            setUploadError(getUploadErrorMessage(err, "Falha ao enviar a foto."));
        } finally {
            setIsPhotoUploading(false);
        }
    };

    const handleMasterVideoUpload = async (file: File) => {
        setUploadError(null);
        if (!file) return;
        if (file.type !== "video/mp4") {
            setUploadError("Formato inválido. Use MP4 (H.264).");
            return;
        }
        if (file.size > MASTER_VIDEO_MAX_BYTES) {
            setUploadError(`Vídeo grande demais. Máximo ${formatBytes(MASTER_VIDEO_MAX_BYTES)}.`);
            return;
        }
        try {
            setIsUploading(true);
            const { duration, width, height } = await getVideoMetadata(file);
            if (duration > MASTER_VIDEO_MAX_SECONDS) {
                setUploadError(`O vídeo deve ter até ${MASTER_VIDEO_MAX_SECONDS} segundos.`);
                return;
            }
            if (width !== MASTER_VIDEO_WIDTH || height !== MASTER_VIDEO_HEIGHT) {
                setUploadError(`O vídeo precisa ter ${MASTER_VIDEO_WIDTH}x${MASTER_VIDEO_HEIGHT}px.`);
                return;
            }
            const id = professional?.id || crypto.randomUUID();
            const url = await uploadImage(
                file,
                `support-network/videos/${id}-${Date.now()}.mp4`,
                VIDEO_UPLOAD_TIMEOUT_MS,
                videoUploadTaskRef
            );
            setFormState(p => ({ ...p, videoUrl: url }));
        } catch (err) {
            setUploadError(getUploadErrorMessage(err, "Falha ao enviar o vídeo."));
        } finally {
            setIsUploading(false);
        }
    };

    const fetchAddressFromCep = async (cepFormatted: string) => {
        const cep = onlyDigits(cepFormatted);
        if (cep.length !== 8) return;
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) return;
            const data = await response.json();
            if (data?.erro) return;
            setFormState((prev) => {
                const next = {
                    ...prev,
                    addressStreet: data.logradouro || prev.addressStreet || "",
                    addressNeighborhood: data.bairro || prev.addressNeighborhood || "",
                    addressCity: data.localidade || prev.addressCity || "",
                    addressUf: data.uf || prev.addressUf || "",
                };
                const generatedMaps = buildMapsLinkFromAddress({
                    street: next.addressStreet,
                    number: next.addressNumber,
                    neighborhood: next.addressNeighborhood,
                    city: next.addressCity,
                    uf: next.addressUf,
                });
                return {
                    ...next,
                    contacts: {
                        ...next.contacts,
                        maps: generatedMaps || next.contacts?.maps || "",
                    },
                };
            });
        } catch {
            // falha silenciosa: usuário pode preencher manualmente
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cityObj = cities.find(c => String(c.id) === formState.cityId);
        if (!cityObj) return alert('Cidade inválida!');
        if (isManager && managerProfile) {
            if (formState.uf !== managerProfile.uf) return alert("UF fora da sua área.");
            if (!managerProfile.cityIds.includes(String(formState.cityId))) return alert("Cidade fora da sua área.");
        }
        
        if (isUploading || isPhotoUploading) return alert("Aguarde o upload terminar.");
        if (!formState.personType) return alert("Selecione o tipo de pessoa.");
        if (!formState.name?.trim()) return alert("Informe o nome.");
        if (formState.personType === "pf" && !formState.cpf?.trim()) return alert("Informe o CPF.");
        if (formState.personType === "pj" && !formState.cnpj?.trim()) return alert("Informe o CNPJ.");
        if (formState.personType === "pj" && !formState.legalName?.trim()) return alert("Informe a razão social.");
        if (!formState.registryLabel?.trim()) return alert("Informe a inscrição no conselho.");
        if (!formState.addressStreet?.trim()) return alert("Informe o endereço comercial.");
        if (!formState.addressNumber?.trim()) return alert("Informe o número.");
        if (!formState.addressNeighborhood?.trim()) return alert("Informe o bairro.");
        if (!formState.addressCep?.trim()) return alert("Informe o CEP.");
        if (!formState.addressCity?.trim()) return alert("Informe a cidade do endereço.");
        if (!formState.addressUf?.trim()) return alert("Informe a UF do endereço.");
        if (!formState.contacts?.maps?.trim()) return alert("Informe o link do Google Maps.");
        if (!formState.contacts?.responsiblePhone?.trim()) return alert("Informe o telefone do responsável pelo anúncio.");
        if (!formState.contacts?.phone?.trim()) return alert("Informe o telefone do estabelecimento.");
        if (!formState.contacts?.whatsapp?.trim()) return alert("Informe o WhatsApp do estabelecimento.");
        const requiresPanelEmail = isProfessionalPanelTier(formState.tier);
        if (!formState.contacts?.email?.trim() && requiresPanelEmail) {
            return alert(`Para ${getTierLabel(formState.tier)}, informe o e-mail de acesso ao painel profissional.`);
        }

        if (!formState.validFrom || !formState.validTo) return alert("Informe o período de validade.");
        if (formState.validFrom < todayStr) return alert("A data de início não pode ser retroativa.");
        if (formState.validTo < formState.validFrom) return alert("A data final não pode ser menor que a inicial.");
        if (formState.tier !== "master") {
            const minValidTo = addMonthsToIsoDate(formState.validFrom, 1);
            if (formState.validTo < minValidTo) {
                return alert(`Para ${getTierLabel(formState.tier)}, o período mínimo é 1 mês. Data final mínima: ${minValidTo}.`);
            }
        }

        if (!formState.photoUrl?.trim()) return alert("Envie a foto de perfil.");
        if (formState.tier === "master" && !formState.videoUrl) {
            return alert("Para o MASTER, o vídeo MP4 é obrigatório.");
        }

        if (!formState.paymentBilling) return alert("Selecione o plano de pagamento.");
        if (!formState.paymentPrice || Number.isNaN(Number(formState.paymentPrice))) return alert("Informe o valor do plano.");

        if (formState.bookingChannel === "phone") {
            if (!formState.bookingPhone?.trim()) return alert("Informe o número para agendamento.");
        } else {
            if (!formState.contacts?.whatsapp?.trim()) return alert("Informe o WhatsApp para agendamento.");
        }

        const baseSpecialties = formState.specialties || [];
        const otherSpecialties = splitOtherSpecialties(otherSpecialtiesText);
        if (otherSpecialties.length > MAX_OTHER_SPECIALTIES) {
            return alert(`Você pode adicionar no máximo ${MAX_OTHER_SPECIALTIES} especialidades em "Outras".`);
        }
        const specialties = Array.from(new Set([...baseSpecialties, ...otherSpecialties]));
        if (specialties.length === 0) return alert("Selecione pelo menos 1 especialidade.");

        const spotlightKeywords = keywordText
            .split(",")
            .map((kw) => kw.trim().toLowerCase())
            .filter(Boolean);

        const highlights = highlightsText
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean);

        if (formState.tier === "exclusive" && spotlightKeywords.length === 0) {
            return alert("Informe palavras-chave para o Premium.");
        }

        const data = {
            ...formState,
            city: cityObj.nome,
            galleryUrls: [],
            photoUrl: formState.photoUrl.trim(),
            specialties,
            specialty: specialties[0],
            highlights,
            spotlightKeywords,
            spotlightDailyLimit: formState.spotlightDailyLimit || 2,
            paymentPrice: formState.paymentPrice ? Number(formState.paymentPrice) : undefined,
            plan_type: mapTierToPlanType(formState.tier),
        } as Professional;
        const planConfig = PROFESSIONAL_PLAN_CONFIG[data.plan_type || "FREE"];
        data.ia_habilitada = planConfig.aiEnabled;
        if (typeof data.horas_transcricao_restantes !== "number") {
            data.horas_transcricao_restantes = planConfig.voiceHours * 3600;
        }
        if (typeof data.total_pacientes_vinculados !== "number") {
            data.total_pacientes_vinculados = 0;
        }
        if (typeof data.pacientes_mes_atual !== "number") {
            data.pacientes_mes_atual = 0;
        }
        if (!data.limite_mes_referencia) {
            data.limite_mes_referencia = new Date().toISOString().slice(0, 7);
        }
        if (typeof data.status_bloqueio !== "boolean") {
            data.status_bloqueio = false;
        }
        
        // Regras de Unicidade
        if (data.tier === 'master') {
            const existing = supportNetworkProfessionals.find(p => p.tier === 'master' && p.cityId === data.cityId && p.id !== data.id && p.isActive);
            if (existing && !window.confirm(`Já existe um Master em ${data.city} (${existing.name}). Deseja rebaixar o atual para Lista Vip e assumir como Master?`)) return;
            if (existing) {
                updateProfessional({ ...existing, tier: 'verified' });
            }
        }
        
        if (data.tier === 'exclusive') {
            const conflicts = supportNetworkProfessionals.filter(p =>
                p.tier === 'exclusive' &&
                p.cityId === data.cityId &&
                p.id !== data.id &&
                p.isActive &&
                (p.specialties || (p.specialty ? [p.specialty] : [])).some(s => specialties.includes(s))
            );
            if (conflicts.length > 0) {
                const names = conflicts.map(c => {
                    const list = c.specialties && c.specialties.length > 0
                        ? c.specialties
                        : c.specialty
                            ? [c.specialty]
                            : [];
                    return `${c.name} (${list.join(", ")})`;
                }).join("\n");
                if (!window.confirm(`Já existe Premium para esta(s) especialidade(s) em ${data.city}:\n${names}\n\nDeseja substituir?`)) return;
                conflicts.forEach(existing => updateProfessional({ ...existing, tier: 'verified' }));
            }
        }

        // Set JoinedAt if upgraded
        if (data.tier !== 'verified' && (!professional || professional.tier !== data.tier)) {
            data.tierJoinedAt = new Date().toISOString();
        }

        if (isEditing) {
            updateProfessional(data);
        } else {
            addProfessional(data);
            if (!isManager) {
                const wantsBackup = window.confirm('Deseja criar um backup de segurança agora?');
                if (wantsBackup) onRequestBackup();
            }
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
                <h3 className="text-xl font-bold mb-4">{isEditing ? 'Editar' : 'Adicionar'} Profissional</h3>
                <div className="overflow-y-auto pr-2 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 text-sm font-bold text-gray-700 mt-1">Identificação</div>
                        <select name="personType" value={formState.personType || 'pf'} onChange={handleChange} className="p-2 border rounded bg-white">
                            <option value="pf">Pessoa física</option>
                            <option value="pj">Pessoa jurídica</option>
                        </select>
                        <input name="name" value={formState.name || ''} onChange={handleChange} placeholder="Nome profissional (aparece no anúncio)" className="p-2 border rounded" />
                        {formState.personType === "pf" && (
                            <input
                                name="cpf"
                                value={formState.cpf || ''}
                                onChange={(e) => setFormState(p => ({ ...p, cpf: formatCpf(e.target.value) }))}
                                placeholder="CPF (000.000.000-00)"
                                type="tel"
                                inputMode="numeric"
                                maxLength={14}
                                pattern="\d{3}\.\d{3}\.\d{3}-\d{2}"
                                className="p-2 border rounded"
                            />
                        )}
                        {formState.personType === "pj" && (
                            <>
                                <input
                                    name="cnpj"
                                    value={formState.cnpj || ''}
                                    onChange={(e) => setFormState(p => ({ ...p, cnpj: formatCnpj(e.target.value) }))}
                                    placeholder="CNPJ"
                                    inputMode="numeric"
                                    className="p-2 border rounded"
                                />
                                <input name="legalName" value={formState.legalName || ''} onChange={handleChange} placeholder="Razão social" className="p-2 border rounded" />
                            </>
                        )}

                        <div className="col-span-2 text-sm font-bold text-gray-700 mt-3">Endereço do estabelecimento</div>
                        <input
                            name="addressCep"
                            value={formState.addressCep || ''}
                            onChange={(e) => setFormState(p => ({ ...p, addressCep: formatCep(e.target.value) }))}
                            onBlur={(e) => { void fetchAddressFromCep(e.target.value); }}
                            placeholder="CEP"
                            inputMode="numeric"
                            className="p-2 border rounded col-span-2"
                        />
                        <input name="addressStreet" value={formState.addressStreet || ''} onChange={handleChange} placeholder="Rua / Avenida" className="p-2 border rounded col-span-2" />
                        <input name="addressNumber" value={formState.addressNumber || ''} onChange={handleChange} placeholder="Número" className="p-2 border rounded" />
                        <input name="addressComplement" value={formState.addressComplement || ''} onChange={handleChange} placeholder="Complemento" className="p-2 border rounded" />
                        <input name="addressReference" value={formState.addressReference || ''} onChange={handleChange} placeholder="Referência" className="p-2 border rounded col-span-2" />
                        <input name="addressNeighborhood" value={formState.addressNeighborhood || ''} onChange={handleChange} placeholder="Bairro" className="p-2 border rounded" />
                        <input name="addressCity" value={formState.addressCity || ''} onChange={handleChange} placeholder="Cidade (endereço)" className="p-2 border rounded" />
                        <select name="addressUf" value={formState.addressUf || ''} onChange={handleChange} className="p-2 border rounded bg-white">
                            <option value="">UF (endereço)</option>
                            {states.map(s => <option key={`addr-${s.sigla}`} value={s.sigla}>{s.sigla}</option>)}
                        </select>
                        <input name="contacts.maps" value={formState.contacts?.maps || ''} onChange={handleChange} placeholder="Link do Google Maps" className="p-2 border rounded col-span-2" />

                        <div className="col-span-2 text-sm font-bold text-gray-700 mt-3">Contatos</div>
                        <input
                            name="contacts.responsiblePhone"
                            value={formState.contacts?.responsiblePhone || ''}
                            onChange={(e) => setFormState(p => ({ ...p, contacts: { ...p.contacts, responsiblePhone: formatPhone(e.target.value) } }))}
                            placeholder="Telefone do responsável pelo anúncio"
                            inputMode="numeric"
                            className="p-2 border rounded"
                        />
                        <input
                            name="contacts.phone"
                            value={formState.contacts?.phone || ''}
                            onChange={(e) => setFormState(p => ({ ...p, contacts: { ...p.contacts, phone: formatPhone(e.target.value) } }))}
                            placeholder="Telefone do estabelecimento (fixo)"
                            inputMode="numeric"
                            className="p-2 border rounded"
                        />
                        <input
                            name="contacts.whatsapp"
                            value={formState.contacts?.whatsapp || ''}
                            onChange={(e) => setFormState(p => ({ ...p, contacts: { ...p.contacts, whatsapp: formatPhone(e.target.value) } }))}
                            placeholder="Celular com WhatsApp"
                            inputMode="numeric"
                            className="p-2 border rounded"
                        />
                        <input
                            name="contacts.email"
                            value={formState.contacts?.email || ''}
                            onChange={handleChange}
                            placeholder={isProfessionalPanelTier(formState.tier) ? "E-mail de acesso ao painel profissional (obrigatório)" : "E-mail principal (opcional)"}
                            className={`p-2 border rounded ${isProfessionalPanelTier(formState.tier) ? "border-purple-400 bg-purple-50/40" : ""}`}
                        />
                        <div className="col-span-2 rounded-lg border border-purple-200 bg-purple-50/50 p-2 text-xs text-purple-900">
                            <div className="font-bold mb-1">Acesso ao painel profissional</div>
                            <p>
                                Planos PRO, PREMIUM e MASTER precisam de e-mail de acesso. O profissional deve entrar com o mesmo e-mail para abrir o painel.
                            </p>
                            {professional?.id ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="px-2 py-1 rounded bg-white border border-purple-200 font-bold">Código: {panelAccessCode}</span>
                                    <span className="px-2 py-1 rounded bg-white border border-purple-200">Link: {panelAccessLink}</span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const inviteText = `Olá! Seu acesso profissional no Habitus foi liberado.\n\nAcesse: ${panelAccessLink}\nE-mail: ${formState.contacts?.email || "(seu e-mail cadastrado)"}\nCódigo de vínculo: ${panelAccessCode}\n\nEntre com este mesmo e-mail para abrir o painel profissional.`;
                                            try {
                                                await navigator.clipboard.writeText(inviteText);
                                                alert("Convite copiado.");
                                            } catch {
                                                alert("Não foi possível copiar agora.");
                                            }
                                        }}
                                        className="px-2 py-1 rounded bg-purple-600 text-white font-semibold"
                                    >
                                        Copiar convite
                                    </button>
                                </div>
                            ) : (
                                <p className="mt-1 text-[11px]">Salve primeiro para gerar código de vínculo e convite.</p>
                            )}
                        </div>

                        <div className="col-span-2 text-sm font-bold text-gray-700 mt-3">Especialidades</div>
                        <input name="registryLabel" value={formState.registryLabel || ''} onChange={handleChange} placeholder="Inscrição no conselho" className="p-2 border rounded" />
                        {formState.registryLabel?.toUpperCase().includes("CRM") && (
                            <input name="rqe" value={formState.rqe || ''} onChange={handleChange} placeholder="RQE (registro de especialista)" className="p-2 border rounded" />
                        )}
                        <div className="col-span-2">
                            <div className="text-xs font-semibold text-gray-500 mb-1">Especialidades (pode selecionar várias)</div>
                            <div className="grid grid-cols-2 gap-2">
                                {SPECIALTIES.map(s => (
                                    <label key={s} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                                        <input
                                            type="checkbox"
                                            checked={(formState.specialties || []).includes(s)}
                                            onChange={() => toggleSpecialty(s)}
                                        />
                                        <span className="truncate">{s}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="text-[11px] text-gray-500">Outras especialidades (separe por vírgula, máx. {MAX_OTHER_SPECIALTIES})</div>
                                <button
                                    type="button"
                                    onClick={() => setOtherSpecialtiesText("")}
                                    className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
                                >
                                    Limpar outras
                                </button>
                            </div>
                            <input
                                value={otherSpecialtiesText}
                                onChange={(e) => setOtherSpecialtiesText(e.target.value)}
                                placeholder="Ex: Clínica geral, Hospital"
                                className="mt-1 p-2 border rounded w-full text-xs"
                            />
                            {splitOtherSpecialties(otherSpecialtiesText).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {splitOtherSpecialties(otherSpecialtiesText).map((item) => (
                                        <span key={item} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] text-blue-800">
                                            {item}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = splitOtherSpecialties(otherSpecialtiesText).filter((s) => s !== item);
                                                    setOtherSpecialtiesText(next.join(", "));
                                                }}
                                                className="px-1 rounded bg-white border border-blue-200 text-blue-700 font-semibold"
                                            >
                                                Excluir
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="col-span-2 text-sm font-bold text-gray-700 mt-3">Anúncio</div>
                        <select name="uf" value={formState.uf || ''} onChange={handleChange} className="p-2 border rounded bg-white" required disabled={isManager}>
                            <option value="">Estado</option>
                            {states.map(s => <option key={s.sigla} value={s.sigla}>{s.nome}</option>)}
                        </select>
                        <select name="cityId" value={formState.cityId || ''} onChange={handleChange} className="p-2 border rounded bg-white" required disabled={!formState.uf}>
                            <option value="">Cidade</option>
                            {cities
                                .filter((c) => !isManager || !managerProfile || managerProfile.cityIds.includes(String(c.id)))
                                .map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
                        </select>
                        <select name="tier" value={formState.tier || 'verified'} onChange={handleChange} className="p-2 border rounded bg-white font-bold text-purple-700 col-span-2">
                            <option value="free">Free (limite de 30 vitalício)</option>
                            <option value="verified">Lista Vip</option>
                            <option value="top">Pro (Rodízio)</option>
                            <option value="exclusive">Premium (1 por Especialidade)</option>
                            <option value="master">Master (1 por Cidade)</option>
                        </select>
                        <div>
                            <div className="text-xs font-semibold text-gray-500 mb-1">Início do contrato</div>
                            <input name="validFrom" type="date" value={formState.validFrom || ''} onChange={handleChange} min={todayStr} className="p-2 border rounded w-full" required />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-gray-500 mb-1">Fim do contrato</div>
                            <input
                                name="validTo"
                                type="date"
                                value={formState.validTo || ''}
                                onChange={handleChange}
                                min={formState.tier === "master" ? (formState.validFrom || todayStr) : addMonthsToIsoDate(formState.validFrom || todayStr, 1)}
                                className="p-2 border rounded w-full"
                                required
                            />
                        </div>
                        <div className="col-span-2">
                            <div className="text-sm font-bold text-gray-700 mt-1">Pagamento</div>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <select
                                    name="paymentBilling"
                                    value={formState.paymentBilling || "monthly"}
                                    onChange={handleChange}
                                    className="p-2 border rounded bg-white"
                                >
                                    <option value="monthly">Mensal (recorrente ou avulso)</option>
                                    <option value="annual">Anual (à vista com desconto)</option>
                                </select>
                                <input
                                    name="paymentPrice"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={formState.paymentPrice ?? ""}
                                    readOnly
                                    placeholder="Valor do plano (R$)"
                                    className="p-2 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
                                />
                                <select
                                    name="paymentStatus"
                                    value={formState.paymentStatus || "pending"}
                                    onChange={handleChange}
                                    className="p-2 border rounded bg-white"
                                >
                                    <option value="pending">Status: pendente</option>
                                    <option value="paid">Status: pago</option>
                                    <option value="canceled">Status: cancelado</option>
                                </select>
                                <input
                                    name="paymentLink"
                                    value={formState.paymentLink || ""}
                                    onChange={handleChange}
                                    placeholder="Link de pagamento (opcional)"
                                    className="p-2 border rounded"
                                />
                                <button
                                    type="button"
                                    onClick={() => alert("Integração com Mercado Pago será adicionada depois.")}
                                    className="col-span-2 p-2 border rounded bg-purple-50 text-purple-800 text-xs font-semibold"
                                >
                                    Conectar Mercado Pago (em breve)
                                </button>
                                <div className="col-span-2 text-[11px] text-gray-500">
                                    Mensal pode ser recorrente ou avulso. Anual é à vista com desconto.
                                </div>
                            </div>
                        </div>
                        <div className="col-span-2 text-sm font-bold text-gray-700 mt-3">Materiais do anúncio</div>
                        <div className="col-span-2">
                              <div className="text-xs font-semibold text-gray-500 mb-1">Foto de perfil</div>
                              <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleProfilePhotoUpload(file);
                                      if (e.target) e.target.value = "";
                                  }}
                                  disabled={isPhotoUploading}
                                  className="text-xs"
                              />
                              <p className="text-[11px] text-gray-500 mt-1">
                                  {isPhotoUploading ? "Enviando foto..." : `Upload local até ${formatBytes(PROFILE_IMAGE_MAX_BYTES)}.`}
                              </p>
                              {formState.photoUrl && (
                                  <div className="mt-2">
                                      <img src={formState.photoUrl} alt="Foto de perfil" className="w-16 h-16 rounded-full object-cover border" />
                                  </div>
                              )}
                              {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                          </div>

                              {(formState.tier === "master" || formState.videoUrl) && (
                                  <div className="col-span-2">
                                      <div className="text-xs font-semibold text-gray-500 mb-1">
                                      Vídeo MASTER (MP4 até {formatBytes(MASTER_VIDEO_MAX_BYTES)}, máx. {MASTER_VIDEO_MAX_SECONDS}s)
                                      </div>
                                      <div className="flex flex-wrap items-center gap-3">
                                      <input
                                          type="file"
                                          accept="video/mp4"
                                          onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) handleMasterVideoUpload(file);
                                              if (e.target) e.target.value = '';
                                          }}
                                          className="text-xs"
                                      />
                                      {formState.videoUrl && (
                                          <div className="flex items-center gap-2">
                                              <video
                                                  src={formState.videoUrl}
                                                  className="w-28 h-16 rounded-md object-cover border"
                                                  muted
                                                  playsInline
                                                  loop
                                              />
                                              <button
                                                  type="button"
                                                  onClick={() => setFormState(p => ({ ...p, videoUrl: '' }))}
                                                  className="text-xs text-red-600"
                                              >
                                                  Remover
                                              </button>
                                          </div>
                                      )}
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">
                                      Dica: 1920x1080 (horizontal), até 15s, sem som.
                                  </p>
                                  {formState.videoUrl && (
                                      <div className="mt-3 rounded-xl overflow-hidden border border-purple-200 bg-black relative">
                                          <video
                                              src={formState.videoUrl}
                                              className="w-full h-40 sm:h-48 object-cover"
                                              autoPlay
                                              loop
                                              muted
                                              playsInline
                                          />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                                          <div className="absolute bottom-2 left-2 right-2 text-white space-y-2">
                                              <div className="flex items-center gap-2">
                                                  <img
                                                      src={formState.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(formState.name || "Master")}&background=random`}
                                                      alt="Preview"
                                                      className="w-8 h-8 rounded-full object-cover border border-white/40"
                                                  />
                                                  <div className="min-w-0">
                                                      <div className="text-xs font-bold truncate">{formState.name || "Nome do Master"}</div>
                                                      <div className="text-[10px] opacity-80 truncate">{(formState.specialties || []).join(", ") || formState.specialty || "Especialidades"}</div>
                                                  </div>
                                              </div>
                                              <div className="flex gap-2">
                                                  <div className="flex-1 text-center text-[10px] font-bold py-1 rounded-md bg-green-500/90">WhatsApp</div>
                                                  <div className="flex-1 text-center text-[10px] font-bold py-1 rounded-md bg-white/15">Localização</div>
                                                  <div className="flex-1 text-center text-[10px] font-bold py-1 rounded-md bg-purple-500">Instagram</div>
                                              </div>
                                          </div>
                                      </div>
                                  )}
                              </div>
                          )}
                    </div>
                    
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" checked={formState.verified} onChange={handleChange}/> Registro verificado ✅</label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" checked={formState.isActive} onChange={handleChange}/> Ativo 🟢</label>
                    </div>

                    {formState.tier === "exclusive" && (
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                value={keywordText}
                                onChange={(e) => setKeywordText(e.target.value)}
                                placeholder="Palavras-chave para o match (separe por virgula)"
                                className="p-2 border rounded col-span-2"
                            />
                        </div>
                    )}


                    <div className="text-[11px] text-gray-500 -mt-1">
                        Headline e bio curta são editadas pelo profissional no painel dele.
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-gray-500 mb-1">Destaques (separe por vírgula)</div>
                        <input
                            value={highlightsText}
                            onChange={(e) => setHighlightsText(e.target.value)}
                            placeholder="Ex: Atendimento infantil, Terapia ocupacional, Avaliação"
                            className="p-2 border rounded w-full"
                        />
                    </div>

                    <h4 className="font-bold text-sm border-b pb-1">Contato digital e links</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 grid grid-cols-2 gap-3">
                            <select name="bookingGreeting" value={formState.bookingGreeting || "dra"} onChange={handleChange} className="p-2 border rounded bg-white">
                                <option value="dra">Saudação: Dra.</option>
                                <option value="dr">Saudação: Dr.</option>
                                <option value="clinic">Saudação: Clínica/Equipe</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => setFormState((p) => ({
                                    ...p,
                                    bookingMessage: buildDefaultBookingMessage(p.name || "", (p.bookingGreeting || "dra") as "dr" | "dra" | "clinic"),
                                }))}
                                className="p-2 border rounded bg-gray-50 text-xs font-semibold"
                            >
                                Usar mensagem padrão
                            </button>
                        </div>
                        <textarea
                            name="bookingMessage"
                            value={formState.bookingMessage || ""}
                            onChange={handleChange}
                            placeholder="Mensagem automática do WhatsApp"
                            className="p-2 border rounded col-span-2 h-20"
                        />
                        <input name="contacts.instagram" value={formState.contacts?.instagram || ''} onChange={handleChange} placeholder="Instagram" className="p-2 border rounded" />
                        <input name="contacts.youtube" value={formState.contacts?.youtube || ''} onChange={handleChange} placeholder="YouTube" className="p-2 border rounded" />
                        <input name="contacts.websiteUrl" value={formState.contacts?.websiteUrl || ''} onChange={handleChange} placeholder="Site (opcional)" className="p-2 border rounded" />
                        <input name="videoUrl" value={formState.videoUrl || ''} onChange={handleChange} placeholder="URL de videos/playlist" className="p-2 border rounded" />
                    </div>
                </div>
                <div className="flex justify-between mt-6 pt-4 border-t">
                    {isEditing && !isManager && <button type="button" onClick={() => { if(window.confirm('Excluir?')) { deleteProfessional(professional!.id); onClose(); } }} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg">Excluir</button>}
                    <div className="flex-1 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={isUploading} className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold disabled:opacity-60">
                            {isUploading ? "Enviando..." : "Salvar"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default ManageSupportNetworkModal;



