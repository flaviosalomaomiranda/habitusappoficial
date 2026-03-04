import { Professional } from "../types";

export type ProfessionalPlanType = "FREE" | "VIP" | "PRO" | "PREMIUM" | "MASTER";

type PlanConfig = {
  monthlyNewPatientsLimit: number | null;
  lifetimePatientsLimit: number | null;
  voiceHours: number;
  aiEnabled: boolean;
};

export const PROFESSIONAL_PLAN_CONFIG: Record<ProfessionalPlanType, PlanConfig> = {
  FREE: { monthlyNewPatientsLimit: null, lifetimePatientsLimit: 30, voiceHours: 0, aiEnabled: false },
  VIP: { monthlyNewPatientsLimit: 100, lifetimePatientsLimit: null, voiceHours: 10, aiEnabled: true },
  PRO: { monthlyNewPatientsLimit: 300, lifetimePatientsLimit: null, voiceHours: 60, aiEnabled: true },
  PREMIUM: { monthlyNewPatientsLimit: 500, lifetimePatientsLimit: null, voiceHours: 100, aiEnabled: true },
  MASTER: { monthlyNewPatientsLimit: 500, lifetimePatientsLimit: null, voiceHours: 100, aiEnabled: true },
};

export type PlanBlockScope = "none" | "read_only" | "new_patient_only";

export type ProfessionalPlanStatus = {
  planType: ProfessionalPlanType;
  totalLifetimePatients: number;
  currentMonthPatients: number;
  transcriptionSecondsRemaining: number;
  canCreateNewPatients: boolean;
  canEditExistingRecords: boolean;
  canUseVoice: boolean;
  isBlocked: boolean;
  blockScope: PlanBlockScope;
};

const toSafeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const planFromTier = (tier?: string): ProfessionalPlanType => {
  const normalized = String(tier || "").trim().toLowerCase();
  if (normalized === "master") return "MASTER";
  if (normalized === "premium" || normalized === "exclusive") return "PREMIUM";
  if (normalized === "pro" || normalized === "top") return "PRO";
  if (normalized === "vip" || normalized === "verified") return "VIP";
  if (normalized === "free") return "FREE";
  return "FREE";
};

export const resolveProfessionalPlanType = (professional: Professional): ProfessionalPlanType => {
  const explicit = String((professional as any).plano || (professional as any).plan_type || (professional as any).planType || "")
    .trim()
    .toUpperCase();
  if (explicit === "FREE" || explicit === "VIP" || explicit === "PRO" || explicit === "PREMIUM" || explicit === "MASTER") {
    return explicit;
  }
  return planFromTier(professional.tier);
};

export const evaluateProfessionalPlanStatus = (professional: Professional): ProfessionalPlanStatus => {
  const planType = resolveProfessionalPlanType(professional);
  const config = PROFESSIONAL_PLAN_CONFIG[planType];
  const totalLifetimePatients = toSafeNumber(
    (professional as any).pacientes_vinculados_total ??
      (professional as any).total_pacientes_vinculados ??
      (professional as any).totalPatientsLinked,
    0
  );
  const currentMonthPatients = toSafeNumber(
    (professional as any).pacientes_vinculados_mes ??
      (professional as any).pacientes_mes_atual ??
      (professional as any).patientsCurrentMonth,
    0
  );
  const transcriptionSecondsRemaining = toSafeNumber(
    (professional as any).segundos_transcricao_restantes ??
      (professional as any).horas_transcricao_restantes ??
      (professional as any).transcriptionSecondsRemaining,
    config.voiceHours * 3600
  );

  const reachedLifetimeLimit =
    typeof config.lifetimePatientsLimit === "number" && totalLifetimePatients >= config.lifetimePatientsLimit;
  const reachedMonthlyLimit =
    typeof config.monthlyNewPatientsLimit === "number" && currentMonthPatients >= config.monthlyNewPatientsLimit;

  const blockScope: PlanBlockScope = reachedLifetimeLimit ? "read_only" : reachedMonthlyLimit ? "new_patient_only" : "none";
  const isBlocked = blockScope !== "none";

  return {
    planType,
    totalLifetimePatients,
    currentMonthPatients,
    transcriptionSecondsRemaining,
    canCreateNewPatients: !isBlocked,
    canEditExistingRecords: blockScope !== "read_only",
    canUseVoice: config.aiEnabled && transcriptionSecondsRemaining > 0,
    isBlocked,
    blockScope,
  };
};
