import React, { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { Child, Habit, HabitFlexPeriod, HabitScheduleMode, Professional, RewardType } from "../types";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../src/lib/firebase";
import { evaluateProfessionalPlanStatus, PROFESSIONAL_PLAN_CONFIG } from "../utils/professionalPlan";
import { buildPatientUniqueCode, buildRecordSecurityHash } from "../utils/recordSecurity";

interface ProfessionalDashboardProps {
  professional: Professional;
}

const getPlanLabel = (tier?: string) => {
  if (tier === "master") return "MASTER";
  if (tier === "exclusive") return "PREMIUM";
  if (tier === "top" || tier === "pro") return "PRO";
  return "LISTA VIP";
};

type LinkRequest = {
  id: string;
  familyId?: string;
  userUid?: string | null;
  professionalId: string;
  professionalName?: string;
  patientCpfDigits?: string | null;
  requestedByEmail?: string | null;
  requesterFullName?: string | null;
  requesterCpf?: string | null;
  verificationCode?: string | null;
  codeExpiresAtMs?: number | null;
  codeGeneratedAtMs?: number | null;
  consentBlocks?: { personal?: boolean; profile?: boolean; health?: boolean } | null;
  requestedConsentBlocks?: { personal?: boolean; profile?: boolean; health?: boolean } | null;
  sharedChildIds?: string[];
  sharedChildren?: Array<{ id: string; name: string }>;
  source?: "professional_cpf";
  status: "pending_user" | "pending_code" | "approved" | "rejected" | "expired";
  createdAtMs?: number | null;
  decidedAtMs?: number | null;
};

type PatientSummary = {
  linkDocId: string;
  familyId: string;
  childId: string;
  patientId?: string;
  childName: string;
  patientCpfDigits?: string;
  whatsapp?: string;
  email?: string;
  hasHabitusAccount?: boolean;
  adherencePct: number;
  status: "compliant" | "risk" | "inactive";
  lastActivityDate: string | null;
  source: "child" | "family" | "out";
};

type PatientMeta = {
  ageLabel: string;
};

type AttendanceProtocol = "odontopediatria" | "clinica_geral";
type AttendanceStep = "idle" | "conference" | "protocol" | "anamnese";

type AttendanceDraft = {
  pacienteId: string;
  familyId: string;
  childId: string;
  nome: string;
  apelido: string;
  sexo: string;
  dataNascimento: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressUf: string;
  addressZip: string;
  telefonePrincipal: string;
  whatsapp: string;
};

type AnamnesisQuestionTimelineEntry = {
  question: string;
  index: number;
  atMs: number;
};

type AnamnesisStructuredSummaryTimelineItem = {
  eventoPergunta: string;
  respostaResumo: string;
};

type AnamnesisStructuredSummaryJson = {
  queixaPrincipal: string;
  historicoSaude: {
    doencasPrevias: string;
    usoMedicamentos: string;
    alergias: string;
    historicoFamiliarRelevante: string;
    condicoesSistemicasRelevantes: string;
  };
  habitosHigiene: {
    escovacao: string;
    usoFioDental: string;
    enxaguanteBucal: string;
    outrosHabitosRelevantes: string;
  };
  linhaDoTempo: AnamnesisStructuredSummaryTimelineItem[];
  pendenciasProximaConsulta: string[];
  conclusao: string;
};

type OrientationTemplate = {
  id: string;
  name: string;
  goal: string;
  tasks: string[];
  durationDays: number;
  scheduleMode: HabitScheduleMode;
  scheduleTime?: string;
  schedulePeriod?: HabitFlexPeriod;
  reminderEnabled?: boolean;
};

type LinkedScope = {
  linkDocId: string;
  familyId: string;
  childIds: string[];
  linkedChildren: Array<{ id: string; name: string }>;
};

type LinkEvent = {
  id: string;
  type: "linked" | "unlinked";
  familyId: string;
  childId?: string | null;
  childName?: string | null;
  requesterFullName?: string | null;
  requestedByEmail?: string | null;
  createdAtMs: number;
};

type ProfessionalAdStats = {
  impressions: number;
  contactClicks: number;
  whatsappClicks: number;
  locationClicks: number;
  impressions7d: number;
  contacts7d: number;
};

type ClinicalRecordStatus = "active" | "discharged" | "abandoned" | "transferred" | "deceased";
type ClinicalVisitType = "first" | "followup";

type ClinicalAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  uploadedAtIso: string;
  storagePath: string;
};

type DashboardPrimaryView = "pacientes" | "agenda" | "atendimento";
type PatientWorkspaceTab = "sobre" | "anamnese" | "documentos";
type AgendaViewMode = "day" | "week" | "month";

type ProfessionalAppointment = {
  id: string;
  professionalId: string;
  familyId: string;
  childId: string;
  childName: string;
  startsAtIso: string;
  durationMin: number;
  notes: string;
  tags: string[];
  patientStatus: "pending" | "confirmed" | "cancelled";
  syncToPatientCard: boolean;
  cancelledByProfessional?: boolean;
  cancelledByPatient?: boolean;
};

type MyPatientItem = {
  key: string;
  familyId: string;
  childId: string;
  patientId?: string;
  childName: string;
  patientCpfDigits?: string;
  linkDocId: string;
  isActive: boolean;
  ageLabel: string;
  firstLinkOwner: string;
  source: "child" | "family" | "out";
  whatsapp?: string;
  email?: string;
  hasHabitusAccount?: boolean;
};

type OutPatientDraft = {
  cpf: string;
  nome: string;
  dataNascimento: string;
  sexo: string;
  apelido: string;
  responsavelLegalNome: string;
  responsavelLegalTelefone: string;
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressUf: string;
  telefonePrincipal: string;
  whatsapp: string;
  email: string;
};

type PatientTimelineEntry = {
  id: string;
  atMs: number;
  title: string;
  description: string;
};

type ClinicalRecordDraft = {
  socialName: string;
  genderIdentity: string;
  biologicalSex: string;
  cpf: string;
  rg: string;
  cns: string;
  insurancePlan: string;
  occupation: string;
  education: string;
  maritalStatus: string;
  religion: string;
  fullAddress: string;
  phone: string;
  email: string;
  legalGuardianName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  allergies: string;
  bloodTypeRh: string;
  criticalConditions: string;
  chiefComplaint: string;
  currentIllnessHistory: string;
  pastMedicalHistory: string;
  familyHistory: string;
  gynecoObsHistory: string;
  lifestyleDiet: string;
  lifestyleSleep: string;
  lifestylePhysicalActivity: string;
  bowelUrinaryHabits: string;
  smokingAlcoholSubstances: string;
  medicationsSupplements: string;
  bloodPressure: string;
  heartRate: string;
  respiratoryRate: string;
  temperature: string;
  oxygenSaturation: string;
  capillaryGlycemia: string;
  weight: string;
  height: string;
  bmi: string;
  waistCircumference: string;
  professionSpecificAssessment: string;
  diagnosisCodes: string;
  functionalClassification: string;
  nursingDiagnosis: string;
  diagnosticImpression: string;
  treatmentGoals: string;
  prescriptionsPlan: string;
  proceduresPerformed: string;
  referrals: string;
  homeGuidance: string;
  soapSubjective: string;
  soapObjective: string;
  soapAssessment: string;
  soapPlan: string;
  legalTerms: string;
  attachments: ClinicalAttachment[];
  attachmentsNotes: string;
  visitType: ClinicalVisitType;
  patientStatus: ClinicalRecordStatus;
  closureDate: string;
  dischargeSummary: string;
};

const createEmptyClinicalRecordDraft = (): ClinicalRecordDraft => ({
  socialName: "",
  genderIdentity: "",
  biologicalSex: "",
  cpf: "",
  rg: "",
  cns: "",
  insurancePlan: "",
  occupation: "",
  education: "",
  maritalStatus: "",
  religion: "",
  fullAddress: "",
  phone: "",
  email: "",
  legalGuardianName: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  allergies: "",
  bloodTypeRh: "",
  criticalConditions: "",
  chiefComplaint: "",
  currentIllnessHistory: "",
  pastMedicalHistory: "",
  familyHistory: "",
  gynecoObsHistory: "",
  lifestyleDiet: "",
  lifestyleSleep: "",
  lifestylePhysicalActivity: "",
  bowelUrinaryHabits: "",
  smokingAlcoholSubstances: "",
  medicationsSupplements: "",
  bloodPressure: "",
  heartRate: "",
  respiratoryRate: "",
  temperature: "",
  oxygenSaturation: "",
  capillaryGlycemia: "",
  weight: "",
  height: "",
  bmi: "",
  waistCircumference: "",
  professionSpecificAssessment: "",
  diagnosisCodes: "",
  functionalClassification: "",
  nursingDiagnosis: "",
  diagnosticImpression: "",
  treatmentGoals: "",
  prescriptionsPlan: "",
  proceduresPerformed: "",
  referrals: "",
  homeGuidance: "",
  soapSubjective: "",
  soapObjective: "",
  soapAssessment: "",
  soapPlan: "",
  legalTerms: "",
  attachments: [],
  attachmentsNotes: "",
  visitType: "followup",
  patientStatus: "active",
  closureDate: "",
  dischargeSummary: "",
});

const PROFESSIONAL_BIO_MAX = 140;
const PROFESSIONAL_HEADLINE_MAX = 70;
const CLINICAL_ATTACHMENT_MAX_BYTES = 10_000_000;
const ANAMNESIS_FIXED_FINAL_QUESTION = "Deseja perguntar ou relatar algo mais?";
const DEFAULT_ODONTO_QUESTIONS = [
  "Qual é a principal queixa da criança hoje?",
  "Há histórico médico relevante, alergias ou medicações em uso?",
  "Como está a rotina de higiene bucal em casa?",
];

const APPOINTMENT_TAG_OPTIONS = [
  "1ª Consulta",
  "Consulta inicial",
  "Consulta de retorno",
  "Retorno",
  "Consulta Preventiva",
  "Consulta Prevenção",
  "Levar exames solicitados",
];

const createEmptyOutPatientDraft = (): OutPatientDraft => ({
  cpf: "",
  nome: "",
  dataNascimento: "",
  sexo: "nao_informado",
  apelido: "",
  responsavelLegalNome: "",
  responsavelLegalTelefone: "",
  addressZip: "",
  addressStreet: "",
  addressNumber: "",
  addressComplement: "",
  addressNeighborhood: "",
  addressCity: "",
  addressUf: "",
  telefonePrincipal: "",
  whatsapp: "",
  email: "",
});

const formatCep = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const normalizeAnamnesisSummaryJsonForStorage = (value: unknown): AnamnesisStructuredSummaryJson | null => {
  if (!value || typeof value !== "object") return null;
  const safe = value as Record<string, any>;
  const historicoSaude = safe.historicoSaude && typeof safe.historicoSaude === "object" ? safe.historicoSaude : {};
  const habitosHigiene = safe.habitosHigiene && typeof safe.habitosHigiene === "object" ? safe.habitosHigiene : {};
  const asText = (item: unknown) => String(item || "").trim();
  const timeline = Array.isArray(safe.linhaDoTempo)
    ? safe.linhaDoTempo
        .map((item: any) => ({
          eventoPergunta: asText(item?.eventoPergunta),
          respostaResumo: asText(item?.respostaResumo),
        }))
        .filter((item: AnamnesisStructuredSummaryTimelineItem) => item.eventoPergunta || item.respostaResumo)
    : [];
  const pendencias = Array.isArray(safe.pendenciasProximaConsulta)
    ? safe.pendenciasProximaConsulta.map((item: unknown) => asText(item)).filter(Boolean)
    : [];

  return {
    queixaPrincipal: asText(safe.queixaPrincipal),
    historicoSaude: {
      doencasPrevias: asText(historicoSaude.doencasPrevias),
      usoMedicamentos: asText(historicoSaude.usoMedicamentos),
      alergias: asText(historicoSaude.alergias),
      historicoFamiliarRelevante: asText(historicoSaude.historicoFamiliarRelevante),
      condicoesSistemicasRelevantes: asText(historicoSaude.condicoesSistemicasRelevantes),
    },
    habitosHigiene: {
      escovacao: asText(habitosHigiene.escovacao),
      usoFioDental: asText(habitosHigiene.usoFioDental),
      enxaguanteBucal: asText(habitosHigiene.enxaguanteBucal),
      outrosHabitosRelevantes: asText(habitosHigiene.outrosHabitosRelevantes),
    },
    linhaDoTempo: timeline,
    pendenciasProximaConsulta: pendencias,
    conclusao: asText(safe.conclusao),
  };
};

const buildStablePatientSeed = (familyId: string, childId: string) => {
  return `${String(familyId || "").trim()}::${String(childId || "").trim()}`;
};

const formatFileBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getLastSevenDays = () => {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
};

const toDateLabel = (isoDate: string | null) => {
  if (!isoDate) return "Sem atividade";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
};

const addDaysIso = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + Math.max(0, days));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const startOfWeekDate = (base = new Date()) => {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const toIsoDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDayHeader = (date: Date) => {
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

const formatIsoDateTime = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const timestampToMs = (value: any): number | null => {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return Number(value.toMillis());
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeAppointmentTags = (values: string[]) => {
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
};

const maskCpf = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 2) return "CPF não informado";
  const suffix = digits.slice(-2);
  return `***.***.***-${suffix}`;
};

const formatCpf = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const parseBirthDateToAge = (birthDate?: string | null) => {
  const raw = String(birthDate || "").trim();
  if (!raw) return null;
  let date = new Date(raw);
  if (raw.includes("/")) {
    const [d, m, y] = raw.split("/");
    if (d && m && y) date = new Date(Number(y), Number(m) - 1, Number(d));
  }
  if (!Number.isFinite(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const extractPrincipalWhatsapp = (profile: any) => {
  const candidates = [
    profile?.phoneDigits,
    profile?.phone,
    profile?.whatsappDigits,
    profile?.whatsapp,
  ];
  const digits = String(candidates.find((value) => String(value || "").replace(/\D/g, "").length >= 10) || "").replace(/\D/g, "");
  return digits;
};

const ProfessionalDashboard: React.FC<ProfessionalDashboardProps> = ({ professional }) => {
  const [linkRequests, setLinkRequests] = useState<LinkRequest[]>([]);
  const [linkedScopes, setLinkedScopes] = useState<LinkedScope[]>([]);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [templates, setTemplates] = useState<OrientationTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateGoal, setTemplateGoal] = useState("");
  const [templateTasksText, setTemplateTasksText] = useState("");
  const [templateDurationDays, setTemplateDurationDays] = useState(14);
  const [templateScheduleMode, setTemplateScheduleMode] = useState<HabitScheduleMode>("flex");
  const [templateScheduleTime, setTemplateScheduleTime] = useState("07:30");
  const [templateSchedulePeriod, setTemplateSchedulePeriod] = useState<HabitFlexPeriod>("morning");
  const [templateReminderEnabled, setTemplateReminderEnabled] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isKpiPanelOpen, setIsKpiPanelOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedPatientKey, setSelectedPatientKey] = useState("");
  const [isSendingOrientation, setIsSendingOrientation] = useState(false);
  const [linkEvents, setLinkEvents] = useState<LinkEvent[]>([]);
  const [adStats, setAdStats] = useState<ProfessionalAdStats>({
    impressions: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    locationClicks: 0,
    impressions7d: 0,
    contacts7d: 0,
  });
  const [cpfRequestInput, setCpfRequestInput] = useState("");
  const [outPatientDraft, setOutPatientDraft] = useState<OutPatientDraft>(createEmptyOutPatientDraft());
  const [showOutPatientForm, setShowOutPatientForm] = useState(false);
  const [isSavingOutPatient, setIsSavingOutPatient] = useState(false);
  const [isLookingUpOutPatientCep, setIsLookingUpOutPatientCep] = useState(false);
  const [requestPersonalBlock, setRequestPersonalBlock] = useState(true);
  const [requestProfileBlock, setRequestProfileBlock] = useState(true);
  const [requestHealthBlock, setRequestHealthBlock] = useState(true);
  const [requestCodeByRequestId, setRequestCodeByRequestId] = useState<Record<string, string>>({});
  const [isCreatingCpfRequest, setIsCreatingCpfRequest] = useState(false);
  const [activePatientSearch, setActivePatientSearch] = useState("");
  const [myPatientsSearch, setMyPatientsSearch] = useState("");
  const [myPatientsFilter, setMyPatientsFilter] = useState<"none" | "active" | "inactive" | "all" | "out">("none");
  const [selectedMyPatientKey, setSelectedMyPatientKey] = useState<string | null>(null);
  const [selectedMyPatientPanel, setSelectedMyPatientPanel] = useState<"summary" | "edit" | "log" | null>(null);
  const [patientTimelineByKey, setPatientTimelineByKey] = useState<Record<string, PatientTimelineEntry[]>>({});
  const [familyPrimaryNameById, setFamilyPrimaryNameById] = useState<Record<string, string>>({});
  const [isLoadingPatientTimeline, setIsLoadingPatientTimeline] = useState(false);
  const [myPatientEditDraft, setMyPatientEditDraft] = useState<AttendanceDraft | null>(null);
  const [isLoadingMyPatientEdit, setIsLoadingMyPatientEdit] = useState(false);
  const [isSavingMyPatientEdit, setIsSavingMyPatientEdit] = useState(false);
  const [headlineDraft, setHeadlineDraft] = useState(professional.headline || "");
  const [bioDraft, setBioDraft] = useState(professional.bio || "");
  const [highlightsDraft, setHighlightsDraft] = useState((professional.highlights || []).join(", "));
  const [keywordDraft, setKeywordDraft] = useState((professional.spotlightKeywords || []).join(", "));
  const [websiteDraft, setWebsiteDraft] = useState(professional.contacts?.websiteUrl || "");
  const [instagramDraft, setInstagramDraft] = useState(professional.contacts?.instagram || "");
  const [youtubeDraft, setYoutubeDraft] = useState(professional.contacts?.youtube || "");
  const [videoUrlDraft, setVideoUrlDraft] = useState(professional.videoUrl || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isClinicalPanelOpen, setIsClinicalPanelOpen] = useState(true);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [recordPatientKey, setRecordPatientKey] = useState("");
  const [attendanceStep, setAttendanceStep] = useState<AttendanceStep>("idle");
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraft | null>(null);
  const [attendanceProtocol, setAttendanceProtocol] = useState<AttendanceProtocol | null>(null);
  const [activeAttendancePatientId, setActiveAttendancePatientId] = useState("");
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [isEditingAttendance, setIsEditingAttendance] = useState(false);
  const [attendanceSharedCount, setAttendanceSharedCount] = useState(0);
  const [odontoQuestionsDraft, setOdontoQuestionsDraft] = useState<string[]>(DEFAULT_ODONTO_QUESTIONS);
  const [isQuestionConfigOpen, setIsQuestionConfigOpen] = useState(false);
  const [isSavingQuestionConfig, setIsSavingQuestionConfig] = useState(false);
  const [manualAnswersByQuestion, setManualAnswersByQuestion] = useState<Record<string, string>>({});
  const [anamnesisInputMode, setAnamnesisInputMode] = useState<"voice" | "manual">("manual");
  const [isRecordingAnamnesis, setIsRecordingAnamnesis] = useState(false);
  const [currentAnamnesisQuestionIndex, setCurrentAnamnesisQuestionIndex] = useState(0);
  const [anamnesisQuestionTimeline, setAnamnesisQuestionTimeline] = useState<AnamnesisQuestionTimelineEntry[]>([]);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>(Array.from({ length: 18 }, () => 6));
  const [isProcessingAnamnesis, setIsProcessingAnamnesis] = useState(false);
  const [anamnesisTranscriptRaw, setAnamnesisTranscriptRaw] = useState("");
  const [anamnesisStructuredSummary, setAnamnesisStructuredSummary] = useState("");
  const [anamnesisStructuredSummaryJson, setAnamnesisStructuredSummaryJson] = useState<AnamnesisStructuredSummaryJson | null>(null);
  const [editableAnamnesisSummary, setEditableAnamnesisSummary] = useState("");
  const [isSavingAnamnesisSummary, setIsSavingAnamnesisSummary] = useState(false);
  const [showExamPrompt, setShowExamPrompt] = useState(false);
  const [patientMetaByKey, setPatientMetaByKey] = useState<Record<string, PatientMeta>>({});
  const [primaryView, setPrimaryView] = useState<DashboardPrimaryView>("pacientes");
  const [patientWorkspaceTab, setPatientWorkspaceTab] = useState<PatientWorkspaceTab>("sobre");
  const [agendaViewMode, setAgendaViewMode] = useState<AgendaViewMode>("week");
  const [agendaReferenceDate, setAgendaReferenceDate] = useState(() => toIsoDate(new Date()));
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<ProfessionalAppointment[]>([]);
  const [appointmentPatientKey, setAppointmentPatientKey] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentDurationMin, setAppointmentDurationMin] = useState(30);
  const [appointmentPrimaryTag, setAppointmentPrimaryTag] = useState(APPOINTMENT_TAG_OPTIONS[0]);
  const [appointmentExtraTags, setAppointmentExtraTags] = useState<string[]>([]);
  const [appointmentCustomTags, setAppointmentCustomTags] = useState("");
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const [recordDraft, setRecordDraft] = useState<ClinicalRecordDraft>(createEmptyClinicalRecordDraft());
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [showFullRecordInFollowup, setShowFullRecordInFollowup] = useState(false);
  const [recordLoadedAtMs, setRecordLoadedAtMs] = useState<number | null>(null);
  const [recordSectionsOpen, setRecordSectionsOpen] = useState({
    identification: false,
    history: false,
    objective: false,
    diagnosisPlan: false,
    legal: false,
    closure: false,
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformRafRef = useRef<number | null>(null);
  const keywordCount = useMemo(
    () =>
      keywordDraft
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean).length,
    [keywordDraft]
  );
  const odontoQuestions = useMemo(() => {
    const cleaned = odontoQuestionsDraft
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((item, idx, arr) => arr.indexOf(item) === idx)
      .filter((item) => item !== ANAMNESIS_FIXED_FINAL_QUESTION);
    return [...cleaned, ANAMNESIS_FIXED_FINAL_QUESTION];
  }, [odontoQuestionsDraft]);
  const activeAnamnesisQuestion = odontoQuestions[currentAnamnesisQuestionIndex] || odontoQuestions[0] || "";
  const isAnamnesisInOdontoMode = attendanceStep === "anamnese" && attendanceProtocol === "odontopediatria";

  const notifyFamily = async (familyId: string, payload: { title: string; message: string; type: string; metadata?: Record<string, any> }) => {
    await addDoc(collection(db, "userNotifications"), {
      familyId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      metadata: payload.metadata || {},
      createdAt: serverTimestamp(),
      readAt: null,
    });
  };

  useEffect(() => {
    setHeadlineDraft(professional.headline || "");
    setBioDraft(professional.bio || "");
    setHighlightsDraft((professional.highlights || []).join(", "));
    setKeywordDraft((professional.spotlightKeywords || []).join(", "));
    setWebsiteDraft(professional.contacts?.websiteUrl || "");
    setInstagramDraft(professional.contacts?.instagram || "");
    setYoutubeDraft(professional.contacts?.youtube || "");
    setVideoUrlDraft(professional.videoUrl || "");
  }, [professional]);

  useEffect(() => {
    const loadQuestionConfig = async () => {
      try {
        const configId = `${professional.id}__odontopediatria`;
        const snap = await getDoc(doc(db, "professionalAnamnesisConfigs", configId));
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const questions = Array.isArray(data?.questions)
          ? data.questions.map((q: any) => String(q || "").trim()).filter(Boolean)
          : [];
        if (questions.length > 0) {
          setOdontoQuestionsDraft(questions.filter((q) => q !== ANAMNESIS_FIXED_FINAL_QUESTION));
        }
      } catch (err) {
        console.error("Falha ao carregar configuração de perguntas da anamnese:", err);
      }
    };
    void loadQuestionConfig();
  }, [professional.id]);

  useEffect(() => {
    setManualAnswersByQuestion((prev) => {
      const next: Record<string, string> = {};
      odontoQuestions.forEach((question) => {
        next[question] = prev[question] || "";
      });
      return next;
    });
  }, [odontoQuestions]);

  const handleSaveQuestionConfig = async () => {
    setIsSavingQuestionConfig(true);
    try {
      const normalized = odontoQuestionsDraft
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item, idx, arr) => arr.indexOf(item) === idx)
        .filter((item) => item !== ANAMNESIS_FIXED_FINAL_QUESTION);
      await setDoc(
        doc(db, "professionalAnamnesisConfigs", `${professional.id}__odontopediatria`),
        {
          professionalId: professional.id,
          protocol: "odontopediatria",
          questions: normalized,
          fixedFinalQuestion: ANAMNESIS_FIXED_FINAL_QUESTION,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setOdontoQuestionsDraft(normalized);
      setIsQuestionConfigOpen(false);
    } catch (err) {
      console.error("Falha ao salvar configuração da anamnese:", err);
      alert("Não foi possível salvar as perguntas agora.");
    } finally {
      setIsSavingQuestionConfig(false);
    }
  };

  const resetAnamnesisRuntime = () => {
    setCurrentAnamnesisQuestionIndex(0);
    setAnamnesisQuestionTimeline([]);
    setAudioDurationSec(0);
    setWaveformLevels(Array.from({ length: 18 }, () => 6));
    setAnamnesisTranscriptRaw("");
    setAnamnesisStructuredSummary("");
    setAnamnesisStructuredSummaryJson(null);
    setShowExamPrompt(false);
  };

  const stopWaveformLoop = () => {
    if (waveformRafRef.current !== null) {
      cancelAnimationFrame(waveformRafRef.current);
      waveformRafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }
  };

  const stopRecordingTracks = () => {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  };

  const cleanupAnamnesisRecording = () => {
    stopWaveformLoop();
    stopRecordingTracks();
    mediaRecorderRef.current = null;
    recordingStartedAtRef.current = null;
    setIsRecordingAnamnesis(false);
  };

  useEffect(() => {
    return () => {
      cleanupAnamnesisRecording();
    };
  }, []);

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const buildManualTranscript = () => {
    return odontoQuestions
      .map((question) => {
        const answer = String(manualAnswersByQuestion[question] || "").trim();
        return `Pergunta: ${question}\nResposta: ${answer || "(sem resposta)"}`;
      })
      .join("\n\n");
  };

  const startWaveformLoop = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const run = () => {
      const activeAnalyser = analyserRef.current;
      if (!activeAnalyser) return;
      activeAnalyser.getByteFrequencyData(dataArray);
      const chunkSize = Math.max(1, Math.floor(dataArray.length / 18));
      const levels = Array.from({ length: 18 }, (_, idx) => {
        const start = idx * chunkSize;
        const end = Math.min(dataArray.length, start + chunkSize);
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += dataArray[i];
        const avg = end > start ? sum / (end - start) : 0;
        return Math.max(4, Math.min(42, Math.round((avg / 255) * 42)));
      });
      setWaveformLevels(levels);
      waveformRafRef.current = requestAnimationFrame(run);
    };
    waveformRafRef.current = requestAnimationFrame(run);
  };

  const handleStartVoiceAnamnesis = async () => {
    if (!isAnamnesisInOdontoMode) {
      alert("Selecione o protocolo Odontopediatria para iniciar a anamnese por voz.");
      return;
    }
    if (!canUseVoiceAnamnesis) {
      alert("Recurso de voz indisponível para este plano/saldo.");
      return;
    }
    if (!activeAttendancePatientId) {
      alert("Paciente não definido para o atendimento.");
      return;
    }
    try {
      resetAnamnesisRuntime();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      startWaveformLoop(stream);
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setAnamnesisQuestionTimeline([{ question: odontoQuestions[0], index: 0, atMs: Date.now() }]);
      setIsRecordingAnamnesis(true);
    } catch (err) {
      console.error("Falha ao iniciar gravação da anamnese:", err);
      cleanupAnamnesisRecording();
      alert("Não foi possível iniciar a gravação. Verifique a permissão do microfone.");
    }
  };

  const handleNextAnamnesisQuestion = () => {
    if (!isRecordingAnamnesis) return;
    setCurrentAnamnesisQuestionIndex((prev) => {
      const next = Math.min(prev + 1, Math.max(0, odontoQuestions.length - 1));
      if (next !== prev) {
        setAnamnesisQuestionTimeline((timeline) => [...timeline, { question: odontoQuestions[next], index: next, atMs: Date.now() }]);
      }
      return next;
    });
  };

  const processAnamnesisResult = async (audioBlob: Blob | null) => {
    if (!attendanceDraft || !selectedRecordPatient) return;
    setIsProcessingAnamnesis(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();
      if (!projectId) {
        throw new Error("VITE_FIREBASE_PROJECT_ID não configurado.");
      }
      const endpoint = `https://us-central1-${projectId}.cloudfunctions.net/processAnamnesisAudio`;
      const audioBase64 = audioBlob ? await blobToBase64(audioBlob) : "";
      const manualTranscript = buildManualTranscript();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          professionalId: professional.id,
          patientId: activeAttendancePatientId,
          protocol: "odontopediatria",
          questions: odontoQuestions,
          questionTimeline: anamnesisQuestionTimeline,
          audioBase64,
          mimeType: audioBlob?.type || "audio/webm",
          audioDurationSec,
          manualTranscript,
          manualAnswers: manualAnswersByQuestion,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || `Falha ao processar anamnese (${response.status}).`));
      }
      const transcript = String(data?.transcript || manualTranscript || "").trim();
      const summary = String(data?.structuredSummary || "").trim();
      const summaryJson = normalizeAnamnesisSummaryJsonForStorage((data as any)?.structuredSummaryJson);
      setAnamnesisTranscriptRaw(transcript);
      setAnamnesisStructuredSummary(summary);
      setAnamnesisStructuredSummaryJson(summaryJson);
      setEditableAnamnesisSummary(summary);
      await setDoc(
        doc(db, "professionalClinicalRecords", `${professional.id}__${selectedRecordPatient.familyId}__${selectedRecordPatient.childId}`),
        {
          professionalId: professional.id,
          professionalName: professional.name,
          familyId: selectedRecordPatient.familyId,
          childId: selectedRecordPatient.childId,
          childName: selectedRecordPatient.childName,
          anamnese_odontopediatria: {
            patient_id: activeAttendancePatientId,
            questions: odontoQuestions,
            questionTimeline: anamnesisQuestionTimeline,
            transcript_raw: transcript,
            resumo_estruturado: summary,
            resumo_estruturado_json: summaryJson,
            generatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (audioDurationSec > 0 && canUseVoiceAnamnesis) {
        await setDoc(
          doc(db, "supportNetwork", professional.id),
          {
            segundos_transcricao_restantes: increment(-Math.max(1, Math.round(audioDurationSec))),
            horas_transcricao_restantes: increment(-Math.max(1, Math.round(audioDurationSec))),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      setShowExamPrompt(true);
    } catch (err) {
      console.error("Falha ao processar anamnese por voz:", err);
      alert(`Não foi possível processar a anamnese: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    } finally {
      setIsProcessingAnamnesis(false);
    }
  };

  const handleFinalizeAnamnesis = async () => {
    try {
      if (isRecordingAnamnesis && mediaRecorderRef.current) {
        const recorder = mediaRecorderRef.current;
        const blobPromise = new Promise<Blob>((resolve) => {
          recorder.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
            resolve(blob);
          };
        });
        recorder.stop();
        const elapsedSec = recordingStartedAtRef.current ? (Date.now() - recordingStartedAtRef.current) / 1000 : 0;
        setAudioDurationSec(Math.max(0, Math.round(elapsedSec)));
        cleanupAnamnesisRecording();
        const blob = await blobPromise;
        await processAnamnesisResult(blob);
        return;
      }
      await processAnamnesisResult(null);
    } catch (err) {
      console.error("Falha ao finalizar anamnese:", err);
      alert("Não foi possível finalizar a anamnese agora.");
    }
  };

  const handleSaveAnamnesisSummary = async () => {
    if (!attendanceDraft || !selectedRecordPatient) {
      alert("Selecione um paciente para salvar a anamnese.");
      return;
    }
    const summaryText = String(editableAnamnesisSummary || anamnesisStructuredSummary || "").trim();
    if (!summaryText) {
      alert("Resumo da anamnese vazio.");
      return;
    }
    setIsSavingAnamnesisSummary(true);
    try {
      const signedAt = new Date();
      const signedAtLabel = signedAt.toLocaleString("pt-BR");
      const signedSummary = `${summaryText}\n\n---\nProfissional: ${professional.name}\nData/Hora: ${signedAtLabel}`;
      await setDoc(
        doc(db, "professionalClinicalRecords", `${professional.id}__${selectedRecordPatient.familyId}__${selectedRecordPatient.childId}`),
        {
          professionalId: professional.id,
          professionalName: professional.name,
          familyId: selectedRecordPatient.familyId,
          childId: selectedRecordPatient.childId,
          childName: selectedRecordPatient.childName,
          anamnese_odontopediatria: {
            patient_id: activeAttendancePatientId,
            questions: odontoQuestions,
            questionTimeline: anamnesisQuestionTimeline,
            transcript_raw: anamnesisTranscriptRaw,
            resumo_estruturado: signedSummary,
            resumo_estruturado_json: anamnesisStructuredSummaryJson,
            summarySignedAtIso: signedAt.toISOString(),
            summarySignedBy: professional.name,
            generatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setAnamnesisStructuredSummary(signedSummary);
      setEditableAnamnesisSummary(signedSummary);
      alert("Anamnese salva com assinatura profissional.");
    } catch (err) {
      console.error("Falha ao salvar resumo da anamnese:", err);
      alert("Não foi possível salvar a anamnese.");
    } finally {
      setIsSavingAnamnesisSummary(false);
    }
  };

  const handleSaveProfessionalProfile = async () => {
    const keywordList = keywordDraft
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (keywordList.length > 5) {
      alert("Use no máximo 5 palavras-chave, separadas por vírgula.");
      return;
    }
    const highlightsList = highlightsDraft
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (bioDraft.length > PROFESSIONAL_BIO_MAX) {
      alert(`A bio deve ter no máximo ${PROFESSIONAL_BIO_MAX} caracteres.`);
      return;
    }
    if (headlineDraft.trim().length > PROFESSIONAL_HEADLINE_MAX) {
      alert(`O título curto deve ter no máximo ${PROFESSIONAL_HEADLINE_MAX} caracteres.`);
      return;
    }
    setIsSavingProfile(true);
    try {
      await setDoc(
        doc(db, "supportNetwork", professional.id),
        {
          headline: headlineDraft.trim(),
          bio: bioDraft.trim(),
          highlights: highlightsList,
          spotlightKeywords: keywordList,
          contacts: {
            ...professional.contacts,
            websiteUrl: websiteDraft.trim(),
            instagram: instagramDraft.trim(),
            youtube: youtubeDraft.trim(),
          },
          videoUrl: videoUrlDraft.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Perfil profissional atualizado.");
    } catch (err) {
      console.error("Falha ao salvar perfil profissional:", err);
      alert("Não foi possível salvar as alterações do perfil.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const qRequests = query(collection(db, "professionalLinkRequests"), where("professionalId", "==", professional.id));
    const sortLinkRequests = (rows: LinkRequest[]) =>
      rows.sort((a, b) => {
        const aPending = a.status === "pending_user" || a.status === "pending_code" ? 0 : 1;
        const bPending = b.status === "pending_user" || b.status === "pending_code" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return (b.createdAtMs || 0) - (a.createdAtMs || 0);
      });
    const mapRequestRows = (snap: any) =>
      snap.docs
        .map((docSnap: any) => ({ ...(docSnap.data() as any), id: docSnap.id }))
        .map((row: any) => ({
          id: row.id,
          familyId: row.familyId ? String(row.familyId) : undefined,
          userUid: row.userUid ? String(row.userUid) : null,
          professionalId: String(row.professionalId || ""),
          professionalName: row.professionalName,
          patientCpfDigits: row.patientCpfDigits ? String(row.patientCpfDigits) : null,
          requestedByEmail: row.requestedByEmail ?? null,
          requesterFullName: row.requesterFullName ?? null,
          requesterCpf: row.requesterCpf ?? null,
          verificationCode: row.verificationCode ? String(row.verificationCode) : null,
          codeExpiresAtMs: Number.isFinite(Number(row.codeExpiresAtMs)) ? Number(row.codeExpiresAtMs) : timestampToMs(row.codeExpiresAt),
          codeGeneratedAtMs: timestampToMs(row.codeGeneratedAt),
          consentBlocks: row.consentBlocks || null,
          requestedConsentBlocks: row.requestedConsentBlocks || null,
          sharedChildIds: Array.isArray(row.sharedChildIds) ? row.sharedChildIds.map((id: any) => String(id || "")).filter(Boolean) : [],
          sharedChildren: Array.isArray(row.sharedChildren)
            ? row.sharedChildren.map((item: any) => ({ id: String(item?.id || ""), name: String(item?.name || "") })).filter((item: any) => item.id || item.name)
            : [],
          source: row.source,
          status: (String(row.status || "pending_user") as LinkRequest["status"]),
          createdAtMs: timestampToMs(row.createdAt),
          decidedAtMs: timestampToMs(row.decidedAt),
        }));
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      const rows = mapRequestRows(snap).filter((item) => item.professionalId === professional.id);
      setLinkRequests(sortLinkRequests(rows));
    });
    const qLinks = query(collection(db, "professionalPatientLinks"), where("professionalId", "==", professional.id));
    const unsubLinks = onSnapshot(qLinks, (snap) => {
      const nowMs = Date.now();
      const scopes = snap.docs
        .map((docSnap) => ({ ...(docSnap.data() as any), id: docSnap.id }))
        .filter((row) => {
          const status = String(row?.status || "");
          const endedReason = String(row?.endedReason || "");
          const expiresAtMs = Number.isFinite(Number(row?.linkExpiresAtMs))
            ? Number(row.linkExpiresAtMs)
            : timestampToMs(row?.linkExpiresAt);
          const hasExpiration = typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) && expiresAtMs > 0;
          const isExpired = hasExpiration && expiresAtMs < nowMs;
          if (status === "inactive" && endedReason === "expired" && !hasExpiration) {
            void setDoc(
              doc(db, "professionalPatientLinks", String(row.id || "")),
              {
                status: "active",
                endedReason: null,
                endedAt: null,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch((err) => console.error("Falha ao reativar vínculo sem expiração:", err));
            return true;
          }
          if (status === "active" && isExpired) {
            void setDoc(
              doc(db, "professionalPatientLinks", String(row.id || "")),
              {
                status: "inactive",
                endedReason: "expired",
                endedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch((err) => console.error("Falha ao encerrar vínculo expirado:", err));
            return false;
          }
          return status === "active";
        })
        .map((row) => ({
          linkDocId: String(row.id || `${professional.id}__${row.familyId}`),
          familyId: String(row.familyId || ""),
          childIds: Array.isArray(row.linkedChildIds) ? row.linkedChildIds.map((id: any) => String(id || "")).filter(Boolean) : [],
          linkedChildren: Array.isArray(row.linkedChildren)
            ? row.linkedChildren
                .map((item: any) => ({ id: String(item?.id || ""), name: String(item?.name || "") }))
                .filter((item: { id: string; name: string }) => item.id || item.name)
            : [],
        }))
        .filter((row) => row.familyId) as LinkedScope[];
      const deduped = new Map<string, LinkedScope>();
      scopes.forEach((scope) => {
        const prev = deduped.get(scope.familyId);
        if (!prev) {
          deduped.set(scope.familyId, scope);
          return;
        }
        const merged = Array.from(new Set([...(prev.childIds || []), ...(scope.childIds || [])]));
        deduped.set(scope.familyId, { ...scope, linkDocId: prev.linkDocId || scope.linkDocId, childIds: merged });
      });
      setLinkedScopes(Array.from(deduped.values()));
    });
    const qTemplates = query(collection(db, "professionalRoutineTemplates"), where("professionalId", "==", professional.id));
    const unsubTemplates = onSnapshot(qTemplates, (snap) => {
      const rows = snap.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: String(data?.name || ""),
          goal: String(data?.goal || ""),
          tasks: Array.isArray(data?.tasks) ? data.tasks.map((task: any) => String(task || "")).filter(Boolean) : [],
          durationDays: Math.max(1, Number(data?.durationDays || 14)),
          scheduleMode: data?.scheduleMode === "rigid" ? "rigid" : "flex",
          scheduleTime: typeof data?.scheduleTime === "string" ? data.scheduleTime : undefined,
          schedulePeriod: data?.schedulePeriod === "afternoon" || data?.schedulePeriod === "night" ? data.schedulePeriod : "morning",
          reminderEnabled: Boolean(data?.reminderEnabled),
          isDeleted: Boolean(data?.isDeleted),
        } as OrientationTemplate & { isDeleted?: boolean };
      }).filter((item) => !item.isDeleted);
      setTemplates(rows);
      if (rows.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(rows[0].id);
      }
    });
    const qLinkEvents = query(collection(db, "professionalLinkEvents"), where("professionalId", "==", professional.id));
    const unsubEvents = onSnapshot(qLinkEvents, (snap) => {
      const rows = snap.docs
        .map((docSnap) => ({ ...(docSnap.data() as any), id: docSnap.id }))
        .map((row) => ({
          id: String(row.id || ""),
          type: row.type === "unlinked" ? "unlinked" : "linked",
          familyId: String(row.familyId || ""),
          childId: row.childId ? String(row.childId) : null,
          childName: row.childName ? String(row.childName) : null,
          requesterFullName: row.requesterFullName ? String(row.requesterFullName) : null,
          requestedByEmail: row.requestedByEmail ? String(row.requestedByEmail) : null,
          createdAtMs: timestampToMs(row.createdAt) || 0,
        } as LinkEvent))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      setLinkEvents(rows);
    });
    const statsRef = doc(db, "supportNetworkStats", professional.id);
    const unsubStats = onSnapshot(statsRef, (snap) => {
      const data = snap.data() as any;
      setAdStats((prev) => ({
        ...prev,
        impressions: Number(data?.impressions || 0),
        contactClicks: Number(data?.contactClicks || 0),
        whatsappClicks: Number(data?.whatsappClicks || 0),
        locationClicks: Number(data?.locationClicks || 0),
      }));
    });
    const qDaily = query(collection(db, "supportNetworkDailyStats"), where("professionalId", "==", professional.id));
    const unsubDaily = onSnapshot(qDaily, (snap) => {
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 6);
      const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      let impressions7d = 0;
      let contacts7d = 0;
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const date = String(data?.date || "");
        if (!date || date < cutoffKey) return;
        impressions7d += Number(data?.impressions || 0);
        contacts7d += Number(data?.contactClicks || 0) + Number(data?.whatsappClicks || 0) + Number(data?.locationClicks || 0);
      });
      setAdStats((prev) => ({ ...prev, impressions7d, contacts7d }));
    });
    const qAppointments = query(collection(db, "professionalAppointments"), where("professionalId", "==", professional.id));
    const unsubAppointments = onSnapshot(qAppointments, (snap) => {
      const rows = snap.docs
        .map((docSnap) => ({ ...(docSnap.data() as any), id: docSnap.id }))
        .map((row) => ({
          id: String(row.id || ""),
          professionalId: String(row.professionalId || professional.id),
          familyId: String(row.familyId || ""),
          childId: String(row.childId || ""),
          childName: String(row.childName || "Paciente"),
          startsAtIso: String(row.startsAtIso || ""),
          durationMin: Math.max(10, Number(row.durationMin || 30)),
          notes: String(row.notes || ""),
          tags: normalizeAppointmentTags(Array.isArray(row.tags) ? row.tags : []),
          patientStatus: String(row.patientStatus || "pending") === "confirmed"
            ? "confirmed"
            : String(row.patientStatus || "pending") === "cancelled"
              ? "cancelled"
              : "pending",
          syncToPatientCard: Boolean(row.syncToPatientCard),
          cancelledByProfessional: Boolean(row.cancelledByProfessional),
          cancelledByPatient: Boolean(row.cancelledByPatient),
        }))
        .filter((row) => row.startsAtIso)
        .sort((a, b) => new Date(a.startsAtIso).getTime() - new Date(b.startsAtIso).getTime()) as ProfessionalAppointment[];
      setAppointments(rows);
    });
    return () => {
      unsubRequests();
      unsubLinks();
      unsubTemplates();
      unsubEvents();
      unsubStats();
      unsubDaily();
      unsubAppointments();
    };
  }, [professional.id, selectedTemplateId]);

  useEffect(() => {
    const loadPatients = async () => {
      if (linkedScopes.length === 0) {
        setPatients([]);
        return;
      }
      setLoadingPatients(true);
      try {
        const days = getLastSevenDays();
        const rows: PatientSummary[] = [];
        const familyNameMap: Record<string, string> = {};
        const seenKeys = new Set<string>();
        const pushRow = (row: PatientSummary) => {
          const key = `${row.familyId}::${row.childId}`;
          if (seenKeys.has(key)) return;
          seenKeys.add(key);
          rows.push(row);
        };
        for (const scope of linkedScopes) {
          const familyId = scope.familyId;
          const scopedChildIds = new Set(scope.childIds || []);
          let familyCpfDigits = "";
          let familyPrimaryName = "";
          let loadedAnyFromChildren = false;
          try {
            const usersByFamily = await getDocs(query(collection(db, "users"), where("familyId", "==", familyId), limit(1)));
            const fallbackProfile = usersByFamily.docs[0]?.data()?.profile || {};
            familyCpfDigits = String(fallbackProfile?.cpfDigits || "").replace(/\D/g, "");
            familyPrimaryName = String(fallbackProfile?.fullName || fallbackProfile?.name || usersByFamily.docs[0]?.data()?.email || "").trim();
            if (familyPrimaryName) familyNameMap[familyId] = familyPrimaryName;
          } catch (err) {
            console.warn("Falha ao carregar CPF da família vinculada:", familyId, err);
          }
          try {
            const childrenSnap = await getDocs(collection(db, "families", familyId, "children"));
            if (!childrenSnap.empty) {
              childrenSnap.docs.forEach((childDoc) => {
                if (scopedChildIds.size > 0 && !scopedChildIds.has(String(childDoc.id))) return;
                const data = childDoc.data() as Child;
                const childName = String(data?.name || "Paciente");
                const habits = Array.isArray(data?.habits) ? data.habits : [];
                let totalChecks = 0;
                let completedChecks = 0;
                let lastActivity: string | null = null;
                habits.forEach((habit) => {
                  const completions = habit?.completions || {};
                  days.forEach((day) => {
                    const status = String(completions[day] || "");
                    if (!status) return;
                    totalChecks += 1;
                    if (status === "COMPLETED") completedChecks += 1;
                    if (!lastActivity || day > lastActivity) lastActivity = day;
                  });
                });
                const adherencePct = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;
                const status: PatientSummary["status"] =
                  adherencePct >= 70 ? "compliant" : adherencePct >= 30 ? "risk" : "inactive";
                pushRow({
                  linkDocId: scope.linkDocId,
                  familyId,
                  childId: String(childDoc.id),
                  childName,
                  patientCpfDigits: familyCpfDigits,
                  hasHabitusAccount: true,
                  adherencePct,
                  status,
                  lastActivityDate: lastActivity,
                  source: "child",
                });
                loadedAnyFromChildren = true;
              });
            }
          } catch (err) {
            console.warn("Sem acesso à lista de filhos da família; usando fallback do vínculo.", familyId, err);
          }

          if (!loadedAnyFromChildren && Array.isArray(scope.linkedChildren) && scope.linkedChildren.length > 0) {
            const isOutFamily = familyId.startsWith("out_");
            const outPatientsById = new Map<string, any>();
            const outAccountByCpf = new Map<string, boolean>();
            if (isOutFamily) {
              for (const child of scope.linkedChildren) {
                const patientId = String(child.id || "").trim();
                if (!patientId) continue;
                try {
                  const patientSnap = await getDoc(doc(db, "patients", patientId));
                  if (patientSnap.exists()) {
                    const outData = patientSnap.data() || {};
                    const cpfDigits = String((outData as any)?.cpf_digits || "").replace(/\D/g, "");
                    let hasHabitusAccount = false;
                    if (cpfDigits.length === 11) {
                      if (outAccountByCpf.has(cpfDigits)) {
                        hasHabitusAccount = Boolean(outAccountByCpf.get(cpfDigits));
                      } else {
                        const outUserQuery = query(collection(db, "users"), where("profile.cpfDigits", "==", cpfDigits), limit(1));
                        const outUserSnap = await getDocs(outUserQuery);
                        hasHabitusAccount = !outUserSnap.empty;
                        outAccountByCpf.set(cpfDigits, hasHabitusAccount);
                      }
                    }
                    outPatientsById.set(patientId, { ...outData, _hasHabitusAccount: hasHabitusAccount });
                  }
                } catch (err) {
                  console.warn("Falha ao carregar paciente OUT:", patientId, err);
                }
              }
            }
            scope.linkedChildren.forEach((child) => {
              const childId = String(child.id || "").trim();
              if (!childId) return;
              if (scopedChildIds.size > 0 && !scopedChildIds.has(childId)) return;
              const outData = outPatientsById.get(childId) || {};
              const outName = String(outData?.nome || child.name || "Paciente").trim();
              pushRow({
                linkDocId: scope.linkDocId,
                familyId,
                childId,
                patientId: isOutFamily ? childId : undefined,
                childName: outName || "Paciente",
                patientCpfDigits: String(outData?.cpf_digits || familyCpfDigits || "").replace(/\D/g, ""),
                hasHabitusAccount: isOutFamily ? Boolean(outData?._hasHabitusAccount) : true,
                adherencePct: 0,
                status: "inactive",
                lastActivityDate: null,
                source: isOutFamily ? "out" : "child",
                whatsapp: String(outData?.whatsapp || outData?.telefone_2 || "").trim(),
                email: String(outData?.email || "").trim(),
              });
            });
          }

          const hasScopeRows = rows.some((item) => item.familyId === familyId);
          if (!hasScopeRows) {
            try {
              const usersSnap = await getDocs(query(collection(db, "users"), where("familyId", "==", familyId)));
              const firstUser = usersSnap.docs[0]?.data() as any;
              const fallbackLabel = String(firstUser?.profile?.fullName || firstUser?.profile?.name || firstUser?.email || "").trim();
              pushRow({
                linkDocId: scope.linkDocId,
                familyId,
                childId: "__family__",
                childName: fallbackLabel ? `${fallbackLabel} (sem pessoa cadastrada)` : "Usuário vinculado (sem pessoa cadastrada)",
                patientCpfDigits: familyCpfDigits,
                hasHabitusAccount: true,
                adherencePct: 0,
                status: "inactive",
                lastActivityDate: null,
                source: "family",
              });
            } catch (err) {
              console.warn("Falha ao carregar fallback por família vinculada:", familyId, err);
              pushRow({
                linkDocId: scope.linkDocId,
                familyId,
                childId: "__family__",
                childName: "Usuário vinculado",
                patientCpfDigits: familyCpfDigits,
                hasHabitusAccount: true,
                adherencePct: 0,
                status: "inactive",
                lastActivityDate: null,
                source: "family",
              });
            }
          }
        }
        setPatients(rows);
        setFamilyPrimaryNameById(familyNameMap);
        if (rows.length > 0 && !selectedPatientKey) {
          setSelectedPatientKey(`${rows[0].familyId}::${rows[0].childId}`);
        }
      } catch (err) {
        console.error("Falha ao carregar pacientes vinculados:", err);
      } finally {
        setLoadingPatients(false);
      }
    };
    void loadPatients();
  }, [linkedScopes, selectedPatientKey]);

  useEffect(() => {
    if (patients.length === 0) {
      setRecordPatientKey("");
      setRecordDraft(createEmptyClinicalRecordDraft());
      setRecordLoadedAtMs(null);
      return;
    }
    if (!recordPatientKey) {
      setRecordPatientKey(`${patients[0].familyId}::${patients[0].childId}`);
      return;
    }
    const stillExists = patients.some((item) => `${item.familyId}::${item.childId}` === recordPatientKey);
    if (!stillExists) {
      setRecordPatientKey(`${patients[0].familyId}::${patients[0].childId}`);
    }
  }, [patients, recordPatientKey]);

  useEffect(() => {
    if (patients.length === 0) {
      setAppointmentPatientKey("");
      return;
    }
    if (!appointmentPatientKey) {
      setAppointmentPatientKey(`${patients[0].familyId}::${patients[0].childId}`);
      return;
    }
    const stillExists = patients.some((item) => `${item.familyId}::${item.childId}` === appointmentPatientKey);
    if (!stillExists) {
      setAppointmentPatientKey(`${patients[0].familyId}::${patients[0].childId}`);
    }
  }, [appointmentPatientKey, patients]);

  useEffect(() => {
    if (!appointmentDate) {
      setAppointmentDate(toIsoDate(new Date()));
    }
  }, [appointmentDate]);

  useEffect(() => {
    const loadPatientMeta = async () => {
      if (patients.length === 0) {
        setPatientMetaByKey({});
        return;
      }
      const next: Record<string, PatientMeta> = {};
      for (const patient of patients) {
        const key = `${patient.familyId}::${patient.childId}`;
        let ageLabel = "Idade não informada";
        try {
          if (patient.source === "out" && patient.patientId) {
            const patientSnap = await getDoc(doc(db, "patients", patient.patientId));
            if (patientSnap.exists()) {
              const patientData = patientSnap.data() as any;
              const age = parseBirthDateToAge(patientData?.data_nascimento);
              ageLabel = age === null ? "Idade não informada" : `${age} anos`;
            }
          } else if (patient.childId && patient.childId !== "__family__") {
            const childSnap = await getDoc(doc(db, "families", patient.familyId, "children", patient.childId));
            if (childSnap.exists()) {
              const childData = childSnap.data() as any;
              const age = parseBirthDateToAge(childData?.birthDate);
              ageLabel = age === null ? "Idade não informada" : `${age} anos`;
            }
          }
        } catch (err) {
          console.warn("Falha ao carregar meta do paciente:", key, err);
        }
        next[key] = { ageLabel };
      }
      setPatientMetaByKey(next);
    };
    void loadPatientMeta();
  }, [patients]);

  const selectedRecordPatient = useMemo(
    () => patients.find((item) => `${item.familyId}::${item.childId}` === recordPatientKey) || null,
    [patients, recordPatientKey]
  );

  const filteredActivePatients = useMemo(() => {
    const term = activePatientSearch.trim().toLowerCase();
    if (!term) return patients;
    const digits = term.replace(/\D/g, "");
    return patients.filter((patient) => {
      const byName = patient.childName.toLowerCase().includes(term);
      const byCpf = digits.length > 0 && String(patient.patientCpfDigits || "").includes(digits);
      return byName || byCpf;
    });
  }, [activePatientSearch, patients]);

  const myPatients = useMemo(() => {
    const activeMap = new Map<string, PatientSummary>();
    patients.forEach((item) => activeMap.set(`${item.familyId}::${item.childId}`, item));
    const ownerByKey = new Map<string, string>();
    linkEvents
      .filter((event) => event.type === "linked")
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .forEach((event) => {
        const owner = String(event.requesterFullName || event.requestedByEmail || "Sem responsável informado");
        const data = (event as any) || {};
        if (event.childId) {
          const key = `${event.familyId}::${event.childId}`;
          if (!ownerByKey.has(key)) ownerByKey.set(key, owner);
        }
        if (Array.isArray(data?.sharedChildren)) {
          data.sharedChildren.forEach((child: any) => {
            const childId = String(child?.id || "").trim();
            if (!childId) return;
            const key = `${event.familyId}::${childId}`;
            if (!ownerByKey.has(key)) ownerByKey.set(key, owner);
          });
        }
      });

    const map = new Map<string, MyPatientItem>();
    activeMap.forEach((patient, key) => {
      const isOutPatient = patient.source === "out" || patient.familyId.startsWith("out_");
      map.set(key, {
        key,
        familyId: patient.familyId,
        childId: patient.childId,
        patientId: patient.patientId,
        childName: patient.childName,
        patientCpfDigits: patient.patientCpfDigits,
        linkDocId: patient.linkDocId,
        isActive: true,
        ageLabel: patientMetaByKey[key]?.ageLabel || "Idade não informada",
        firstLinkOwner: isOutPatient
          ? (patient.childName || "Paciente")
          : (familyPrimaryNameById[patient.familyId] || ownerByKey.get(key) || "Sem responsável informado"),
        source: patient.source,
        whatsapp: patient.whatsapp,
        email: patient.email,
        hasHabitusAccount: patient.hasHabitusAccount,
      });
    });

    linkEvents.forEach((event) => {
      const data = (event as any) || {};
      const addOrUpdate = (familyId: string, childId: string, childName: string) => {
        if (!familyId || !childId) return;
        const key = `${familyId}::${childId}`;
        if (map.has(key)) return;
        const isOutPatient = familyId.startsWith("out_");
        map.set(key, {
          key,
          familyId,
          childId,
          patientId: undefined,
          childName: childName || "Paciente",
          patientCpfDigits: undefined,
          linkDocId: `${professional.id}__${familyId}`,
          isActive: activeMap.has(key),
          ageLabel: patientMetaByKey[key]?.ageLabel || "Idade não informada",
          firstLinkOwner: isOutPatient
            ? (childName || "Paciente")
            : (familyPrimaryNameById[familyId] || ownerByKey.get(key) || "Sem responsável informado"),
          source: isOutPatient ? "out" : "child",
          whatsapp: undefined,
          email: undefined,
          hasHabitusAccount: true,
        });
      };
      if (event.childId) {
        addOrUpdate(event.familyId, String(event.childId), String(event.childName || "Paciente"));
      }
      if (Array.isArray(data?.sharedChildren)) {
        data.sharedChildren.forEach((child: any) => {
          addOrUpdate(event.familyId, String(child?.id || ""), String(child?.name || "Paciente"));
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.childName.localeCompare(b.childName, "pt-BR"));
  }, [familyPrimaryNameById, linkEvents, patientMetaByKey, patients, professional.id]);

  const filteredMyPatients = useMemo(() => {
    if (myPatientsFilter === "none" && !myPatientsSearch.trim()) return [];
    let base = myPatients;
    if (myPatientsFilter === "active") {
      base = base.filter((patient) => patient.isActive);
    } else if (myPatientsFilter === "inactive") {
      base = base.filter((patient) => !patient.isActive);
    } else if (myPatientsFilter === "out") {
      base = base.filter((patient) => patient.source === "out");
    }
    const term = myPatientsSearch.trim().toLowerCase();
    if (!term) return base;
    const digits = term.replace(/\D/g, "");
    return base.filter((patient) => {
      const byName = patient.childName.toLowerCase().includes(term);
      const byCpf = digits.length > 0 && String(patients.find((item) => `${item.familyId}::${item.childId}` === patient.key)?.patientCpfDigits || "").includes(digits);
      return byName || byCpf;
    });
  }, [myPatients, myPatientsFilter, myPatientsSearch, patients]);

  const unlinkedPatients = useMemo(() => {
    const activeKeys = new Set(patients.map((item) => `${item.familyId}::${item.childId}`));
    const grouped = new Map<string, { familyId: string; childId: string; childName: string; unlinkedAtMs: number }>();
    linkEvents
      .filter((event) => event.type === "unlinked" && event.familyId && event.childId)
      .forEach((event) => {
        const key = `${event.familyId}::${event.childId}`;
        if (activeKeys.has(key)) return;
        const prev = grouped.get(key);
        if (!prev || event.createdAtMs > prev.unlinkedAtMs) {
          grouped.set(key, {
            familyId: event.familyId,
            childId: String(event.childId || ""),
            childName: String(event.childName || "Paciente"),
            unlinkedAtMs: event.createdAtMs,
          });
        }
      });
    return Array.from(grouped.values()).sort((a, b) => b.unlinkedAtMs - a.unlinkedAtMs);
  }, [linkEvents, patients]);

  const agendaReferenceDateObj = useMemo(() => {
    const parsed = new Date(`${agendaReferenceDate}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }, [agendaReferenceDate]);

  const agendaWeekDays = useMemo(() => {
    const start = startOfWeekDate(agendaReferenceDateObj);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(start);
      date.setDate(start.getDate() + idx);
      return {
        date,
        iso: toIsoDate(date),
        label: formatDayHeader(date),
      };
    });
  }, [agendaReferenceDateObj]);

  const agendaDayIso = useMemo(() => toIsoDate(agendaReferenceDateObj), [agendaReferenceDateObj]);

  const agendaMonthGridDays = useMemo(() => {
    const monthStart = new Date(agendaReferenceDateObj.getFullYear(), agendaReferenceDateObj.getMonth(), 1);
    const gridStart = startOfWeekDate(monthStart);
    return Array.from({ length: 42 }).map((_, idx) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + idx);
      const iso = toIsoDate(date);
      return {
        date,
        iso,
        label: String(date.getDate()),
        inCurrentMonth: date.getMonth() === agendaReferenceDateObj.getMonth(),
      };
    });
  }, [agendaReferenceDateObj]);

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, ProfessionalAppointment[]>();
    appointments.forEach((item) => {
      if (item.patientStatus === "cancelled" && item.cancelledByProfessional) return;
      const day = String(item.startsAtIso || "").slice(0, 10);
      if (!day) return;
      map.set(day, [...(map.get(day) || []), item]);
    });
    map.forEach((value, key) => {
      map.set(
        key,
        [...value].sort((a, b) => new Date(a.startsAtIso).getTime() - new Date(b.startsAtIso).getTime())
      );
    });
    return map;
  }, [appointments]);
  const cancelledAppointmentsHistory = useMemo(
    () =>
      appointments
        .filter((item) => item.patientStatus === "cancelled" && item.cancelledByProfessional)
        .sort((a, b) => new Date(b.startsAtIso).getTime() - new Date(a.startsAtIso).getTime()),
    [appointments]
  );

  useEffect(() => {
    const loadClinicalRecord = async () => {
      if (!recordPatientKey) {
        setRecordDraft(createEmptyClinicalRecordDraft());
        setRecordLoadedAtMs(null);
        return;
      }
      const [familyId, childId] = recordPatientKey.split("::");
      if (!familyId || !childId) return;
      setIsLoadingRecord(true);
      try {
        const recordDocId = `${professional.id}__${familyId}__${childId}`;
        const snap = await getDoc(doc(db, "professionalClinicalRecords", recordDocId));
        if (!snap.exists()) {
          setRecordDraft(createEmptyClinicalRecordDraft());
          setRecordLoadedAtMs(null);
          return;
        }
        const data = snap.data() as Partial<ClinicalRecordDraft> & { updatedAt?: any };
        const normalizedAttachments = Array.isArray((data as any)?.attachments)
          ? (data as any).attachments
              .map((item: any) => ({
                id: String(item?.id || crypto.randomUUID()),
                name: String(item?.name || "Arquivo"),
                url: String(item?.url || ""),
                contentType: String(item?.contentType || "application/octet-stream"),
                sizeBytes: Number(item?.sizeBytes || 0),
                uploadedAtIso: String(item?.uploadedAtIso || ""),
                storagePath: String(item?.storagePath || ""),
              }))
              .filter((item: ClinicalAttachment) => Boolean(item.url))
          : [];
        setRecordDraft({
          ...createEmptyClinicalRecordDraft(),
          ...Object.fromEntries(
            Object.entries(data || {}).filter(([key]) => key in createEmptyClinicalRecordDraft())
          ),
          attachments: normalizedAttachments,
        } as ClinicalRecordDraft);
        setRecordLoadedAtMs(timestampToMs((data as any)?.updatedAt));
      } catch (err) {
        console.error("Falha ao carregar prontuário clínico:", err);
        alert("Não foi possível carregar o prontuário deste paciente.");
      } finally {
        setIsLoadingRecord(false);
      }
    };
    void loadClinicalRecord();
  }, [professional.id, recordPatientKey]);

  useEffect(() => {
    setShowFullRecordInFollowup(false);
  }, [recordPatientKey]);

  const setRecordField = <K extends keyof ClinicalRecordDraft>(field: K, value: ClinicalRecordDraft[K]) => {
    setRecordDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRecordSection = (section: keyof typeof recordSectionsOpen) => {
    setRecordSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSaveClinicalRecord = async () => {
    if (!planStatus.canEditExistingRecords) {
      alert("Limite atingido. Migre para o plano pago para continuar");
      return;
    }
    if (!selectedRecordPatient) {
      alert("Selecione um paciente para salvar o prontuário.");
      return;
    }
    setIsSavingRecord(true);
    try {
      const familyId = selectedRecordPatient.familyId;
      const childId = selectedRecordPatient.childId;
      const pacienteId = activeAttendancePatientId || (await buildPatientUniqueCode(buildStablePatientSeed(familyId, childId)));
      const recordDocId = `${professional.id}__${familyId}__${childId}`;
      const recordRef = doc(db, "professionalClinicalRecords", recordDocId);
      const existingSnap = await getDoc(recordRef);
      const timestampIso = new Date().toISOString();
      const recordTextBase = [
        recordDraft.soapSubjective,
        recordDraft.soapObjective,
        recordDraft.soapAssessment,
        recordDraft.soapPlan,
        recordDraft.chiefComplaint,
        recordDraft.currentIllnessHistory,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join("\n");
      const recordText = recordTextBase || JSON.stringify(recordDraft);
      const registroHash = await buildRecordSecurityHash({
        professionalId: professional.id,
        timestampIso,
        recordText,
      });
      const payload: Record<string, any> = {
        ...recordDraft,
        professionalId: professional.id,
        professionalName: professional.name,
        familyId,
        childId,
        paciente_id: pacienteId,
        codigo_unico_paciente: pacienteId,
        hash_seguranca: registroHash,
        registro_hash: registroHash,
        is_immutable: true,
        childName: selectedRecordPatient.childName,
        updatedAt: serverTimestamp(),
        updatedByUid: auth.currentUser?.uid || null,
        updatedByEmail: auth.currentUser?.email || null,
      };
      if (!existingSnap.exists()) {
        payload.createdAt = serverTimestamp();
      }
      await setDoc(recordRef, payload, { merge: true });
      await addDoc(collection(db, "professionalClinicalRecordEntries"), {
        professional_id: professional.id,
        professionalId: professional.id,
        familyId,
        childId,
        childName: selectedRecordPatient.childName,
        paciente_id: pacienteId,
        codigo_unico_paciente: pacienteId,
        created_at_iso: timestampIso,
        createdAt: serverTimestamp(),
        hash_seguranca: registroHash,
        registro_hash: registroHash,
        is_immutable: true,
        payload,
      });
      setRecordLoadedAtMs(Date.now());
      alert("Prontuário salvo com sucesso.");
    } catch (err) {
      console.error("Falha ao salvar prontuário:", err);
      alert("Não foi possível salvar o prontuário agora.");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleUploadClinicalAttachment = async (file: File) => {
    if (!file) return;
    if (!selectedRecordPatient) {
      alert("Selecione um paciente antes de anexar arquivos.");
      return;
    }
    if (file.size > CLINICAL_ATTACHMENT_MAX_BYTES) {
      alert(`Arquivo muito grande. Limite de ${formatFileBytes(CLINICAL_ATTACHMENT_MAX_BYTES)}.`);
      return;
    }
    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const now = Date.now();
    const storagePath = `professional-clinical-records/${professional.id}/${selectedRecordPatient.familyId}/${selectedRecordPatient.childId}/${now}-${safeName}`;
    setIsUploadingAttachment(true);
    try {
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
      const url = await getDownloadURL(fileRef);
      const attachment: ClinicalAttachment = {
        id: `att-${crypto.randomUUID()}`,
        name: safeName,
        url,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        uploadedAtIso: new Date().toISOString(),
        storagePath,
      };
      setRecordDraft((prev) => ({ ...prev, attachments: [...prev.attachments, attachment] }));
      alert("Anexo enviado. Clique em salvar prontuário para persistir no registro.");
    } catch (err) {
      console.error("Falha no upload de anexo clínico:", err);
      alert("Não foi possível enviar o anexo.");
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleRemoveClinicalAttachment = (attachmentId: string) => {
    setRecordDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((item) => item.id !== attachmentId),
    }));
  };

  const handleExportSoapPdf = () => {
    if (!selectedRecordPatient) {
      alert("Selecione um paciente.");
      return;
    }
    const soapRows = [
      ["S - Subjetivo", recordDraft.soapSubjective],
      ["O - Objetivo", recordDraft.soapObjective],
      ["A - Avaliação", recordDraft.soapAssessment],
      ["P - Plano", recordDraft.soapPlan],
    ] as const;
    const html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Evolução SOAP</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 8px 0; }
          .meta { font-size: 12px; color: #334155; margin-bottom: 16px; }
          .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
          .title { font-weight: bold; margin-bottom: 6px; font-size: 13px; }
          .content { white-space: pre-wrap; font-size: 13px; line-height: 1.4; }
        </style>
      </head>
      <body>
        <h1>Evolução SOAP</h1>
        <div class="meta">
          Profissional: ${escapeHtml(professional.name)}<br/>
          Paciente: ${escapeHtml(selectedRecordPatient.childName)}<br/>
          Data/Hora: ${escapeHtml(new Date().toLocaleString("pt-BR"))}
        </div>
        ${soapRows
          .map(
            ([label, value]) => `
              <div class="card">
                <div class="title">${escapeHtml(label)}</div>
                <div class="content">${escapeHtml(value || "Sem registro.")}</div>
              </div>
            `
          )
          .join("")}
      </body>
      </html>
    `;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!printWindow) {
      alert("Não foi possível abrir a janela de impressão. Verifique o bloqueio de pop-up.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const linkedFamiliesCount = linkedScopes.length;
  const patientCount = Math.max(patients.length, linkedFamiliesCount);
  const planStatus = useMemo(() => evaluateProfessionalPlanStatus(professional), [professional]);
  const planConfig = PROFESSIONAL_PLAN_CONFIG[planStatus.planType];
  const canUseVoiceAnamnesis = planStatus.planType !== "FREE" && planStatus.canUseVoice;
  const adherenceAverage = patientCount > 0 ? Math.round(patients.reduce((sum, item) => sum + item.adherencePct, 0) / patientCount) : 0;
  const pendingRequests = linkRequests.filter((item) => item.status === "pending_user" || item.status === "pending_code");
  const approvedRequests = linkRequests.filter((item) => item.status === "approved");
  const rejectedRequests = linkRequests.filter((item) => item.status === "rejected");
  const decidedRequests = linkRequests.filter((item) => item.status === "approved" || item.status === "rejected" || item.status === "expired");
  const approvalRate = decidedRequests.length > 0 ? Math.round((approvedRequests.length / decidedRequests.length) * 100) : 0;
  const avgApprovalHours = (() => {
    const samples = approvedRequests
      .map((item) =>
        item.createdAtMs && item.decidedAtMs && item.decidedAtMs >= item.createdAtMs
          ? (item.decidedAtMs - item.createdAtMs) / (1000 * 60 * 60)
          : null
      )
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (samples.length === 0) return null;
    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return Math.round(avg * 10) / 10;
  })();
  const sourceStats = useMemo(() => {
    const base = {
      cpf: 0,
      other: 0
    };
    linkRequests.forEach((item) => {
      if (item.source === "professional_cpf") base.cpf += 1;
      else base.other += 1;
    });
    return base;
  }, [linkRequests]);
  const linkedCountAllTime = linkEvents.filter((event) => event.type === "linked").length;
  const unlinkedCountAllTime = linkEvents.filter((event) => event.type === "unlinked").length;
  const totalContactClicks = adStats.contactClicks + adStats.whatsappClicks + adStats.locationClicks;
  const ctrTotal = adStats.impressions > 0 ? (totalContactClicks / adStats.impressions) * 100 : 0;
  const ctr7d = adStats.impressions7d > 0 ? (adStats.contacts7d / adStats.impressions7d) * 100 : 0;
  const shouldShowFullClinicalRecord = recordDraft.visitType === "first" || showFullRecordInFollowup;

  const setOutPatientField = <K extends keyof OutPatientDraft>(field: K, value: OutPatientDraft[K]) => {
    setOutPatientDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleLookupOutPatientCep = async () => {
    const cepDigits = String(outPatientDraft.addressZip || "").replace(/\D/g, "");
    if (cepDigits.length !== 8) return;
    setIsLookingUpOutPatientCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || data?.erro) return;
      setOutPatientDraft((prev) => ({
        ...prev,
        addressStreet: String(data?.logradouro || prev.addressStreet || "").trim(),
        addressNeighborhood: String(data?.bairro || prev.addressNeighborhood || "").trim(),
        addressCity: String(data?.localidade || prev.addressCity || "").trim(),
        addressUf: String(data?.uf || prev.addressUf || "").trim().toUpperCase().slice(0, 2),
      }));
    } catch (err) {
      console.warn("Falha ao consultar CEP para paciente OUT:", err);
    } finally {
      setIsLookingUpOutPatientCep(false);
    }
  };

  const handleSaveOutPatient = async () => {
    if (!planStatus.canCreateNewPatients) {
      alert("Limite do plano atingido para novos pacientes.");
      return;
    }
    const cpfDigits = String(outPatientDraft.cpf || "").replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      alert("CPF inválido.");
      return;
    }
    if (!outPatientDraft.nome.trim()) {
      alert("Informe o nome completo.");
      return;
    }
    if (!outPatientDraft.dataNascimento.trim()) {
      alert("Data de nascimento é obrigatória.");
      return;
    }
    const age = parseBirthDateToAge(outPatientDraft.dataNascimento);
    const isMinor = age !== null && age < 18;
    if (isMinor) {
      const responsibleName = String(outPatientDraft.responsavelLegalNome || "").trim();
      if (!responsibleName) {
        alert("Para menores de 18 anos, informe o responsável legal.");
        return;
      }
      if (responsibleName.toLowerCase() === String(outPatientDraft.nome || "").trim().toLowerCase()) {
        alert("Para menores de 18 anos, o responsável legal não pode ser o próprio paciente.");
        return;
      }
    }
    if (!outPatientDraft.addressStreet.trim() || !outPatientDraft.addressCity.trim() || !outPatientDraft.addressUf.trim()) {
      alert("Preencha endereço (rua, cidade e UF).");
      return;
    }
    setIsSavingOutPatient(true);
    try {
      const patientId = await buildPatientUniqueCode(`out::${professional.id}::${cpfDigits}`);
      const familyId = `out_${patientId}`;
      const childId = patientId;
      const endereco = [
        outPatientDraft.addressStreet,
        outPatientDraft.addressNumber,
        outPatientDraft.addressComplement,
        outPatientDraft.addressNeighborhood,
        outPatientDraft.addressCity,
        outPatientDraft.addressUf,
        outPatientDraft.addressZip,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ");

      await setDoc(
        doc(db, "patients", patientId),
        {
          codigo_unico_paciente: patientId,
          nome: outPatientDraft.nome.trim(),
          apelido: outPatientDraft.apelido.trim(),
          sexo: outPatientDraft.sexo.trim() || "nao_informado",
          cpf: formatCpf(cpfDigits),
          cpf_digits: cpfDigits,
          data_nascimento: outPatientDraft.dataNascimento.trim(),
          responsavel_legal_nome: outPatientDraft.responsavelLegalNome.trim(),
          responsavel_legal_telefone: outPatientDraft.responsavelLegalTelefone.trim(),
          email: outPatientDraft.email.trim(),
          endereco,
          address_street: outPatientDraft.addressStreet.trim(),
          address_number: outPatientDraft.addressNumber.trim(),
          address_complement: outPatientDraft.addressComplement.trim(),
          address_neighborhood: outPatientDraft.addressNeighborhood.trim(),
          address_city: outPatientDraft.addressCity.trim(),
          address_uf: outPatientDraft.addressUf.trim(),
          address_zip: outPatientDraft.addressZip.trim(),
          telefone_1_principal: outPatientDraft.telefonePrincipal.trim(),
          telefone_2: outPatientDraft.whatsapp.trim(),
          whatsapp: outPatientDraft.whatsapp.trim(),
          familyId,
          childId,
          source: "out",
          source_professional_id: professional.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "professionalPatientLinks"), {
        professionalId: professional.id,
        professionalName: professional.name,
        familyId,
        linkedChildIds: [childId],
        linkedChildren: [{ id: childId, name: outPatientDraft.nome.trim() }],
        status: "active",
        source: "out_manual",
        consentBlocks: {
          personal: true,
          profile: true,
          health: true,
        },
        requestedByEmail: auth.currentUser?.email || null,
        requesterFullName: professional.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "professionalLinkEvents"), {
        professionalId: professional.id,
        type: "linked",
        familyId,
        childId,
        childName: outPatientDraft.nome.trim(),
        requestedByEmail: auth.currentUser?.email || null,
        requesterFullName: professional.name,
        source: "out_manual",
        createdAt: serverTimestamp(),
      });

      setShowOutPatientForm(false);
      setCpfRequestInput("");
      setOutPatientDraft(createEmptyOutPatientDraft());
      setMyPatientsFilter("out");
      setMyPatientsSearch("");
      alert("Paciente OUT cadastrado e vinculado.");
    } catch (err) {
      console.error("Falha ao salvar paciente OUT:", err);
      alert("Não foi possível cadastrar o paciente agora.");
    } finally {
      setIsSavingOutPatient(false);
    }
  };

  const handleSendOutPatientWhatsappInvite = (patient: MyPatientItem) => {
    const whatsapp = String(patient.whatsapp || "").replace(/\D/g, "");
    const href = getWhatsappHref(whatsapp);
    if (!href) {
      alert("Paciente sem WhatsApp válido.");
      return;
    }
    const doctorName = professional.name || "Profissional";
    const signupUrl = typeof window !== "undefined" ? `${window.location.origin}` : "https://habitus.app/";
    const text = [
      `Olá ${patient.childName},`,
      `você está sendo convidado(a) pelo Dr(a). ${doctorName} a fazer parte da comunidade Habitus App,`,
      "um programa de gerenciamento de rotinas e hábitos.",
      `Para se cadastrar, clique aqui: ${signupUrl}`,
    ].join(" ");
    window.open(`${href}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleConvertOutToOfficialLink = async (patient: MyPatientItem) => {
    const cpfDigits = String(patient.patientCpfDigits || "").replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      alert("CPF do paciente OUT não encontrado. Atualize os dados e tente novamente.");
      return;
    }
    if (!planStatus.canCreateNewPatients) {
      if (planStatus.blockScope === "read_only") {
        alert("Limite atingido. Migre para o plano pago para continuar");
      } else {
        alert("Limite mensal do plano atingido. Não é possível vincular novos pacientes neste mês.");
      }
      return;
    }
    setIsCreatingCpfRequest(true);
    try {
      const userQuery = query(collection(db, "users"), where("profile.cpfDigits", "==", cpfDigits), limit(1));
      const userSnap = await getDocs(userQuery);
      if (userSnap.empty) {
        alert("Este CPF ainda não possui conta Habitus. Envie convite por WhatsApp.");
        return;
      }
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data() as any;
      if (!Boolean(userData?.profile?.shareForProfessionalLink)) {
        alert("Este usuário não autorizou receber solicitações de vínculo por CPF.");
        return;
      }
      const familyId = String(userData?.familyId || "");
      if (!familyId) {
        alert("Usuário encontrado, mas sem família ativa para vinculação.");
        return;
      }
      const existingPending = linkRequests.find(
        (item) =>
          item.patientCpfDigits === cpfDigits &&
          (item.status === "pending_user" || item.status === "pending_code")
      );
      if (existingPending) {
        alert("Já existe uma solicitação pendente para este CPF.");
        return;
      }
      const requestRef = await addDoc(collection(db, "professionalLinkRequests"), {
        professionalId: professional.id,
        professionalName: professional.name,
        patientCpfDigits: cpfDigits,
        userUid: userDoc.id,
        familyId,
        requestedConsentBlocks: {
          personal: true,
          profile: true,
          health: true,
        },
        status: "pending_user",
        source: "professional_cpf",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await notifyFamily(familyId, {
        title: "Solicitação de vínculo",
        message: `${professional.name} solicitou vinculação profissional. Abra para autorizar.`,
        type: "PRO_LINK_CPF_REQUEST",
        metadata: {
          requestId: requestRef.id,
          professionalId: professional.id,
          professionalName: professional.name,
        },
      });
      alert("Solicitação oficial enviada. O paciente precisa autorizar e informar o código.");
    } catch (err) {
      console.error("Falha ao converter OUT para vínculo oficial:", err);
      alert("Não foi possível enviar a solicitação oficial agora.");
    } finally {
      setIsCreatingCpfRequest(false);
    }
  };

  const handleRequestByCpf = async () => {
    if (!planStatus.canCreateNewPatients) {
      if (planStatus.blockScope === "read_only") {
        alert("Limite atingido. Migre para o plano pago para continuar");
      } else {
        alert("Limite mensal do plano atingido. Não é possível vincular novos pacientes neste mês.");
      }
      return;
    }
    const cpfDigits = cpfRequestInput.replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      alert("Informe um CPF válido com 11 dígitos.");
      return;
    }
    setIsCreatingCpfRequest(true);
    setShowOutPatientForm(false);
    try {
      const userQuery = query(collection(db, "users"), where("profile.cpfDigits", "==", cpfDigits), limit(1));
      const userSnap = await getDocs(userQuery);
      if (userSnap.empty) {
        const patientQuery = query(collection(db, "patients"), where("cpf_digits", "==", cpfDigits), limit(1));
        const patientSnap = await getDocs(patientQuery);
        const existingOut = patientSnap.empty ? null : (patientSnap.docs[0].data() as any);
        setOutPatientDraft({
          cpf: formatCpf(cpfDigits),
          nome: String(existingOut?.nome || "").trim(),
          dataNascimento: String(existingOut?.data_nascimento || "").trim(),
          sexo: String(existingOut?.sexo || "nao_informado").trim() || "nao_informado",
          apelido: String(existingOut?.apelido || "").trim(),
          responsavelLegalNome: String(existingOut?.responsavel_legal_nome || "").trim(),
          responsavelLegalTelefone: String(existingOut?.responsavel_legal_telefone || "").trim(),
          addressZip: formatCep(String(existingOut?.address_zip || "").trim()),
          addressStreet: String(existingOut?.address_street || "").trim(),
          addressNumber: String(existingOut?.address_number || "").trim(),
          addressComplement: String(existingOut?.address_complement || "").trim(),
          addressNeighborhood: String(existingOut?.address_neighborhood || "").trim(),
          addressCity: String(existingOut?.address_city || "").trim(),
          addressUf: String(existingOut?.address_uf || "").trim().toUpperCase().slice(0, 2),
          telefonePrincipal: String(existingOut?.telefone_1_principal || "").trim(),
          whatsapp: String(existingOut?.whatsapp || existingOut?.telefone_2 || "").trim(),
          email: String(existingOut?.email || "").trim(),
        });
        setShowOutPatientForm(true);
        alert("CPF não encontrado como usuário Habitus. Complete a ficha para criar paciente OUT.");
        return;
      }
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data() as any;
      if (!Boolean(userData?.profile?.shareForProfessionalLink)) {
        alert("Este usuário não autorizou receber solicitações de vínculo por CPF.");
        return;
      }
      const familyId = String(userData?.familyId || "");
      if (!familyId) {
        alert("Usuário encontrado, mas sem família ativa para vinculação.");
        return;
      }
      const existingPending = linkRequests.find(
        (item) =>
          item.patientCpfDigits === cpfDigits &&
          (item.status === "pending_user" || item.status === "pending_code")
      );
      if (existingPending) {
        alert("Já existe uma solicitação pendente para este CPF.");
        return;
      }
      const requestRef = await addDoc(collection(db, "professionalLinkRequests"), {
        professionalId: professional.id,
        professionalName: professional.name,
        patientCpfDigits: cpfDigits,
        userUid: userDoc.id,
        familyId,
        requestedConsentBlocks: {
          personal: true,
          profile: true,
          health: true,
        },
        status: "pending_user",
        source: "professional_cpf",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await notifyFamily(familyId, {
        title: "Solicitação de vínculo",
        message: `${professional.name} solicitou vinculação profissional. Abra para autorizar.`,
        type: "PRO_LINK_CPF_REQUEST",
        metadata: {
          requestId: requestRef.id,
          professionalId: professional.id,
          professionalName: professional.name,
        },
      });
      setCpfRequestInput("");
      alert("Solicitação enviada para o paciente.");
    } catch (err) {
      console.error("Falha ao solicitar vínculo por CPF:", err);
      const message = String((err as any)?.message || "");
      if (message.includes("permission-denied")) {
        if (planStatus.blockScope === "read_only") {
          alert("Limite atingido. Migre para o plano pago para continuar");
        } else if (planStatus.blockScope === "new_patient_only") {
          alert("Limite mensal do plano atingido. Não é possível vincular novos pacientes neste mês.");
        } else {
          alert("Permissão negada ao criar a solicitação. Atualize a página e tente novamente.");
        }
      } else {
        alert("Não foi possível enviar a solicitação agora.");
      }
    } finally {
      setIsCreatingCpfRequest(false);
    }
  };

  const handleValidatePatientCode = async (request: LinkRequest) => {
    const codeInput = String(requestCodeByRequestId[request.id] || "").trim();
    if (!/^\d{6}$/.test(codeInput)) {
      alert("Digite o código de 6 dígitos informado pelo paciente.");
      return;
    }
    if (!planStatus.canCreateNewPatients) {
      if (planStatus.blockScope === "read_only") {
        alert("Limite atingido. Migre para o plano pago para continuar");
      } else {
        alert("Limite mensal do plano atingido. Não é possível vincular novos pacientes neste mês.");
      }
      return;
    }
    try {
      if (request.status !== "pending_code") {
        alert("Esta solicitação não está aguardando código.");
        return;
      }
      if (!request.familyId) {
        alert("Solicitação inválida: família não definida.");
        return;
      }
      const requestRef = doc(db, "professionalLinkRequests", request.id);
      const latestSnap = await getDoc(requestRef);
      if (!latestSnap.exists()) {
        alert("Solicitação não encontrada.");
        return;
      }
      const latest = latestSnap.data() as any;
      const latestStatus = String(latest?.status || "");
      if (latestStatus !== "pending_code") {
        alert("A solicitação mudou de status. Atualize a tela.");
        return;
      }
      const expiresMs = Number.isFinite(Number(latest?.codeExpiresAtMs))
        ? Number(latest.codeExpiresAtMs)
        : timestampToMs(latest?.codeExpiresAt);
      if (!expiresMs || Date.now() > expiresMs) {
        await setDoc(requestRef, { status: "expired", updatedAt: serverTimestamp() }, { merge: true });
        alert("Código expirado. Peça ao paciente para gerar um novo.");
        return;
      }
      const savedCode = String(latest?.verificationCode || "");
      if (savedCode !== codeInput) {
        alert("Código inválido.");
        return;
      }
      const normalizedFamilyId = String(latest?.familyId || request.familyId);
      const linkId = `${professional.id}__${normalizedFamilyId}`;
      const linkRef = doc(db, "professionalPatientLinks", linkId);
      const existingLinkSnap = await getDoc(linkRef);
      const existingLinkData = existingLinkSnap.exists() ? (existingLinkSnap.data() as any) : {};
      const existingChildIds = Array.isArray(existingLinkData?.linkedChildIds)
        ? existingLinkData.linkedChildIds.map((id: any) => String(id || "")).filter(Boolean)
        : [];
      const requestedChildIds = Array.isArray(latest?.sharedChildIds)
        ? latest.sharedChildIds.map((id: any) => String(id || "")).filter(Boolean)
        : [];
      const mergedChildIds = Array.from(new Set([...existingChildIds, ...requestedChildIds]));
      const existingChildren = Array.isArray(existingLinkData?.linkedChildren)
        ? existingLinkData.linkedChildren
            .map((item: any) => ({ id: String(item?.id || ""), name: String(item?.name || "") }))
            .filter((item: any) => item.id)
        : [];
      const requestedChildren = Array.isArray(latest?.sharedChildren) && latest.sharedChildren.length > 0
        ? latest.sharedChildren
            .map((item: any) => ({ id: String(item?.id || ""), name: String(item?.name || "") }))
            .filter((item: any) => item.id)
        : requestedChildIds.map((id: string) => ({ id, name: "Paciente" }));
      const childNameById = new Map<string, string>();
      existingChildren.forEach((item: { id: string; name: string }) => childNameById.set(item.id, item.name || "Paciente"));
      requestedChildren.forEach((item: { id: string; name: string }) => childNameById.set(item.id, item.name || childNameById.get(item.id) || "Paciente"));
      const mergedChildren = mergedChildIds.map((id) => ({ id, name: childNameById.get(id) || "Paciente" }));
      const newlyLinkedChildIds = mergedChildIds.filter((id) => !existingChildIds.includes(id));

      const nowMs = Date.now();
      const defaultExpiresAtMs = nowMs + 21 * 24 * 60 * 60 * 1000;
      const requestedExpiresAtMs = Number.isFinite(Number(latest?.linkExpiresAtMs))
        ? Number(latest.linkExpiresAtMs)
        : timestampToMs(latest?.linkExpiresAt);
      const linkExpiresAtMs =
        typeof requestedExpiresAtMs === "number" && Number.isFinite(requestedExpiresAtMs) && requestedExpiresAtMs > nowMs
          ? requestedExpiresAtMs
          : defaultExpiresAtMs;
      await setDoc(
        linkRef,
        {
          id: linkId,
          professionalId: professional.id,
          familyId: normalizedFamilyId,
          linkedChildIds: mergedChildIds,
          linkedChildren: mergedChildren,
          requesterFullName: latest?.requesterFullName || null,
          requesterCpf: latest?.requesterCpf || null,
          requestedByEmail: latest?.requestedByEmail || null,
          consentBlocks: latest?.consentBlocks || existingLinkData?.consentBlocks || null,
          linkExpiresAtMs,
          status: "active",
          approvedAt: serverTimestamp(),
          approvedByUid: auth.currentUser?.uid ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setDoc(
        requestRef,
        {
          status: "approved",
          decidedAt: serverTimestamp(),
          decidedByUid: auth.currentUser?.uid ?? null,
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      try {
        const currentMonthRef = new Date().toISOString().slice(0, 7);
        const linkedChildren = mergedChildren.filter((item) => newlyLinkedChildIds.includes(item.id));
        const linkedChildrenCount = linkedChildren.length;
        const shouldCountAsNewFamilyLink = !existingLinkSnap.exists() && linkedChildrenCount === 0;
        const effectiveNewLinksCount = shouldCountAsNewFamilyLink ? 1 : linkedChildrenCount;

        for (const linkedChild of linkedChildren) {
          const childId = String(linkedChild?.id || "").trim();
          if (!childId) continue;
          const pacienteId = await buildPatientUniqueCode(buildStablePatientSeed(normalizedFamilyId, childId));
          let nome = String(linkedChild?.name || "Paciente").trim() || "Paciente";
          let sexo = "nao_informado";
          let dataNascimento = "";
          let addressStreet = "";
          let addressNumber = "";
          let addressComplement = "";
          let addressNeighborhood = "";
          let addressCity = "";
          let addressUf = "";
          let addressZip = "";
          let telefonePrincipal = "";
          let whatsapp = "";

          try {
            const childSnap = await getDoc(doc(db, "families", normalizedFamilyId, "children", childId));
            if (childSnap.exists()) {
              const childData = childSnap.data() as any;
              nome = String(childData?.name || nome).trim() || nome;
              sexo = String(childData?.sex || childData?.gender || sexo).trim() || sexo;
              dataNascimento = String(childData?.birthDate || "").trim();
            }
          } catch (err) {
            console.warn("Falha ao carregar dados do filho para cadastro base:", normalizedFamilyId, childId, err);
          }

          try {
            const userSnap = await getDoc(doc(db, "users", normalizedFamilyId));
            if (userSnap.exists()) {
              const profile = (userSnap.data() as any)?.profile || {};
              addressStreet = String(profile?.addressStreet || "").trim();
              addressNumber = String(profile?.addressNumber || "").trim();
              addressComplement = String(profile?.addressComplement || "").trim();
              addressNeighborhood = String(profile?.addressNeighborhood || "").trim();
              addressCity = String(profile?.addressCity || "").trim();
              addressUf = String(profile?.addressUf || "").trim();
              addressZip = String(profile?.addressZip || "").trim();
              telefonePrincipal = extractPrincipalWhatsapp(profile);
              whatsapp = String(profile?.whatsappDigits || profile?.whatsapp || profile?.phoneDigits || profile?.phone || "").trim();
            }
          } catch (err) {
            console.warn("Falha ao carregar perfil da família para cadastro base:", normalizedFamilyId, err);
          }

          const endereco = [
            addressStreet,
            addressNumber,
            addressComplement,
            addressNeighborhood,
            addressCity,
            addressUf,
            addressZip,
          ]
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .join(", ");

          await setDoc(
            doc(db, "patients", pacienteId),
            {
              codigo_unico_paciente: pacienteId,
              nome: nome || "Paciente",
              sexo: sexo || "nao_informado",
              data_nascimento: dataNascimento || "",
              endereco: endereco || "",
              address_street: addressStreet,
              address_number: addressNumber,
              address_complement: addressComplement,
              address_neighborhood: addressNeighborhood,
              address_city: addressCity,
              address_uf: addressUf,
              address_zip: addressZip,
              telefone_1_principal: telefonePrincipal || "",
              telefone_2: whatsapp || "",
              whatsapp: whatsapp || "",
              familyId: normalizedFamilyId,
              childId,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        const nextTotalLifetime = planStatus.totalLifetimePatients + effectiveNewLinksCount;
        const nextMonthCount = planStatus.currentMonthPatients + effectiveNewLinksCount;
        const reachedFreeLimit =
          planStatus.planType === "FREE" &&
          typeof planConfig.lifetimePatientsLimit === "number" &&
          nextTotalLifetime >= planConfig.lifetimePatientsLimit;
        const reachedPaidLimit =
          planStatus.planType !== "FREE" &&
          typeof planConfig.monthlyNewPatientsLimit === "number" &&
          nextMonthCount >= planConfig.monthlyNewPatientsLimit;
        await setDoc(
          doc(db, "supportNetwork", professional.id),
          {
            plano: planStatus.planType,
            plan_type: planStatus.planType,
            pacientes_vinculados_total: increment(effectiveNewLinksCount),
            pacientes_vinculados_mes: increment(effectiveNewLinksCount),
            total_pacientes_vinculados: increment(effectiveNewLinksCount),
            pacientes_mes_atual: increment(effectiveNewLinksCount),
            segundos_transcricao_restantes:
              Number.isFinite(Number((professional as any).segundos_transcricao_restantes))
                ? Number((professional as any).segundos_transcricao_restantes)
                : Number.isFinite(Number((professional as any).horas_transcricao_restantes))
                  ? Number((professional as any).horas_transcricao_restantes)
                  : planConfig.voiceHours * 3600,
            limite_mes_referencia: currentMonthRef,
            status_bloqueio: reachedFreeLimit || reachedPaidLimit,
            ia_habilitada: planConfig.aiEnabled,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await addDoc(collection(db, "professionalLinkEvents"), {
          professionalId: professional.id,
          type: "linked",
          familyId: normalizedFamilyId,
          requesterFullName: latest?.requesterFullName || null,
          requestedByEmail: latest?.requestedByEmail || null,
          sharedChildren: linkedChildren,
          createdAt: serverTimestamp(),
        });
        await notifyFamily(normalizedFamilyId, {
          title: "Vínculo aprovado",
          message: `Você foi vinculado ao profissional ${professional.name}.`,
          type: "LINK_APPROVED",
          metadata: { professionalId: professional.id, professionalName: professional.name },
        });
      } catch (postProcessingErr) {
        console.warn("Vínculo aprovado, mas houve falha em processamento complementar:", postProcessingErr);
      }
      setRequestCodeByRequestId((prev) => ({ ...prev, [request.id]: "" }));
    } catch (err) {
      console.error("Falha ao validar código de vínculo:", err);
      const message = String((err as any)?.message || "");
      const code = String((err as any)?.code || "");
      if (message.includes("permission-denied") || code.includes("permission-denied")) {
        if (planStatus.blockScope === "read_only") {
          alert("Limite atingido. Migre para o plano pago para continuar");
        } else if (planStatus.blockScope === "new_patient_only") {
          alert("Limite mensal do plano atingido. Não é possível vincular novos pacientes neste mês.");
        } else {
          alert("Permissão negada ao validar o código. Atualize a página e tente novamente.");
        }
      } else {
        alert(`Não foi possível validar o código agora. (${code || "erro_desconhecido"})`);
      }
    }
  };

  const handleUnlinkPatient = async (patient: PatientSummary) => {
    const confirmUnlink = window.confirm(`Desvincular ${patient.childName}?`);
    if (!confirmUnlink) return;
    try {
      const linkRef = doc(db, "professionalPatientLinks", patient.linkDocId || `${professional.id}__${patient.familyId}`);
      const linkSnap = await getDoc(linkRef);
      if (!linkSnap.exists()) return;
      const data = linkSnap.data() as any;
      const linkedChildIds = Array.isArray(data?.linkedChildIds) ? data.linkedChildIds.map((id: any) => String(id || "")).filter(Boolean) : [];
      if (patient.childId === "__family__" || linkedChildIds.length === 0) {
        await setDoc(linkRef, { status: "inactive", updatedAt: serverTimestamp() }, { merge: true });
      } else {
        const remaining = linkedChildIds.filter((id: string) => id !== patient.childId);
        await setDoc(
          linkRef,
          {
            linkedChildIds: remaining,
            linkedChildren: Array.isArray(data?.linkedChildren)
              ? data.linkedChildren.filter((child: any) => String(child?.id || "") !== patient.childId)
              : [],
            status: remaining.length > 0 ? "active" : "inactive",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await notifyFamily(patient.familyId, {
        title: "Desvinculado do profissional",
        message: `Você foi desvinculado de ${professional.name}.`,
        type: "LINK_REMOVED",
        metadata: { professionalId: professional.id, professionalName: professional.name, childId: patient.childId },
      });
      await addDoc(collection(db, "professionalLinkEvents"), {
        professionalId: professional.id,
        type: "unlinked",
        familyId: patient.familyId,
        childId: patient.childId,
        childName: patient.childName,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Falha ao desvincular paciente:", err);
      alert("Não foi possível desvincular agora.");
    }
  };

  const pushTemplateToLinkedPatients = async (template: OrientationTemplate, removeOnly = false) => {
    for (const scope of linkedScopes) {
      const childrenSnap = await getDocs(collection(db, "families", scope.familyId, "children"));
      for (const childDoc of childrenSnap.docs) {
        if (scope.childIds.length > 0 && !scope.childIds.includes(childDoc.id)) continue;
        const childData = childDoc.data() as Child;
        const currentHabits = Array.isArray(childData?.habits) ? childData.habits : [];
        let nextHabits = currentHabits.filter((habit: any) => String(habit?.sourceTemplateId || "") !== template.id);
        if (!removeOnly) {
          const now = new Date();
          const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const existingNames = new Set(nextHabits.map((habit: any) => String(habit.name || "").trim().toLowerCase()));
          const createdHabits: Habit[] = template.tasks
            .filter((taskName) => !existingNames.has(taskName.trim().toLowerCase()))
            .map((taskName): Habit => ({
              id: `habit-${crypto.randomUUID()}`,
              name: taskName,
              icon: "Book",
              reward: { type: RewardType.STARS, value: 1 },
              schedule: template.scheduleMode === "rigid"
                ? {
                    type: "DAILY",
                    mode: "rigid",
                    time: template.scheduleTime || "07:30",
                    reminderEnabled: Boolean(template.reminderEnabled),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
                  }
                : {
                    type: "DAILY",
                    mode: "flex",
                    period: template.schedulePeriod || "morning",
                    reminderEnabled: false,
                  },
              completions: {},
              source: "qrsaude",
              sourceTemplateId: template.id,
              sourceTaskName: taskName,
              prescribedByProfessionalId: professional.id,
              prescribedByProfessionalName: professional.name,
              prescribedByProfessionalPhotoUrl: professional.photoUrl || undefined,
              prescribedByProfessionalWhatsapp: professional.contacts?.whatsapp || undefined,
              prescribedAt: new Date().toISOString(),
              startDate: todayIso,
              endDate: addDaysIso(todayIso, Math.min(60, Math.max(1, Number(template.durationDays || 14)))),
              prescribedDurationDays: Math.min(60, Math.max(1, Number(template.durationDays || 14))),
              semanticTags: ["orientacao_profissional", "qrsaude"],
            }));
          nextHabits = [...nextHabits, ...createdHabits];
        }
        await setDoc(
          doc(db, "families", scope.familyId, "children", childDoc.id),
          { habits: nextHabits, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
      await notifyFamily(scope.familyId, {
        title: removeOnly ? "Orientação removida" : "Orientações atualizadas",
        message: removeOnly
          ? `A orientação "${template.name}" foi removida pelo profissional ${professional.name}.`
          : `A orientação "${template.name}" foi atualizada pelo profissional ${professional.name}.`,
        type: removeOnly ? "ORIENTATION_REMOVED" : "ORIENTATION_UPDATED",
        metadata: { professionalId: professional.id, templateId: template.id },
      });
    }
  };

  const handleRejectRequest = async (request: LinkRequest) => {
    try {
      await setDoc(
        doc(db, "professionalLinkRequests", request.id),
        {
          status: "rejected",
          decidedAt: serverTimestamp(),
          decidedByUid: auth.currentUser?.uid ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Falha ao rejeitar vínculo:", err);
      alert("Não foi possível rejeitar a solicitação.");
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    const goal = templateGoal.trim();
    const tasks = templateTasksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!name || tasks.length === 0) {
      alert("Informe nome da orientação e pelo menos uma tarefa.");
      return;
    }
    if (templateScheduleMode === "rigid" && !/^\d{2}:\d{2}$/.test(templateScheduleTime)) {
      alert("Informe um horário válido para orientação rígida.");
      return;
    }
    try {
      if (templateDurationDays < 1 || templateDurationDays > 60) {
        alert("A duração deve ser entre 1 e 60 dias.");
        return;
      }
      const payload = {
        professionalId: professional.id,
        name,
        goal,
        tasks,
        durationDays: Math.min(60, Math.max(1, Number(templateDurationDays || 14))),
        scheduleMode: templateScheduleMode,
        scheduleTime: templateScheduleMode === "rigid" ? templateScheduleTime : null,
        schedulePeriod: templateScheduleMode === "flex" ? templateSchedulePeriod : null,
        reminderEnabled: templateScheduleMode === "rigid" ? templateReminderEnabled : false,
        updatedAt: serverTimestamp(),
      };
      if (editingTemplateId) {
        await setDoc(doc(db, "professionalRoutineTemplates", editingTemplateId), payload, { merge: true });
        const updatedTemplate: OrientationTemplate = {
          id: editingTemplateId,
          name,
          goal,
          tasks,
          durationDays: Math.min(60, Math.max(1, Number(templateDurationDays || 14))),
          scheduleMode: templateScheduleMode,
          scheduleTime: templateScheduleMode === "rigid" ? templateScheduleTime : undefined,
          schedulePeriod: templateScheduleMode === "flex" ? templateSchedulePeriod : undefined,
          reminderEnabled: templateScheduleMode === "rigid" ? templateReminderEnabled : false,
        };
        if (window.confirm("Aplicar esta atualização automaticamente nos pacientes vinculados?")) {
          await pushTemplateToLinkedPatients(updatedTemplate, false);
        }
        alert("Orientação atualizada.");
      } else {
        const docRef = await addDoc(collection(db, "professionalRoutineTemplates"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSelectedTemplateId(docRef.id);
        alert("Orientação salva.");
      }
      setTemplateName("");
      setTemplateGoal("");
      setTemplateTasksText("");
      setTemplateDurationDays(14);
      setTemplateScheduleMode("flex");
      setTemplateScheduleTime("07:30");
      setTemplateSchedulePeriod("morning");
      setTemplateReminderEnabled(true);
      setEditingTemplateId(null);
    } catch (err) {
      console.error("Falha ao salvar orientação:", err);
      alert("Não foi possível salvar a orientação.");
    }
  };

  const handleSendOrientation = async () => {
    if (!selectedTemplateId || !selectedPatientKey) {
      alert("Selecione uma orientação e um paciente.");
      return;
    }
    const [familyId, childId] = selectedPatientKey.split("::");
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      alert("Orientação não encontrada.");
      return;
    }
    setIsSendingOrientation(true);
    try {
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const childRef = doc(db, "families", familyId, "children", childId);
      const childSnap = await getDoc(childRef);
      if (!childSnap.exists()) {
        alert("Paciente não encontrado.");
        return;
      }
      const childData = childSnap.data() as Child;
      const currentHabits = Array.isArray(childData?.habits) ? childData.habits : [];
      const existingNames = new Set(currentHabits.map((habit) => String(habit.name || "").trim().toLowerCase()));

      const createdHabits: Habit[] = template.tasks
        .filter((taskName) => !existingNames.has(taskName.trim().toLowerCase()))
        .map((taskName): Habit => ({
          id: `habit-${crypto.randomUUID()}`,
          name: taskName,
          icon: "Book",
          reward: { type: RewardType.STARS, value: 1 },
          schedule: template.scheduleMode === "rigid"
            ? {
                type: "DAILY",
                mode: "rigid",
                time: template.scheduleTime || "07:30",
                reminderEnabled: Boolean(template.reminderEnabled),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
              }
            : {
                type: "DAILY",
                mode: "flex",
                period: template.schedulePeriod || "morning",
                reminderEnabled: false,
              },
          completions: {},
          source: "qrsaude",
          prescribedByProfessionalId: professional.id,
          prescribedByProfessionalName: professional.name,
          prescribedByProfessionalPhotoUrl: professional.photoUrl || undefined,
          prescribedByProfessionalWhatsapp: professional.contacts?.whatsapp || undefined,
          prescribedAt: new Date().toISOString(),
          startDate: todayIso,
          endDate: addDaysIso(todayIso, Math.max(1, Number(template.durationDays || 14))),
          prescribedDurationDays: Math.min(60, Math.max(1, Number(template.durationDays || 14))),
          sourceTemplateId: template.id,
          sourceTaskName: taskName,
          semanticTags: ["orientacao_profissional", "qrsaude"],
        }));

      if (createdHabits.length === 0) {
        alert("Todas as tarefas desta orientação já existem para este paciente.");
        return;
      }

      await setDoc(
        childRef,
        {
          habits: [...currentHabits, ...createdHabits],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await addDoc(collection(db, "professionalOrientationEvents"), {
        professionalId: professional.id,
        familyId,
        childId,
        templateId: template.id,
        templateName: template.name,
        tasksCount: createdHabits.length,
        createdAt: serverTimestamp(),
      });
      await notifyFamily(familyId, {
        title: "Nova orientação disponível",
        message: `${professional.name} enviou uma nova orientação para ${childData.name || "você"}.`,
        type: "NEW_ORIENTATION",
        metadata: { professionalId: professional.id, templateId: template.id, childId },
      });
      alert(`Orientação enviada. ${createdHabits.length} tarefa(s) adicionada(s).`);
    } catch (err) {
      console.error("Falha ao enviar orientação:", err);
      alert("Não foi possível enviar a orientação agora.");
    } finally {
      setIsSendingOrientation(false);
    }
  };

  useEffect(() => {
    const currentMonthRef = new Date().toISOString().slice(0, 7);
    const savedMonthRef = String((professional as any).limite_mes_referencia || "");
    if (planStatus.planType === "FREE") return;
    if (savedMonthRef === currentMonthRef) return;
    void setDoc(
      doc(db, "supportNetwork", professional.id),
      {
        pacientes_vinculados_mes: 0,
        pacientes_mes_atual: 0,
        limite_mes_referencia: currentMonthRef,
        status_bloqueio: false,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => console.error("Falha ao resetar contador mensal do plano:", err));
  }, [professional.id, (professional as any).limite_mes_referencia, planStatus.planType]);

  useEffect(() => {
    const currentBlocked = Boolean((professional as any).status_bloqueio);
    if (currentBlocked === planStatus.isBlocked) return;
    void setDoc(
      doc(db, "supportNetwork", professional.id),
      { status_bloqueio: planStatus.isBlocked, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((err) => console.error("Falha ao sincronizar status de bloqueio do plano:", err));
  }, [professional.id, (professional as any).status_bloqueio, planStatus.isBlocked]);

  const setAttendanceField = <K extends keyof AttendanceDraft>(field: K, value: AttendanceDraft[K]) => {
    setAttendanceDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleStartAttendance = async (patient: PatientSummary) => {
    setPrimaryView("atendimento");
    const key = `${patient.familyId}::${patient.childId}`;
    setRecordPatientKey(key);
    setIsClinicalPanelOpen(true);
    setAttendanceStep("conference");
    setAttendanceProtocol(null);
    setPatientWorkspaceTab("sobre");
    setIsEditingAttendance(false);
    setIsLoadingAttendance(true);
    setAnamnesisTranscriptRaw("");
    setAnamnesisStructuredSummary("");
    setAnamnesisStructuredSummaryJson(null);
    setEditableAnamnesisSummary("");
    setShowExamPrompt(false);
    try {
      const pacienteId = await buildPatientUniqueCode(buildStablePatientSeed(patient.familyId, patient.childId));
      const patientDocRef = doc(db, "patients", pacienteId);
      const patientSnap = await getDoc(patientDocRef);
      const childSnap = await getDoc(doc(db, "families", patient.familyId, "children", patient.childId));
      const childData = childSnap.exists() ? (childSnap.data() as any) : {};
      const usersByFamily = await getDocs(query(collection(db, "users"), where("familyId", "==", patient.familyId), limit(1)));
      const fallbackProfile = usersByFamily.docs[0]?.data()?.profile || {};

      const persisted = patientSnap.exists() ? (patientSnap.data() as any) : {};
      const nome = String(persisted?.nome || childData?.name || patient.childName || "Paciente").trim();
      const apelido = String(persisted?.apelido || "").trim();
      const sexo = String(persisted?.sexo || childData?.sex || childData?.gender || "nao_informado").trim();
      const dataNascimento = String(persisted?.data_nascimento || childData?.birthDate || "").trim();
      const addressStreet = String(persisted?.address_street || fallbackProfile?.addressStreet || "").trim();
      const addressNumber = String(persisted?.address_number || fallbackProfile?.addressNumber || "").trim();
      const addressComplement = String(persisted?.address_complement || fallbackProfile?.addressComplement || "").trim();
      const addressNeighborhood = String(persisted?.address_neighborhood || fallbackProfile?.addressNeighborhood || "").trim();
      const addressCity = String(persisted?.address_city || fallbackProfile?.addressCity || "").trim();
      const addressUf = String(persisted?.address_uf || fallbackProfile?.addressUf || "").trim();
      const addressZip = String(persisted?.address_zip || fallbackProfile?.addressZip || "").trim();
      const telefonePrincipal = String(
        persisted?.telefone_1_principal || extractPrincipalWhatsapp(fallbackProfile) || ""
      ).trim();
      const whatsapp = String(
        persisted?.whatsapp || persisted?.telefone_2 || fallbackProfile?.whatsapp || fallbackProfile?.phone || ""
      ).trim();
      setAttendanceDraft({
        pacienteId,
        familyId: patient.familyId,
        childId: patient.childId,
        nome,
        apelido,
        sexo,
        dataNascimento,
        addressStreet,
        addressNumber,
        addressComplement,
        addressNeighborhood,
        addressCity,
        addressUf,
        addressZip,
        telefonePrincipal,
        whatsapp,
      });
      setActiveAttendancePatientId(pacienteId);

      const linksSnap = await getDocs(
        query(collection(db, "professionalPatientLinks"), where("familyId", "==", patient.familyId), where("status", "==", "active"))
      );
      const sharedCount = linksSnap.docs.filter((snap) => {
        const data = snap.data() as any;
        if (String(data?.professionalId || "") === professional.id) return false;
        const linkedChildIds = Array.isArray(data?.linkedChildIds) ? data.linkedChildIds.map((id: any) => String(id || "")) : [];
        return linkedChildIds.length === 0 || linkedChildIds.includes(patient.childId);
      }).length;
      setAttendanceSharedCount(sharedCount);
    } catch (err) {
      console.error("Falha ao carregar conferência do paciente:", err);
      alert("Não foi possível abrir a conferência deste paciente.");
      setAttendanceStep("idle");
    } finally {
      setIsLoadingAttendance(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSaveAndNext = async () => {
    if (!attendanceDraft) {
      alert("Selecione um paciente para conferência.");
      return;
    }
    if (!attendanceDraft.addressStreet.trim() || !attendanceDraft.addressCity.trim() || !attendanceDraft.addressUf.trim()) {
      alert("Endereço obrigatório. Preencha o endereço antes de continuar.");
      return;
    }
    setIsSavingAttendance(true);
    try {
      const endereco = [
        attendanceDraft.addressStreet,
        attendanceDraft.addressNumber,
        attendanceDraft.addressComplement,
        attendanceDraft.addressNeighborhood,
        attendanceDraft.addressCity,
        attendanceDraft.addressUf,
        attendanceDraft.addressZip,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ");
      await setDoc(
        doc(db, "patients", attendanceDraft.pacienteId),
        {
          codigo_unico_paciente: attendanceDraft.pacienteId,
          nome: attendanceDraft.nome.trim() || "Paciente",
          apelido: attendanceDraft.apelido.trim(),
          sexo: attendanceDraft.sexo.trim() || "nao_informado",
          data_nascimento: attendanceDraft.dataNascimento.trim(),
          endereco,
          address_street: attendanceDraft.addressStreet.trim(),
          address_number: attendanceDraft.addressNumber.trim(),
          address_complement: attendanceDraft.addressComplement.trim(),
          address_neighborhood: attendanceDraft.addressNeighborhood.trim(),
          address_city: attendanceDraft.addressCity.trim(),
          address_uf: attendanceDraft.addressUf.trim(),
          address_zip: attendanceDraft.addressZip.trim(),
          telefone_1_principal: attendanceDraft.telefonePrincipal.trim(),
          telefone_2: attendanceDraft.whatsapp.trim(),
          whatsapp: attendanceDraft.whatsapp.trim(),
          familyId: attendanceDraft.familyId,
          childId: attendanceDraft.childId,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setRecordPatientKey(`${attendanceDraft.familyId}::${attendanceDraft.childId}`);
      setActiveAttendancePatientId(attendanceDraft.pacienteId);
      setAttendanceStep("protocol");
      setIsEditingAttendance(false);
    } catch (err) {
      console.error("Falha ao salvar conferência do paciente:", err);
      alert("Não foi possível salvar os dados do paciente.");
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const handleChooseProtocol = (protocol: AttendanceProtocol) => {
    if (protocol !== "odontopediatria") return;
    setAttendanceProtocol(protocol);
    setAttendanceStep("anamnese");
    setPatientWorkspaceTab("anamnese");
    setIsClinicalPanelOpen(true);
    setCurrentAnamnesisQuestionIndex(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getWhatsappHref = (digits: string) => {
    const normalized = String(digits || "").replace(/\D/g, "");
    if (normalized.length < 10) return "";
    const withCountryCode = normalized.startsWith("55") ? normalized : `55${normalized}`;
    return `https://wa.me/${withCountryCode}`;
  };

  const handleCreateAppointment = async () => {
    if (!appointmentPatientKey) {
      alert("Selecione um paciente.");
      return;
    }
    if (!appointmentDate || !appointmentTime) {
      alert("Informe data e horário.");
      return;
    }
    const [familyId, childId] = appointmentPatientKey.split("::");
    const patient = patients.find((item) => `${item.familyId}::${item.childId}` === appointmentPatientKey);
    if (!patient || !familyId || !childId) {
      alert("Paciente inválido.");
      return;
    }
    const customTags = String(appointmentCustomTags || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const tags = normalizeAppointmentTags([appointmentPrimaryTag, ...appointmentExtraTags, ...customTags]);
    const startsAtIso = `${appointmentDate}T${appointmentTime}:00`;
    setIsSavingAppointment(true);
    try {
      await addDoc(collection(db, "professionalAppointments"), {
        professionalId: professional.id,
        familyId,
        childId,
        childName: patient.childName,
        startsAtIso,
        durationMin: Math.max(10, Number(appointmentDurationMin || 30)),
        notes: String(appointmentNotes || "").trim(),
        tags,
        patientStatus: "pending",
        syncToPatientCard: patient.source === "out" ? Boolean(patient.hasHabitusAccount) : true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAppointmentNotes("");
      setAppointmentPrimaryTag(APPOINTMENT_TAG_OPTIONS[0]);
      setAppointmentExtraTags([]);
      setAppointmentCustomTags("");
      alert("Consulta agendada.");
    } catch (err) {
      console.error("Falha ao criar consulta:", err);
      alert("Não foi possível criar a consulta.");
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const loadMyPatientEditDraft = async (item: MyPatientItem) => {
    setIsLoadingMyPatientEdit(true);
    try {
      const isOutPatient = item.source === "out";
      const pacienteId = isOutPatient
        ? String(item.patientId || item.childId || "").trim()
        : await buildPatientUniqueCode(buildStablePatientSeed(item.familyId, item.childId));
      if (!pacienteId) {
        throw new Error("PACIENTE_INVALIDO");
      }
      const patientSnap = await getDoc(doc(db, "patients", pacienteId));
      const childSnap = await getDoc(doc(db, "families", item.familyId, "children", item.childId));
      const usersByFamily = await getDocs(query(collection(db, "users"), where("familyId", "==", item.familyId), limit(1)));
      const fallbackProfile = usersByFamily.docs[0]?.data()?.profile || {};
      const persisted = patientSnap.exists() ? (patientSnap.data() as any) : {};
      setMyPatientEditDraft({
        pacienteId,
        familyId: item.familyId,
        childId: item.childId,
        nome: String(persisted?.nome || childSnap.data()?.name || item.childName || "Paciente").trim(),
        apelido: String(persisted?.apelido || "").trim(),
        sexo: String(persisted?.sexo || childSnap.data()?.sex || "nao_informado").trim(),
        dataNascimento: String(persisted?.data_nascimento || childSnap.data()?.birthDate || "").trim(),
        addressStreet: String(persisted?.address_street || fallbackProfile?.addressStreet || "").trim(),
        addressNumber: String(persisted?.address_number || fallbackProfile?.addressNumber || "").trim(),
        addressComplement: String(persisted?.address_complement || fallbackProfile?.addressComplement || "").trim(),
        addressNeighborhood: String(persisted?.address_neighborhood || fallbackProfile?.addressNeighborhood || "").trim(),
        addressCity: String(persisted?.address_city || fallbackProfile?.addressCity || "").trim(),
        addressUf: String(persisted?.address_uf || fallbackProfile?.addressUf || "").trim(),
        addressZip: String(persisted?.address_zip || fallbackProfile?.addressZip || "").trim(),
        telefonePrincipal: String(persisted?.telefone_1_principal || fallbackProfile?.phone || "").trim(),
        whatsapp: String(persisted?.whatsapp || persisted?.telefone_2 || fallbackProfile?.whatsapp || "").trim(),
      });
    } catch (err) {
      console.error("Falha ao carregar dados pessoais do paciente:", err);
      alert("Não foi possível carregar os dados pessoais.");
    } finally {
      setIsLoadingMyPatientEdit(false);
    }
  };

  const handleSaveMyPatientEdit = async () => {
    if (!myPatientEditDraft) return;
    setIsSavingMyPatientEdit(true);
    try {
      const endereco = [
        myPatientEditDraft.addressStreet,
        myPatientEditDraft.addressNumber,
        myPatientEditDraft.addressComplement,
        myPatientEditDraft.addressNeighborhood,
        myPatientEditDraft.addressCity,
        myPatientEditDraft.addressUf,
        myPatientEditDraft.addressZip,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ");
      await setDoc(
        doc(db, "patients", myPatientEditDraft.pacienteId),
        {
          codigo_unico_paciente: myPatientEditDraft.pacienteId,
          nome: myPatientEditDraft.nome.trim() || "Paciente",
          apelido: myPatientEditDraft.apelido.trim(),
          sexo: myPatientEditDraft.sexo.trim() || "nao_informado",
          data_nascimento: myPatientEditDraft.dataNascimento.trim(),
          endereco,
          address_street: myPatientEditDraft.addressStreet.trim(),
          address_number: myPatientEditDraft.addressNumber.trim(),
          address_complement: myPatientEditDraft.addressComplement.trim(),
          address_neighborhood: myPatientEditDraft.addressNeighborhood.trim(),
          address_city: myPatientEditDraft.addressCity.trim(),
          address_uf: myPatientEditDraft.addressUf.trim(),
          address_zip: myPatientEditDraft.addressZip.trim(),
          telefone_1_principal: myPatientEditDraft.telefonePrincipal.trim(),
          telefone_2: myPatientEditDraft.whatsapp.trim(),
          whatsapp: myPatientEditDraft.whatsapp.trim(),
          familyId: myPatientEditDraft.familyId,
          childId: myPatientEditDraft.childId,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Dados pessoais atualizados.");
    } catch (err) {
      console.error("Falha ao salvar dados pessoais:", err);
      alert("Não foi possível salvar os dados pessoais.");
    } finally {
      setIsSavingMyPatientEdit(false);
    }
  };

  const loadPatientTimeline = async (item: MyPatientItem) => {
    const key = `${item.familyId}::${item.childId}`;
    setIsLoadingPatientTimeline(true);
    try {
      const timeline: PatientTimelineEntry[] = [];
      const patientEvents = linkEvents
        .filter((event) => event.familyId === item.familyId && String(event.childId || "") === item.childId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      patientEvents.forEach((event) => {
        timeline.push({
          id: `event-${event.id}`,
          atMs: event.createdAtMs,
          title: event.type === "linked" ? "Vínculo criado" : "Vínculo encerrado",
          description: event.type === "linked" ? "Paciente vinculado ao profissional." : "Paciente desvinculado do profissional.",
        });
      });

      try {
        const entriesSnap = await getDocs(
          query(
            collection(db, "professionalClinicalRecordEntries"),
            where("professional_id", "==", professional.id),
            where("familyId", "==", item.familyId),
            where("childId", "==", item.childId),
            limit(100)
          )
        );
        entriesSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const createdMs = timestampToMs(data?.createdAt) || Date.parse(String(data?.created_at_iso || "")) || Date.now();
          const payload = data?.payload || {};
          const summary = String(
            payload?.anamnese_odontopediatria?.resumo_estruturado ||
            payload?.chiefComplaint ||
            payload?.currentIllnessHistory ||
            "Registro clínico salvo."
          )
            .replace(/\s+/g, " ")
            .slice(0, 180);
          timeline.push({
            id: `entry-${docSnap.id}`,
            atMs: createdMs,
            title: "Consulta / registro",
            description: summary || "Sem resumo disponível.",
          });
        });
      } catch (err) {
        console.warn("Falha ao carregar entradas do prontuário para timeline:", err);
      }

      const sorted = timeline.sort((a, b) => a.atMs - b.atMs);
      setPatientTimelineByKey((prev) => ({ ...prev, [key]: sorted }));
    } finally {
      setIsLoadingPatientTimeline(false);
    }
  };

  const handleAgendaToday = () => {
    setAgendaReferenceDate(toIsoDate(new Date()));
  };

  const handleAgendaShift = (delta: number) => {
    const base = new Date(`${agendaReferenceDate}T00:00:00`);
    if (!Number.isFinite(base.getTime())) return;
    const next = new Date(base);
    if (agendaViewMode === "month") {
      next.setMonth(next.getMonth() + delta);
    } else if (agendaViewMode === "week") {
      next.setDate(next.getDate() + delta * 7);
    } else {
      next.setDate(next.getDate() + delta);
    }
    setAgendaReferenceDate(toIsoDate(next));
  };

  const moveAppointmentToDay = async (appointmentId: string, targetIso: string) => {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    const source = new Date(appointment.startsAtIso);
    if (!Number.isFinite(source.getTime())) return;
    const time = `${String(source.getHours()).padStart(2, "0")}:${String(source.getMinutes()).padStart(2, "0")}:00`;
    const startsAtIso = `${targetIso}T${time}`;
    try {
      await setDoc(
        doc(db, "professionalAppointments", appointment.id),
        {
          startsAtIso,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Falha ao mover consulta:", err);
      alert("Não foi possível mover a consulta.");
    }
  };

  const handleCancelAppointmentByProfessional = async (appointment: ProfessionalAppointment) => {
    const whenLabel = new Date(appointment.startsAtIso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const confirmed = window.confirm(
      `Cancelar a consulta de ${appointment.childName} em ${whenLabel}?\n\n` +
      `Essa ação também será registrada no dashboard do usuário como cancelada pelo profissional.`
    );
    if (!confirmed) return;
    const previousAppointment = { ...appointment };
    setAppointments((prev) =>
      prev.map((item) =>
        item.id === appointment.id
          ? { ...item, patientStatus: "cancelled", cancelledByProfessional: true, cancelledByPatient: false }
          : item
      )
    );
    try {
      await setDoc(
        doc(db, "professionalAppointments", appointment.id),
        {
          patientStatus: "cancelled",
          patientStatusAt: serverTimestamp(),
          patientStatusByUid: auth.currentUser?.uid || null,
          cancelledByProfessional: true,
          cancelledByPatient: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (appointment.familyId && !appointment.familyId.startsWith("out_")) {
        await notifyFamily(appointment.familyId, {
          title: "Consulta cancelada pelo profissional",
          message: `${professional.name} cancelou a consulta de ${appointment.childName} agendada para ${whenLabel}.`,
          type: "appointment_cancelled_by_professional",
          metadata: {
            professionalId: professional.id,
            professionalName: professional.name,
            childId: appointment.childId,
            startsAtIso: appointment.startsAtIso,
            appointmentId: appointment.id,
          },
        });
      }
      alert("Consulta cancelada.");
    } catch (err) {
      setAppointments((prev) => prev.map((item) => (item.id === appointment.id ? previousAppointment : item)));
      console.error("Falha ao cancelar consulta:", err);
      alert("Não foi possível cancelar a consulta.");
    }
  };

  const getAppointmentVisual = (appointment: ProfessionalAppointment) => {
    if (appointment.patientStatus === "confirmed") {
      return {
        card: "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm",
        title: "text-blue-900",
        badge: "bg-blue-600 text-white",
        badgeLabel: "Confirmada",
      };
    }
    if (appointment.patientStatus === "cancelled") {
      return {
        card: "border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 shadow-sm",
        title: "text-rose-900",
        badge: "bg-rose-600 text-white",
        badgeLabel: appointment.cancelledByProfessional ? "Cancelada por você" : "Cancelada pelo paciente",
      };
    }
    return {
      card: "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-sm",
      title: "text-amber-900",
      badge: "bg-amber-500 text-white",
      badgeLabel: "Aguardando confirmação",
    };
  };

  const setMyPatientEditField = <K extends keyof AttendanceDraft>(field: K, value: AttendanceDraft[K]) => {
    setMyPatientEditDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="sticky top-0 z-40 bg-slate-100/95 backdrop-blur-sm pb-2 space-y-2">
        <header className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 md:p-4 flex items-start justify-between gap-3 relative">
          <div className="flex items-center gap-3 pr-24 md:pr-0">
            <img
              src={professional.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(professional.name)}&background=random`}
              alt={professional.name}
              onError={(event) => {
                event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(professional.name)}&background=random`;
              }}
              className="w-12 h-12 rounded-full object-cover border border-slate-200"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">{professional.name}</h1>
              <p className="text-xs text-slate-500">{professional.specialties?.join(", ") || professional.specialty}</p>
              <div className="mt-1 flex items-center">
                <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 tracking-wide">
                  {getPlanLabel(professional.tier)}
                </span>
              </div>
            </div>
          </div>
          <div className="absolute top-3 right-3 md:static flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsHeaderMenuOpen((prev) => !prev)}
                className="h-10 w-10 rounded-lg border border-gray-300 text-slate-700 font-black"
                aria-label="Abrir menu"
              >
                ☰
              </button>
              <button
                onClick={() => signOut(auth)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-slate-700 hover:bg-gray-50"
              >
                Sair
              </button>
            </div>
            <span className="text-[10px] font-semibold text-slate-600 text-right">
              {professional.city || "Cidade"} / {professional.uf || "UF"}
            </span>
          </div>
          {isHeaderMenuOpen && (
            <div className="absolute right-3 top-16 z-20 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setIsProfilePanelOpen((prev) => !prev);
                  setIsHeaderMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-semibold text-slate-700"
              >
                Perfil profissional
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsKpiPanelOpen((prev) => !prev);
                  setIsHeaderMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-semibold text-slate-700"
              >
                Indicadores
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrimaryView("atendimento");
                  setAttendanceProtocol("odontopediatria");
                  setAttendanceStep("anamnese");
                  setIsClinicalPanelOpen(true);
                  setIsQuestionConfigOpen(true);
                  setIsHeaderMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-semibold text-slate-700"
              >
                Configurar anamnese
              </button>
            </div>
          )}
        </header>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPrimaryView("pacientes")}
              className={`px-3 py-2 rounded-lg text-sm font-bold border ${
                primaryView === "pacientes" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              Pacientes
            </button>
            <button
              type="button"
              onClick={() => setPrimaryView("agenda")}
              className={`px-3 py-2 rounded-lg text-sm font-bold border ${
                primaryView === "agenda" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => setPrimaryView("atendimento")}
              className={`px-3 py-2 rounded-lg text-sm font-bold border ${
                primaryView === "atendimento" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              Atendimento
            </button>
          </div>
        </section>
        </div>

        {(isProfilePanelOpen || isKpiPanelOpen) && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            {isProfilePanelOpen && (
              <div className="space-y-2 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-900">Perfil profissional</h2>
                  <button type="button" onClick={() => setIsProfilePanelOpen(false)} className="text-xs font-bold text-slate-600">Ocultar</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-slate-600">Título curto de apresentação</p>
                      <span className="text-xs font-semibold text-slate-500">{headlineDraft.length}/{PROFESSIONAL_HEADLINE_MAX}</span>
                    </div>
                    <input value={headlineDraft} onChange={(e) => setHeadlineDraft(e.target.value.slice(0, PROFESSIONAL_HEADLINE_MAX))} placeholder="Ex.: Odontologia inclusiva" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-slate-600">Palavras-chave para match (máx. 5)</p>
                      <span className={`text-xs font-semibold ${keywordCount > 5 ? "text-rose-600" : "text-slate-500"}`}>{keywordCount}/5</span>
                    </div>
                    <input value={keywordDraft} onChange={(e) => setKeywordDraft(e.target.value)} placeholder="Ex.: autismo, crianças, dente" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-slate-600">Bio curta</p>
                      <span className="text-xs text-slate-500">{bioDraft.length}/{PROFESSIONAL_BIO_MAX}</span>
                    </div>
                    <textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value.slice(0, PROFESSIONAL_BIO_MAX))} placeholder="Ex.: Atendo crianças, bebês e pacientes atípicos com foco em acolhimento." className="h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold text-slate-600 mb-1">Destaques públicos</p>
                    <input value={highlightsDraft} onChange={(e) => setHighlightsDraft(e.target.value)} placeholder="Ex.: Atípicos, Bebês, Crianças" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Site</p>
                    <input value={websiteDraft} onChange={(e) => setWebsiteDraft(e.target.value)} placeholder="https://" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Instagram</p>
                    <input value={instagramDraft} onChange={(e) => setInstagramDraft(e.target.value)} placeholder="@seuusuario" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">YouTube</p>
                    <input value={youtubeDraft} onChange={(e) => setYoutubeDraft(e.target.value)} placeholder="Canal ou link" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Vídeo de apresentação</p>
                    <input value={videoUrlDraft} onChange={(e) => setVideoUrlDraft(e.target.value)} placeholder="URL de vídeo/playlist" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Telefone (somente leitura)</p>
                    <input value={professional.contacts?.phone || professional.contacts?.whatsapp || "Não informado"} readOnly disabled className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full bg-slate-100 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Localização (somente leitura)</p>
                    <input value={`${professional.city || "Cidade não informada"}/${professional.uf || "UF"}`} readOnly disabled className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full bg-slate-100 text-slate-600" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => { void handleSaveProfessionalProfile(); }} disabled={isSavingProfile} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-60">
                    {isSavingProfile ? "Salvando..." : "Salvar perfil"}
                  </button>
                </div>
              </div>
            )}
            {isKpiPanelOpen && (
              <div className="space-y-2 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-900">Indicadores</h2>
                  <button type="button" onClick={() => setIsKpiPanelOpen(false)} className="text-xs font-bold text-slate-600">Ocultar</button>
                </div>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
                  <p><span className="font-bold">Plano:</span> {planStatus.planType}</p>
                  <p><span className="font-bold">Total vinculados (vitalício):</span> {planStatus.totalLifetimePatients}</p>
                  <p><span className="font-bold">Pacientes no mês:</span> {planStatus.currentMonthPatients}</p>
                  <p><span className="font-bold">Transcrição restante:</span> {Math.max(0, Math.floor(planStatus.transcriptionSecondsRemaining / 60))} min</p>
                  <p><span className="font-bold">Bloqueio:</span> {planStatus.isBlocked ? "Ativo" : "Inativo"}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Vínculos ativos</p><p className="text-lg font-black text-slate-800">{patientCount}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Total vinculados</p><p className="text-lg font-black text-emerald-700">{linkedCountAllTime}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Total desvinculados</p><p className="text-lg font-black text-rose-700">{unlinkedCountAllTime}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Adesão média (7d)</p><p className="text-lg font-black text-slate-800">{adherenceAverage}%</p></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Solicitações totais</p><p className="text-lg font-black text-slate-800">{linkRequests.length}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Aprovadas</p><p className="text-lg font-black text-emerald-700">{approvedRequests.length}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Rejeitadas</p><p className="text-lg font-black text-rose-700">{rejectedRequests.length}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Pendentes</p><p className="text-lg font-black text-amber-700">{pendingRequests.length}</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Taxa de aprovação</p><p className="text-lg font-black text-slate-800">{approvalRate}%</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Tempo médio aprovação</p><p className="text-lg font-black text-slate-800">{avgApprovalHours === null ? "—" : `${avgApprovalHours}h`}</p></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Impressões totais</p><p className="text-lg font-black text-slate-800">{adStats.impressions}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">Contatos totais</p><p className="text-lg font-black text-slate-800">{totalContactClicks}</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">CTR total</p><p className="text-lg font-black text-slate-800">{ctrTotal.toFixed(2)}%</p></div>
                  <div className="rounded-lg border border-slate-200 p-2"><p className="text-[11px] text-slate-500">CTR 7 dias</p><p className="text-lg font-black text-slate-800">{ctr7d.toFixed(2)}%</p></div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2">
                  <p className="text-[11px] text-slate-500 mb-1">Origem das solicitações</p>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">CPF paciente: {sourceStats.cpf}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">Outros: {sourceStats.other}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {(primaryView === "pacientes" || primaryView === "atendimento") && (
        <>
        {primaryView === "pacientes" && (
        <>
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="font-bold text-slate-900 mb-2">Vincular paciente</h2>
            {planStatus.blockScope !== "none" && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                {planStatus.blockScope === "read_only"
                  ? "Limite atingido. Migre para o plano pago para continuar"
                  : `Limite mensal de ${planConfig.monthlyNewPatientsLimit} novos pacientes atingido. Vinculação temporariamente bloqueada.`}
              </div>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={cpfRequestInput}
                onChange={(e) => setCpfRequestInput(formatCpf(e.target.value))}
                placeholder="CPF do paciente (000.000.000-00)"
                type="tel"
                inputMode="numeric"
                maxLength={14}
                pattern="\d{3}\.\d{3}\.\d{3}-\d{2}"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white min-w-0"
              />
              <button
                type="button"
                onClick={() => { void handleRequestByCpf(); }}
                disabled={isCreatingCpfRequest || !planStatus.canCreateNewPatients}
                className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-60 whitespace-nowrap"
              >
                {isCreatingCpfRequest ? "Buscando..." : "Buscar CPF"}
              </button>
            </div>
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
              {pendingRequests.length === 0 && <p className="text-xs text-slate-500">Nenhuma solicitação pendente.</p>}
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-700">CPF {maskCpf(request.patientCpfDigits || request.requesterCpf || "")}</p>
                  <p className="text-[11px] text-slate-500">Status: {request.status === "pending_user" ? "aguardando autorização" : "aguardando código"}</p>
                  <div className="mt-2 flex gap-2">
                    {request.status === "pending_code" && (
                      <>
                        <input value={requestCodeByRequestId[request.id] || ""} onChange={(e) => setRequestCodeByRequestId((prev) => ({ ...prev, [request.id]: e.target.value }))} placeholder="Código de 6 dígitos" className="px-2 py-1 border border-slate-300 rounded text-xs" />
                        <button type="button" onClick={() => { void handleValidatePatientCode(request); }} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold">Validar</button>
                      </>
                    )}
                    <button type="button" onClick={() => { void handleRejectRequest(request); }} className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs font-bold">Rejeitar</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-sm font-bold text-sky-900">Adicionar paciente (Out)</p>
              <p className="text-xs text-sky-800">Se o CPF não existir no Habitus, a ficha OUT é habilitada aqui automaticamente.</p>
              {showOutPatientForm && (
                <div className="rounded-lg border border-sky-200 bg-white p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={outPatientDraft.cpf} readOnly className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100" />
                    <input value={outPatientDraft.nome} onChange={(e) => setOutPatientField("nome", e.target.value)} placeholder="Nome completo" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <select value={outPatientDraft.sexo} onChange={(e) => setOutPatientField("sexo", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="nao_informado">Sexo não informado</option>
                      <option value="feminino">Feminino</option>
                      <option value="masculino">Masculino</option>
                    </select>
                    <input value={outPatientDraft.apelido} onChange={(e) => setOutPatientField("apelido", e.target.value)} placeholder="Apelido" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input type="date" value={outPatientDraft.dataNascimento} onChange={(e) => setOutPatientField("dataNascimento", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.responsavelLegalNome} onChange={(e) => setOutPatientField("responsavelLegalNome", e.target.value)} placeholder="Responsável legal (obrigatório se menor de 18)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                    <input value={outPatientDraft.responsavelLegalTelefone} onChange={(e) => setOutPatientField("responsavelLegalTelefone", e.target.value)} placeholder="Telefone do responsável legal" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                    <input
                      value={outPatientDraft.addressZip}
                      onChange={(e) => setOutPatientField("addressZip", formatCep(e.target.value))}
                      onBlur={() => { void handleLookupOutPatientCep(); }}
                      placeholder="CEP"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="px-3 py-2 text-xs text-slate-500">{isLookingUpOutPatientCep ? "Buscando CEP..." : "Preencha manualmente se não souber o CEP."}</div>
                    <input value={outPatientDraft.addressStreet} onChange={(e) => setOutPatientField("addressStreet", e.target.value)} placeholder="Rua" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressNumber} onChange={(e) => setOutPatientField("addressNumber", e.target.value)} placeholder="Número" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressComplement} onChange={(e) => setOutPatientField("addressComplement", e.target.value)} placeholder="Complemento" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressNeighborhood} onChange={(e) => setOutPatientField("addressNeighborhood", e.target.value)} placeholder="Bairro" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressCity} onChange={(e) => setOutPatientField("addressCity", e.target.value)} placeholder="Cidade" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressUf} onChange={(e) => setOutPatientField("addressUf", e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.telefonePrincipal} onChange={(e) => setOutPatientField("telefonePrincipal", e.target.value)} placeholder="Telefone celular" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.whatsapp} onChange={(e) => setOutPatientField("whatsapp", e.target.value)} placeholder="WhatsApp" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.email} onChange={(e) => setOutPatientField("email", e.target.value)} placeholder="E-mail" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void handleSaveOutPatient(); }}
                      disabled={isSavingOutPatient}
                      className="px-3 py-2 rounded-lg bg-sky-700 text-white text-xs font-bold disabled:opacity-60"
                    >
                      {isSavingOutPatient ? "Salvando..." : "Salvar paciente"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowOutPatientForm(false)}
                      className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="font-bold text-slate-900 mb-2">Meus pacientes</h2>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMyPatientsFilter("none")}
                className={`px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold border ${myPatientsFilter === "none" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-300"}`}
              >
                Nenhum
              </button>
              <button
                type="button"
                onClick={() => setMyPatientsFilter("active")}
                className={`px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold border ${myPatientsFilter === "active" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-300"}`}
              >
                Vinc ativo
              </button>
              <button
                type="button"
                onClick={() => setMyPatientsFilter("inactive")}
                className={`px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold border ${myPatientsFilter === "inactive" ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-700 border-slate-300"}`}
              >
                Vinc inativo
              </button>
              <button
                type="button"
                onClick={() => setMyPatientsFilter("all")}
                className={`px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold border ${myPatientsFilter === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setMyPatientsFilter("out")}
                className={`px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold border ${myPatientsFilter === "out" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-700 border-slate-300"}`}
              >
                Out
              </button>
            </div>
            <input
              value={myPatientsSearch}
              onChange={(e) => setMyPatientsSearch(e.target.value)}
              placeholder="Buscar por nome ou CPF"
              className="mb-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
            {loadingPatients && <p className="text-sm text-slate-500">Carregando pacientes...</p>}
            {!loadingPatients && myPatientsFilter === "none" && !myPatientsSearch.trim() && (
              <p className="text-sm text-slate-500">Selecione um filtro ou digite nome/CPF para listar pacientes.</p>
            )}
            {!loadingPatients && !(myPatientsFilter === "none" && !myPatientsSearch.trim()) && filteredMyPatients.length === 0 && (
              <p className="text-sm text-slate-500">Nenhum paciente encontrado.</p>
            )}
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredMyPatients.map((patient) => {
                const isOutPendingSignup = patient.source === "out" && !patient.hasHabitusAccount;
                return (
                  <div key={patient.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{patient.childName}</p>
                        <p className="text-xs text-slate-500">{patient.ageLabel || "Idade não informada"}</p>
                        <p className="text-xs text-slate-500">Resp#1: {patient.firstLinkOwner}</p>
                        {patient.source === "out" && (
                          <p className="mt-1 inline-flex rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">OUT</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          title={
                            patient.isActive
                              ? isOutPendingSignup
                                ? "Vínculo ativo (aguardando cadastro no Habitus)"
                                : "Vínculo ativo"
                              : "Sem vínculo ativo"
                          }
                          className={`px-2 py-1 rounded-lg text-xs font-bold ${
                            patient.isActive
                              ? isOutPendingSignup
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700 animate-pulse"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          ●
                        </span>
                        <button
                          type="button"
                          title="Ver resumo"
                          aria-label="Ver resumo"
                          onClick={() => {
                            setSelectedMyPatientKey(patient.key);
                            setSelectedMyPatientPanel("summary");
                            void loadPatientTimeline(patient);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"
                        >
                          ≡
                        </button>
                        <button
                          type="button"
                          title="Editar dados pessoais"
                          aria-label="Editar dados pessoais"
                          onClick={() => {
                            setSelectedMyPatientKey(patient.key);
                            setSelectedMyPatientPanel("edit");
                            void loadMyPatientEditDraft(patient);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          title="Log de vínculos"
                          aria-label="Log de vínculos"
                          onClick={() => {
                            setSelectedMyPatientKey(patient.key);
                            setSelectedMyPatientPanel("log");
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"
                        >
                          ⧉
                        </button>
                        {patient.isActive && (
                          <button
                            type="button"
                            title="Desvincular"
                            aria-label="Desvincular"
                            onClick={() => {
                              const activePatient = patients.find((item) => `${item.familyId}::${item.childId}` === patient.key);
                              if (!activePatient) return;
                              void handleUnlinkPatient(activePatient);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-xs font-bold"
                          >
                            ⊗
                          </button>
                        )}
                        {patient.isActive && patient.source === "out" && !patient.hasHabitusAccount && (
                          <button
                            type="button"
                            title="Convidar por WhatsApp"
                            aria-label="Convidar por WhatsApp"
                            onClick={() => handleSendOutPatientWhatsappInvite(patient)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                          >
                            WA
                          </button>
                        )}
                        {patient.isActive && patient.source === "out" && patient.hasHabitusAccount && (
                          <button
                            type="button"
                            title="Converter para vínculo oficial"
                            aria-label="Converter para vínculo oficial"
                            onClick={() => { void handleConvertOutToOfficialLink(patient); }}
                            disabled={isCreatingCpfRequest}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold disabled:opacity-60"
                          >
                            Converter
                          </button>
                        )}
                        {patient.isActive && (
                          <button
                            type="button"
                            title="Atender"
                            aria-label="Atender"
                            onClick={() => {
                              const activePatient = patients.find((item) => `${item.familyId}::${item.childId}` === patient.key);
                              if (!activePatient) return;
                              handleStartAttendance(activePatient);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"
                          >
                            ▶
                          </button>
                        )}
                      </div>
                    </div>
                    {selectedMyPatientKey === patient.key && selectedMyPatientPanel === "summary" && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-800 mb-2">Timeline de atendimento</p>
                        {isLoadingPatientTimeline && <p className="text-xs text-slate-500">Carregando timeline...</p>}
                        {!isLoadingPatientTimeline && (patientTimelineByKey[patient.key] || []).length === 0 && (
                          <p className="text-xs text-slate-500">Sem histórico para exibir.</p>
                        )}
                        {!isLoadingPatientTimeline && (patientTimelineByKey[patient.key] || []).length > 0 && (
                          <div className="space-y-2">
                            {(patientTimelineByKey[patient.key] || []).map((entry) => (
                              <div key={entry.id} className="rounded border border-slate-200 bg-white p-2">
                                <p className="text-xs font-bold text-slate-800">{entry.title}</p>
                                <p className="text-[11px] text-slate-500">{new Date(entry.atMs).toLocaleString("pt-BR")}</p>
                                <p className="text-xs text-slate-700 mt-1">{entry.description}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedMyPatientKey === patient.key && selectedMyPatientPanel === "edit" && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <p className="text-sm font-semibold text-slate-800">Ficha de dados pessoais</p>
                        {isLoadingMyPatientEdit && <p className="text-xs text-slate-500">Carregando ficha...</p>}
                        {!isLoadingMyPatientEdit && myPatientEditDraft && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input value={myPatientEditDraft.nome} onChange={(e) => setMyPatientEditField("nome", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Nome" />
                              <input value={myPatientEditDraft.apelido} onChange={(e) => setMyPatientEditField("apelido", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Apelido" />
                              <input type="date" value={myPatientEditDraft.dataNascimento} onChange={(e) => setMyPatientEditField("dataNascimento", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                              <select value={myPatientEditDraft.sexo} onChange={(e) => setMyPatientEditField("sexo", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                                <option value="nao_informado">Sexo não informado</option>
                                <option value="feminino">Feminino</option>
                                <option value="masculino">Masculino</option>
                              </select>
                              <input value={myPatientEditDraft.addressStreet} onChange={(e) => setMyPatientEditField("addressStreet", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Rua" />
                              <input value={myPatientEditDraft.addressNumber} onChange={(e) => setMyPatientEditField("addressNumber", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Número" />
                              <input value={myPatientEditDraft.addressNeighborhood} onChange={(e) => setMyPatientEditField("addressNeighborhood", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Bairro" />
                              <input value={myPatientEditDraft.addressCity} onChange={(e) => setMyPatientEditField("addressCity", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Cidade" />
                              <input value={myPatientEditDraft.addressUf} onChange={(e) => setMyPatientEditField("addressUf", e.target.value.toUpperCase().slice(0, 2))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="UF" />
                              <input value={myPatientEditDraft.addressZip} onChange={(e) => setMyPatientEditField("addressZip", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="CEP" />
                              <input value={myPatientEditDraft.telefonePrincipal} onChange={(e) => setMyPatientEditField("telefonePrincipal", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Telefone principal" />
                              <input value={myPatientEditDraft.whatsapp} onChange={(e) => setMyPatientEditField("whatsapp", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="WhatsApp" />
                            </div>
                            <button
                              type="button"
                              onClick={() => { void handleSaveMyPatientEdit(); }}
                              disabled={isSavingMyPatientEdit}
                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
                            >
                              {isSavingMyPatientEdit ? "Salvando..." : "Salvar"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {selectedMyPatientKey === patient.key && selectedMyPatientPanel === "log" && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-800 mb-2">Log de vínculos</p>
                        <div className="space-y-1">
                          {linkEvents
                            .filter((event) => event.familyId === patient.familyId && String(event.childId || "") === patient.childId)
                            .sort((a, b) => b.createdAtMs - a.createdAtMs)
                            .map((event) => (
                              <div key={event.id} className="text-xs text-slate-700">
                                {event.type === "linked" ? "Vinculado" : "Desvinculado"} em {new Date(event.createdAtMs).toLocaleString("pt-BR")}
                              </div>
                            ))}
                          {linkEvents.filter((event) => event.familyId === patient.familyId && String(event.childId || "") === patient.childId).length === 0 && (
                            <p className="text-xs text-slate-500">Sem eventos de vínculo para este paciente.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        </>
        )}

        {primaryView === "atendimento" && attendanceStep === "idle" && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-sm text-slate-700">
              Selecione um paciente em `Pacientes` e clique em `Atender` para iniciar.
            </p>
          </section>
        )}

        {primaryView === "atendimento" && attendanceStep !== "idle" && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Conferência do paciente</h2>
                <p className="text-xs text-slate-500">Valide os dados antes de iniciar a anamnese.</p>
              </div>
              {attendanceSharedCount > 0 && (
                <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800">
                  Paciente compartilhado
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setPatientWorkspaceTab("sobre")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  patientWorkspaceTab === "sobre" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                Sobre
              </button>
              <button
                type="button"
                onClick={() => setPatientWorkspaceTab("anamnese")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  patientWorkspaceTab === "anamnese" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                Anamnese
              </button>
              <button
                type="button"
                onClick={() => setPatientWorkspaceTab("documentos")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  patientWorkspaceTab === "documentos" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                Documentos
              </button>
            </div>

            {patientWorkspaceTab === "sobre" && isLoadingAttendance && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Carregando dados do paciente...
              </div>
            )}

            {patientWorkspaceTab === "sobre" && !isLoadingAttendance && attendanceDraft && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    value={attendanceDraft.nome}
                    onChange={(e) => setAttendanceField("nome", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Nome completo"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.apelido}
                    onChange={(e) => setAttendanceField("apelido", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Apelido / abreviação"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <select
                    value={attendanceDraft.sexo}
                    onChange={(e) => setAttendanceField("sexo", e.target.value)}
                    disabled={!isEditingAttendance}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 bg-white"
                  >
                    <option value="nao_informado">Sexo não informado</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                  </select>
                  <input
                    type="date"
                    value={attendanceDraft.dataNascimento}
                    onChange={(e) => setAttendanceField("dataNascimento", e.target.value)}
                    disabled={!isEditingAttendance}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />

                  <input
                    value={attendanceDraft.addressStreet}
                    onChange={(e) => setAttendanceField("addressStreet", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Rua"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.addressNumber}
                    onChange={(e) => setAttendanceField("addressNumber", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Número"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.addressComplement}
                    onChange={(e) => setAttendanceField("addressComplement", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Complemento"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.addressNeighborhood}
                    onChange={(e) => setAttendanceField("addressNeighborhood", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Bairro"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.addressCity}
                    onChange={(e) => setAttendanceField("addressCity", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="Cidade"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.addressUf}
                    onChange={(e) => setAttendanceField("addressUf", e.target.value.toUpperCase().slice(0, 2))}
                    disabled={!isEditingAttendance}
                    placeholder="UF"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={attendanceDraft.addressZip}
                    onChange={(e) => setAttendanceField("addressZip", e.target.value)}
                    disabled={!isEditingAttendance}
                    placeholder="CEP"
                    className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                  {(!attendanceDraft.addressStreet.trim() || !attendanceDraft.addressCity.trim() || !attendanceDraft.addressUf.trim()) && (
                    <p className="md:col-span-2 text-xs text-rose-700 font-semibold">
                      Endereço obrigatório para prosseguir no atendimento.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">Telefone Principal</p>
                    <input
                      value={attendanceDraft.telefonePrincipal}
                      onChange={(e) => setAttendanceField("telefonePrincipal", e.target.value)}
                      disabled={!isEditingAttendance}
                      placeholder="Telefone principal"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full disabled:bg-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">WhatsApp</p>
                    <input
                      value={attendanceDraft.whatsapp}
                      onChange={(e) => setAttendanceField("whatsapp", e.target.value)}
                      disabled={!isEditingAttendance}
                      placeholder="WhatsApp"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingAttendance((prev) => !prev)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700"
                  >
                    {isEditingAttendance ? "Bloquear edição" : "Editar Tudo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleSaveAndNext(); }}
                    disabled={isSavingAttendance || !attendanceDraft.addressStreet.trim() || !attendanceDraft.addressCity.trim() || !attendanceDraft.addressUf.trim()}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
                  >
                    {isSavingAttendance ? "Salvando..." : "Salvar e Continuar"}
                  </button>
                </div>
              </>
            )}

            {attendanceStep === "protocol" && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900">Escolha de protocolo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleChooseProtocol("odontopediatria")}
                    className="h-20 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-900 text-lg font-black"
                  >
                    Odontopediatria
                  </button>
                  <button
                    type="button"
                    disabled
                    className="h-20 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-lg font-black cursor-not-allowed"
                  >
                    Clínica Geral
                    <span className="block text-xs font-semibold">Disponível em breve</span>
                  </button>
                </div>
              </div>
            )}

            {patientWorkspaceTab === "documentos" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">Documentos do paciente</p>
                <p className="text-xs text-slate-600 mt-1">Em breve: anexos e arquivos por paciente.</p>
              </div>
            )}
          </section>
        )}

        {primaryView === "atendimento" && attendanceStep !== "idle" && patientWorkspaceTab === "anamnese" && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <button
            type="button"
            onClick={() => setIsClinicalPanelOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <h2 className="font-bold text-slate-900">Atendimento</h2>
              <p className="text-xs text-slate-500">Fluxo leve para conferência e anamnese</p>
            </div>
            <span className="text-xs font-bold text-purple-700">{isClinicalPanelOpen ? "Ocultar" : "Expandir"}</span>
          </button>
          {isClinicalPanelOpen && (
            <div className="mt-3 space-y-3">
              {attendanceStep !== "anamnese" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  Complete a conferência e escolha o protocolo para liberar a anamnese.
                </div>
              )}
              {!planStatus.canEditExistingRecords && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                  Modo leitura ativo para plano FREE após atingir limite vitalício.
                </div>
              )}
              {!planStatus.canUseVoice && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                  Recurso de voz indisponível: saldo de transcrição esgotado.
                </div>
              )}
              {isAnamnesisInOdontoMode && (
                <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">Anamnese Odontopediatria</h3>
                    <button
                      type="button"
                      onClick={() => setIsQuestionConfigOpen((prev) => !prev)}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                    >
                      Engrenagem
                    </button>
                  </div>

                  {canUseVoiceAnamnesis && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAnamnesisInputMode("voice")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                          anamnesisInputMode === "voice" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
                        }`}
                      >
                        Usar IA
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnamnesisInputMode("manual")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                          anamnesisInputMode === "manual" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
                        }`}
                      >
                        Digitar resposta
                      </button>
                    </div>
                  )}

                  {isQuestionConfigOpen && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Perguntas configuráveis da anamnese</p>
                      {odontoQuestionsDraft.map((question, idx) => (
                        <div key={`odonto-q-${idx}`} className="flex gap-2">
                          <input
                            value={question}
                            onChange={(e) =>
                              setOdontoQuestionsDraft((prev) => prev.map((item, itemIdx) => (itemIdx === idx ? e.target.value : item)))
                            }
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            placeholder={`Pergunta ${idx + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => setOdontoQuestionsDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                            className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-bold"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setOdontoQuestionsDraft((prev) => [...prev, ""])}
                          className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          Adicionar pergunta
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSaveQuestionConfig(); }}
                          disabled={isSavingQuestionConfig}
                          className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-bold disabled:opacity-60"
                        >
                          {isSavingQuestionConfig ? "Salvando..." : "Salvar perguntas"}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Pergunta final fixa: "{ANAMNESIS_FIXED_FINAL_QUESTION}"
                      </p>
                    </div>
                  )}

                  {anamnesisInputMode === "manual" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">Preenchimento manual habilitado.</p>
                      {odontoQuestions.map((question, idx) => (
                        <div key={`manual-q-${idx}`} className="space-y-1">
                          <p className="text-sm font-semibold text-slate-800">{idx + 1}. {question}</p>
                          <textarea
                            value={manualAnswersByQuestion[question] || ""}
                            onChange={(e) => setManualAnswersByQuestion((prev) => ({ ...prev, [question]: e.target.value }))}
                            placeholder="Digite a resposta manualmente..."
                            className="w-full h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => { void handleFinalizeAnamnesis(); }}
                        disabled={isProcessingAnamnesis}
                        className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
                      >
                        {isProcessingAnamnesis ? "Processando..." : "Finalizar Anamnese"}
                      </button>
                    </div>
                  )}

                  {canUseVoiceAnamnesis && anamnesisInputMode === "voice" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200 p-3 text-center space-y-2">
                        <button
                          type="button"
                          onClick={() => { void handleStartVoiceAnamnesis(); }}
                          disabled={isRecordingAnamnesis || isProcessingAnamnesis}
                          className="mx-auto px-6 py-3 rounded-full bg-indigo-600 text-white text-sm font-black disabled:opacity-60"
                        >
                          {isRecordingAnamnesis ? "Gravando..." : "Começar a Gravar"}
                        </button>
                        <p className="text-2xl font-black text-slate-900">{activeAnamnesisQuestion}</p>
                        <div className="h-12 flex items-end justify-center gap-1">
                          {waveformLevels.map((level, idx) => (
                            <span key={`wave-${idx}`} className="w-1.5 bg-emerald-500 rounded-sm" style={{ height: `${level}px` }} />
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">Pergunta {Math.min(currentAnamnesisQuestionIndex + 1, odontoQuestions.length)} de {odontoQuestions.length}</p>
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={handleNextAnamnesisQuestion}
                            disabled={!isRecordingAnamnesis || currentAnamnesisQuestionIndex >= odontoQuestions.length - 1}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"
                          >
                            Próxima
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleFinalizeAnamnesis(); }}
                            disabled={isProcessingAnamnesis}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-60"
                          >
                            Finalizar Anamnese
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isProcessingAnamnesis && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-800">
                      Processando resumo da anamnese...
                    </div>
                  )}

                  {anamnesisStructuredSummary && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700 mb-1">Resumo inteligente</p>
                      <textarea
                        value={editableAnamnesisSummary}
                        onChange={(e) => setEditableAnamnesisSummary(e.target.value)}
                        className="w-full h-40 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => { void handleSaveAnamnesisSummary(); }}
                          disabled={isSavingAnamnesisSummary}
                          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-60"
                        >
                          {isSavingAnamnesisSummary ? "Salvando..." : "Salvar anamnese"}
                        </button>
                      </div>
                    </div>
                  )}

                  {showExamPrompt && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-900">
                        Anamnese concluída. Deseja iniciar o Exame Clínico agora?
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowExamPrompt(false)}
                          className="px-3 py-1.5 rounded bg-emerald-700 text-white text-xs font-bold"
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowExamPrompt(false)}
                          className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
        )}
        </>
        )}

        {primaryView === "agenda" && (
          <section className="space-y-4 animate-[fadeIn_.28s_ease-out]">
            <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/50 to-cyan-50/50 shadow-[0_10px_30px_-18px_rgba(37,99,235,.55)] p-4 md:p-5 space-y-4">
              <div className="pointer-events-none absolute -top-24 -right-24 h-52 w-52 rounded-full bg-indigo-200/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-52 w-52 rounded-full bg-cyan-200/20 blur-3xl" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-slate-900 tracking-tight">Agenda</h2>
                  <p className="text-[11px] text-slate-500">Agende consultas, organize por tags e acompanhe confirmações.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleAgendaShift(-1)} className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-sm font-black text-slate-700 hover:bg-slate-50">◀</button>
                  <button type="button" onClick={handleAgendaToday} className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-black text-slate-700 hover:bg-slate-50">Hoje</button>
                  <button type="button" onClick={() => handleAgendaShift(1)} className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-sm font-black text-slate-700 hover:bg-slate-50">▶</button>
                </div>
              </div>
              <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setAgendaViewMode("day")}
                  className={`h-8 px-3 rounded-xl text-xs font-black border transition ${agendaViewMode === "day" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-transparent hover:bg-slate-100"}`}
                >
                  Dia
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaViewMode("week")}
                  className={`h-8 px-3 rounded-xl text-xs font-black border transition ${agendaViewMode === "week" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-transparent hover:bg-slate-100"}`}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaViewMode("month")}
                  className={`h-8 px-3 rounded-xl text-xs font-black border transition ${agendaViewMode === "month" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-transparent hover:bg-slate-100"}`}
                >
                  Mês
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <select
                  value={appointmentPatientKey}
                  onChange={(e) => setAppointmentPatientKey(e.target.value)}
                  className="md:col-span-2 h-11 px-3 border border-slate-300 rounded-xl text-sm bg-white shadow-sm"
                >
                  <option value="">Selecione o paciente</option>
                  {patients.map((patient) => (
                    <option key={`appt-${patient.familyId}-${patient.childId}`} value={`${patient.familyId}::${patient.childId}`}>
                      {patient.childName}
                    </option>
                  ))}
                </select>
                <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="h-11 px-3 border border-slate-300 rounded-xl text-sm bg-white shadow-sm" />
                <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="h-11 px-3 border border-slate-300 rounded-xl text-sm bg-white shadow-sm" />
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={appointmentDurationMin}
                  onChange={(e) => setAppointmentDurationMin(Math.max(10, Number(e.target.value || 30)))}
                  placeholder="Duração (min)"
                  className="h-11 px-3 border border-slate-300 rounded-xl text-sm bg-white shadow-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  value={appointmentPrimaryTag}
                  onChange={(e) => setAppointmentPrimaryTag(e.target.value)}
                  className="h-11 px-3 border border-indigo-200 rounded-xl text-sm bg-white shadow-sm"
                >
                  {APPOINTMENT_TAG_OPTIONS.map((tag) => (
                    <option key={`appt-tag-${tag}`} value={tag}>{tag}</option>
                  ))}
                </select>
                <input
                  value={appointmentCustomTags}
                  onChange={(e) => setAppointmentCustomTags(e.target.value)}
                  placeholder="Outras tags (separadas por vírgula)"
                  className="h-11 px-3 border border-indigo-200 rounded-xl text-sm bg-white shadow-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {APPOINTMENT_TAG_OPTIONS.filter((tag) => tag !== appointmentPrimaryTag).map((tag) => {
                  const selected = appointmentExtraTags.includes(tag);
                  return (
                    <button
                      key={`extra-tag-${tag}`}
                      type="button"
                      onClick={() =>
                        setAppointmentExtraTags((prev) =>
                          prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
                        )
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-sm transition ${
                        selected ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-300"
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
              <textarea value={appointmentNotes} onChange={(e) => setAppointmentNotes(e.target.value)} placeholder="Observações da consulta" className="w-full h-20 px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white shadow-sm" />
              <button
                type="button"
                onClick={() => { void handleCreateAppointment(); }}
                disabled={isSavingAppointment}
                className="h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-black shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSavingAppointment ? "Salvando..." : "Adicionar consulta"}
              </button>
            </div>
            <div className="bg-white/95 rounded-2xl border border-slate-200 shadow-[0_12px_24px_-16px_rgba(15,23,42,.35)] p-4 md:p-5">
              {agendaViewMode === "day" && (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedAppointmentId) return;
                    void moveAppointmentToDay(draggedAppointmentId, agendaDayIso);
                    setDraggedAppointmentId(null);
                  }}
                >
                  <p className="text-sm font-bold text-slate-800 mb-2">
                    {new Date(`${agendaDayIso}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                  <div className="space-y-2 min-h-[200px]">
                    {(appointmentsByDay.get(agendaDayIso) || []).length === 0 && (
                      <p className="text-xs text-slate-400">Sem consultas neste dia.</p>
                    )}
                    {(appointmentsByDay.get(agendaDayIso) || []).map((appt) => (
                      (() => {
                        const visual = getAppointmentVisual(appt);
                        return (
                      <div
                        key={appt.id}
                        draggable
                        onDragStart={() => setDraggedAppointmentId(appt.id)}
                        className={`w-full text-left rounded-xl border p-3 ${visual.card} transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-black ${visual.title}`}>
                            {new Date(appt.startsAtIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {appt.childName}
                          </p>
                          <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full ${visual.badge}`}>{visual.badgeLabel}</span>
                        </div>
                        {appt.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {appt.tags.slice(0, 4).map((tag) => (
                              <span key={`${appt.id}-${tag}`} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/80 text-slate-700 border border-slate-200">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {appt.notes && <p className="mt-1 text-[11px] text-slate-700 line-clamp-2">{appt.notes}</p>}
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const patient = patients.find((item) => item.familyId === appt.familyId && item.childId === appt.childId);
                              if (!patient) return;
                              setPrimaryView("pacientes");
                              void handleStartAttendance(patient);
                            }}
                            className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[11px] font-black hover:bg-slate-900"
                          >
                            Atender
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleCancelAppointmentByProfessional(appt); }}
                            disabled={appt.patientStatus === "cancelled"}
                            className="h-8 px-3 rounded-lg bg-rose-600 text-white text-[11px] font-black hover:bg-rose-700 disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                        );
                      })()
                    ))}
                  </div>
                </div>
              )}

              {agendaViewMode === "week" && (
                <div className="overflow-x-auto">
                  <div className="min-w-[980px] grid grid-cols-7 gap-2.5">
                    {agendaWeekDays.map((day) => (
                      <div
                        key={day.iso}
                        className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-2.5"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!draggedAppointmentId) return;
                          void moveAppointmentToDay(draggedAppointmentId, day.iso);
                          setDraggedAppointmentId(null);
                        }}
                      >
                        <p className="text-xs font-bold text-slate-700">{day.label}</p>
                        <div className="mt-2 space-y-2 min-h-[120px]">
                          {(appointmentsByDay.get(day.iso) || []).length === 0 && <p className="text-[11px] text-slate-400">Sem consultas</p>}
                          {(appointmentsByDay.get(day.iso) || []).map((appt) => (
                            (() => {
                              const visual = getAppointmentVisual(appt);
                              return (
                            <div
                              key={appt.id}
                              draggable
                              onDragStart={() => setDraggedAppointmentId(appt.id)}
                              className={`w-full text-left rounded-xl border p-2.5 ${visual.card} transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <p className={`text-xs font-black ${visual.title}`}>
                                {new Date(appt.startsAtIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {appt.childName}
                                </p>
                                <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full ${visual.badge}`}>{appt.patientStatus === "confirmed" ? "OK" : appt.patientStatus === "cancelled" ? "X" : "..."}</span>
                              </div>
                              {appt.tags.length > 0 && <p className="text-[10px] text-slate-700 line-clamp-1 mt-0.5">{appt.tags.join(" • ")}</p>}
                              {appt.notes && <p className="text-[10px] text-slate-700 line-clamp-2 mt-0.5">{appt.notes}</p>}
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const patient = patients.find((item) => item.familyId === appt.familyId && item.childId === appt.childId);
                                  if (!patient) return;
                                  setPrimaryView("pacientes");
                                  void handleStartAttendance(patient);
                                  }}
                                  className="h-7 px-2.5 rounded-lg bg-slate-800 text-white text-[10px] font-black hover:bg-slate-900"
                                >
                                  Atender
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { void handleCancelAppointmentByProfessional(appt); }}
                                  disabled={appt.patientStatus === "cancelled"}
                                  className="h-7 px-2.5 rounded-lg bg-rose-600 text-white text-[10px] font-black hover:bg-rose-700 disabled:opacity-60"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {agendaViewMode === "month" && (
                <div className="grid grid-cols-7 gap-2.5">
                  {agendaMonthGridDays.map((day) => (
                    <div
                      key={day.iso}
                      className={`rounded-xl border p-2 min-h-[128px] ${day.inCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedAppointmentId) return;
                        void moveAppointmentToDay(draggedAppointmentId, day.iso);
                        setDraggedAppointmentId(null);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAgendaReferenceDate(day.iso);
                          setAgendaViewMode("day");
                        }}
                        className={`text-xs font-bold ${day.inCurrentMonth ? "text-slate-700" : "text-slate-400"}`}
                      >
                        {day.label}
                      </button>
                      <div className="mt-1 space-y-1">
                        {(appointmentsByDay.get(day.iso) || []).slice(0, 3).map((appt) => (
                          (() => {
                            const visual = getAppointmentVisual(appt);
                            return (
                          <div
                            key={appt.id}
                            draggable
                            onDragStart={() => setDraggedAppointmentId(appt.id)}
                            className={`w-full text-left rounded-lg px-1.5 py-1 border ${visual.card} transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-sm`}
                            title={`${appt.childName} - ${formatIsoDateTime(appt.startsAtIso)}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-[10px] font-black truncate ${visual.title}`}>{appt.childName}</p>
                              <button
                                type="button"
                                onClick={() => { void handleCancelAppointmentByProfessional(appt); }}
                                disabled={appt.patientStatus === "cancelled"}
                                className="h-4.5 w-4.5 rounded-full bg-rose-600 text-white text-[10px] leading-none font-black disabled:opacity-60"
                                title="Cancelar consulta"
                              >
                                x
                              </button>
                            </div>
                          </div>
                            );
                          })()
                        ))}
                        {(appointmentsByDay.get(day.iso) || []).length > 3 && (
                          <p className="text-[10px] text-slate-500">+{(appointmentsByDay.get(day.iso) || []).length - 3} itens</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-rose-900">Consultas canceladas</h3>
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white">
                    {cancelledAppointmentsHistory.length}
                  </span>
                </div>
                {cancelledAppointmentsHistory.length === 0 && (
                  <p className="mt-1.5 text-xs text-rose-700">Nenhuma consulta cancelada por você até agora.</p>
                )}
                {cancelledAppointmentsHistory.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-auto pr-1">
                    {cancelledAppointmentsHistory.map((appt) => (
                      <div key={`cancelled-${appt.id}`} className="rounded-xl border border-rose-200 bg-white/90 px-2.5 py-2 shadow-sm">
                        <p className="text-[11px] font-black text-rose-900">
                          {new Date(appt.startsAtIso).toLocaleDateString("pt-BR")} • {new Date(appt.startsAtIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {appt.childName}
                        </p>
                        {appt.tags.length > 0 && (
                          <p className="text-[10px] text-rose-800 mt-0.5">{appt.tags.join(" • ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {false && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <section className="xl:col-span-4 xl:order-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <button
            type="button"
            onClick={() => setIsProfilePanelOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <h2 className="font-bold text-slate-900">Perfil Profissional</h2>
              <p className="text-xs text-slate-500">Edite seus dados públicos e contato</p>
            </div>
            <span className="text-xs font-bold text-purple-700">{isProfilePanelOpen ? "Ocultar" : "Expandir"}</span>
          </button>
          {isProfilePanelOpen && (
            <div className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-600">Título curto de apresentação</p>
                    <span className="text-xs font-semibold text-slate-500">
                      {headlineDraft.length}/{PROFESSIONAL_HEADLINE_MAX}
                    </span>
                  </div>
                  <input
                    value={headlineDraft}
                    onChange={(e) => setHeadlineDraft(e.target.value.slice(0, PROFESSIONAL_HEADLINE_MAX))}
                    placeholder="Ex.: Odontologia inclusiva"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-600">Palavras-chave para match (máx. 5)</p>
                    <span className={`text-xs font-semibold ${keywordCount > 5 ? "text-rose-600" : "text-slate-500"}`}>
                      {keywordCount}/5
                    </span>
                  </div>
                  <input
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    placeholder="Ex.: autismo, crianças, dente"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Separar por vírgula. Excesso não é salvo.</p>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Bio curta (o que você faz e para quem atende)</span>
                    <span>{bioDraft.length}/{PROFESSIONAL_BIO_MAX}</span>
                  </div>
                  <textarea
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value.slice(0, PROFESSIONAL_BIO_MAX))}
                    placeholder="Ex.: Atendo crianças, bebês e pacientes atípicos com foco em acolhimento."
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full h-20"
                  />
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Destaques públicos</p>
                  <input
                    value={highlightsDraft}
                    onChange={(e) => setHighlightsDraft(e.target.value)}
                    placeholder="Ex.: Atípicos, Bebês, Crianças"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Site</p>
                  <input
                    value={websiteDraft}
                    onChange={(e) => setWebsiteDraft(e.target.value)}
                    placeholder="https://"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Instagram</p>
                  <input
                    value={instagramDraft}
                    onChange={(e) => setInstagramDraft(e.target.value)}
                    placeholder="@seuusuario"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">YouTube</p>
                  <input
                    value={youtubeDraft}
                    onChange={(e) => setYoutubeDraft(e.target.value)}
                    placeholder="Canal ou link"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Vídeo de apresentação</p>
                  <input
                    value={videoUrlDraft}
                    onChange={(e) => setVideoUrlDraft(e.target.value)}
                    placeholder="URL de vídeo/playlist"
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Telefone (somente leitura)</p>
                  <input
                    value={professional.contacts?.phone || professional.contacts?.whatsapp || "Não informado"}
                    readOnly
                    disabled
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full bg-slate-100 text-slate-600"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Localização (somente leitura)</p>
                  <input
                    value={`${professional.city || "Cidade não informada"}/${professional.uf || "UF"}`}
                    readOnly
                    disabled
                    className="p-2 border border-slate-300 rounded-lg text-sm w-full bg-slate-100 text-slate-600"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => { void handleSaveProfessionalProfile(); }}
                  disabled={isSavingProfile}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
                >
                  {isSavingProfile ? "Salvando..." : "Salvar perfil"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="xl:col-span-4 xl:order-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <button
            type="button"
            onClick={() => setIsKpiPanelOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <h2 className="font-bold text-slate-900">Indicadores de vínculo e performance</h2>
              <p className="text-xs text-slate-500">Resumo completo em um único bloco</p>
            </div>
            <span className="text-xs font-bold text-purple-700">{isKpiPanelOpen ? "Ocultar" : "Expandir"}</span>
          </button>
          {isKpiPanelOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Vínculos ativos</p>
                  <p className="text-xl font-black text-slate-800">{patientCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Total vinculados (histórico)</p>
                  <p className="text-xl font-black text-emerald-700">{linkedCountAllTime}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Total desvinculados</p>
                  <p className="text-xl font-black text-rose-700">{unlinkedCountAllTime}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Adesão média (7 dias)</p>
                  <p className="text-xl font-black text-slate-800">{adherenceAverage}%</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Solicitações totais</p>
                  <p className="text-xl font-black text-slate-800">{linkRequests.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Aprovadas</p>
                  <p className="text-xl font-black text-emerald-700">{approvedRequests.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Rejeitadas</p>
                  <p className="text-xl font-black text-rose-700">{rejectedRequests.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Pendentes</p>
                  <p className="text-xl font-black text-amber-700">{pendingRequests.length}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Taxa de aprovação</p>
                  <p className="text-2xl font-black text-slate-800">{approvalRate}%</p>
                  <p className="text-[11px] text-slate-500">considerando apenas solicitações decididas</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Tempo médio de aprovação</p>
                  <p className="text-2xl font-black text-slate-800">
                    {avgApprovalHours === null ? "—" : `${avgApprovalHours}h`}
                  </p>
                  <p className="text-[11px] text-slate-500">média das solicitações aprovadas</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Impressões totais</p>
                  <p className="text-xl font-black text-slate-800">{adStats.impressions}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">Contatos totais</p>
                  <p className="text-xl font-black text-slate-800">{totalContactClicks}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">CTR total</p>
                  <p className="text-xl font-black text-slate-800">{ctrTotal.toFixed(2)}%</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500">CTR 7 dias</p>
                  <p className="text-xl font-black text-slate-800">{ctr7d.toFixed(2)}%</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] text-slate-500 mb-2">Origem das solicitações</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">CPF paciente: {sourceStats.cpf}</div>
                  <div className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">Outros: {sourceStats.other}</div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="xl:col-span-4 xl:order-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 xl:sticky xl:top-4">
            <h2 className="font-bold text-slate-900 mb-2">Solicitações de vínculo</h2>
            <div className="mb-3 grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                value={cpfRequestInput}
                onChange={(e) => setCpfRequestInput(formatCpf(e.target.value))}
                placeholder="CPF do paciente (000.000.000-00)"
                type="tel"
                inputMode="numeric"
                maxLength={14}
                pattern="\d{3}\.\d{3}\.\d{3}-\d{2}"
                className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              />
              <button
                type="button"
                onClick={() => { void handleRequestByCpf(); }}
                disabled={isCreatingCpfRequest}
                className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-60"
              >
                {isCreatingCpfRequest ? "Buscando..." : "Buscar CPF"}
              </button>
            </div>
            <div className="mb-3 rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-bold text-slate-600">Blocos que você está solicitando</p>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={requestPersonalBlock} onChange={(e) => setRequestPersonalBlock(e.target.checked)} />
                Informações pessoais
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={requestProfileBlock} onChange={(e) => setRequestProfileBlock(e.target.checked)} />
                Perfil e rotina
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={requestHealthBlock} onChange={(e) => setRequestHealthBlock(e.target.checked)} />
                Saúde
              </label>
              <p className="text-[11px] text-slate-500">O paciente confirma os blocos finais na autorização.</p>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendingRequests.length === 0 && (
                <p className="text-xs text-slate-500">Nenhuma solicitação pendente.</p>
              )}
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-700">
                    CPF {maskCpf(request.patientCpfDigits || request.requesterCpf || "")}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Status: {request.status === "pending_user" ? "aguardando autorização do paciente" : "aguardando código temporário"}
                  </p>
                  {request.requestedConsentBlocks && (
                    <p className="text-[11px] text-slate-500">
                      Solicitado:{" "}
                      {[
                        request.requestedConsentBlocks.personal ? "Pessoais" : null,
                        request.requestedConsentBlocks.profile ? "Perfil/Rotina" : null,
                        request.requestedConsentBlocks.health ? "Saúde" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Sem blocos"}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">Família: {request.familyId ? `${request.familyId.slice(0, 8)}...` : "não definida"}</p>
                  {Array.isArray(request.sharedChildren) && request.sharedChildren.length > 0 && (
                    <p className="text-[11px] text-slate-600 mt-1">
                      Compartilhado: {request.sharedChildren.map((item) => item.name || item.id).join(", ")}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    {request.status === "pending_code" && (
                      <>
                        <input
                          value={requestCodeByRequestId[request.id] || ""}
                          onChange={(e) => setRequestCodeByRequestId((prev) => ({ ...prev, [request.id]: e.target.value }))}
                          placeholder="Código de 6 dígitos"
                          className="px-2 py-1 border border-slate-300 rounded text-xs"
                        />
                        <button onClick={() => { void handleValidatePatientCode(request); }} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold">Validar código</button>
                      </>
                    )}
                    <button onClick={() => { void handleRejectRequest(request); }} className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs font-bold">Rejeitar</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-sm font-bold text-sky-900">Adicionar paciente (Out)</p>
              <p className="text-xs text-sky-800">Se o CPF não existir no Habitus, a ficha OUT é habilitada aqui automaticamente.</p>
              {showOutPatientForm && (
                <div className="rounded-lg border border-sky-200 bg-white p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={outPatientDraft.cpf} readOnly className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100" />
                    <input value={outPatientDraft.nome} onChange={(e) => setOutPatientField("nome", e.target.value)} placeholder="Nome completo" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <select value={outPatientDraft.sexo} onChange={(e) => setOutPatientField("sexo", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="nao_informado">Sexo não informado</option>
                      <option value="feminino">Feminino</option>
                      <option value="masculino">Masculino</option>
                    </select>
                    <input value={outPatientDraft.apelido} onChange={(e) => setOutPatientField("apelido", e.target.value)} placeholder="Apelido" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input type="date" value={outPatientDraft.dataNascimento} onChange={(e) => setOutPatientField("dataNascimento", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.responsavelLegalNome} onChange={(e) => setOutPatientField("responsavelLegalNome", e.target.value)} placeholder="Responsável legal (obrigatório se menor de 18)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                    <input value={outPatientDraft.responsavelLegalTelefone} onChange={(e) => setOutPatientField("responsavelLegalTelefone", e.target.value)} placeholder="Telefone do responsável legal" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                    <input
                      value={outPatientDraft.addressZip}
                      onChange={(e) => setOutPatientField("addressZip", formatCep(e.target.value))}
                      onBlur={() => { void handleLookupOutPatientCep(); }}
                      placeholder="CEP"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="px-3 py-2 text-xs text-slate-500">{isLookingUpOutPatientCep ? "Buscando CEP..." : "Preencha manualmente se não souber o CEP."}</div>
                    <input value={outPatientDraft.addressStreet} onChange={(e) => setOutPatientField("addressStreet", e.target.value)} placeholder="Rua" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressNumber} onChange={(e) => setOutPatientField("addressNumber", e.target.value)} placeholder="Número" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressComplement} onChange={(e) => setOutPatientField("addressComplement", e.target.value)} placeholder="Complemento" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressNeighborhood} onChange={(e) => setOutPatientField("addressNeighborhood", e.target.value)} placeholder="Bairro" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressCity} onChange={(e) => setOutPatientField("addressCity", e.target.value)} placeholder="Cidade" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.addressUf} onChange={(e) => setOutPatientField("addressUf", e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.telefonePrincipal} onChange={(e) => setOutPatientField("telefonePrincipal", e.target.value)} placeholder="Telefone celular" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.whatsapp} onChange={(e) => setOutPatientField("whatsapp", e.target.value)} placeholder="WhatsApp" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input value={outPatientDraft.email} onChange={(e) => setOutPatientField("email", e.target.value)} placeholder="E-mail" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void handleSaveOutPatient(); }}
                      disabled={isSavingOutPatient}
                      className="px-3 py-2 rounded-lg bg-sky-700 text-white text-xs font-bold disabled:opacity-60"
                    >
                      {isSavingOutPatient ? "Salvando..." : "Salvar paciente"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowOutPatientForm(false)}
                      className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
        </section>

        <section className="xl:col-span-8 xl:order-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <button
            type="button"
            onClick={() => setIsClinicalPanelOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <h2 className="font-bold text-slate-900">Prontuário e Anamnese</h2>
              <p className="text-xs text-slate-500">Modelo multiprofissional com SOAP e blocos expansíveis</p>
            </div>
            <span className="text-xs font-bold text-purple-700">{isClinicalPanelOpen ? "Ocultar" : "Expandir"}</span>
          </button>
          {isClinicalPanelOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={recordPatientKey}
                  onChange={(e) => setRecordPatientKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white md:col-span-2"
                >
                  <option value="">Selecione o paciente</option>
                  {patients.map((patient) => (
                    <option key={`record-${patient.familyId}-${patient.childId}`} value={`${patient.familyId}::${patient.childId}`}>
                      {patient.childName} ({patient.familyId.slice(0, 6)}...)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { void handleSaveClinicalRecord(); }}
                  disabled={isSavingRecord || isLoadingRecord || !selectedRecordPatient}
                  className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
                >
                  {isSavingRecord ? "Salvando..." : "Salvar prontuário"}
                </button>
              </div>
              <div className="text-[11px] text-slate-500">
                {selectedRecordPatient
                  ? `Paciente atual: ${selectedRecordPatient.childName} • Última atualização: ${recordLoadedAtMs ? new Date(recordLoadedAtMs).toLocaleString("pt-BR") : "novo prontuário"}`
                  : "Selecione um paciente vinculado para iniciar o prontuário."}
              </div>

              {selectedRecordPatient && (
                <>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1">Tipo de atendimento</p>
                        <select
                          value={recordDraft.visitType}
                          onChange={(e) => setRecordField("visitType", e.target.value as ClinicalVisitType)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                          <option value="followup">Retorno</option>
                          <option value="first">Primeira consulta</option>
                        </select>
                      </div>
                      <div className="md:col-span-2 flex flex-wrap gap-2 md:justify-end">
                        {recordDraft.visitType === "followup" && (
                          <button
                            type="button"
                            onClick={() => setShowFullRecordInFollowup((prev) => !prev)}
                            className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold"
                          >
                            {showFullRecordInFollowup ? "Ocultar anamnese completa" : "Mostrar anamnese completa"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleExportSoapPdf}
                          className="px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-sm font-semibold"
                        >
                          Imprimir SOAP (PDF)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 items-start">
                  <div className="rounded-xl border border-slate-200 p-3 space-y-2 xl:col-span-2 xl:sticky xl:top-4">
                    <h3 className="text-sm font-bold text-slate-900">Evolução SOAP (uso diário)</h3>
                    <textarea
                      value={recordDraft.soapSubjective}
                      onChange={(e) => setRecordField("soapSubjective", e.target.value)}
                      placeholder="S - Subjetivo: relato do paciente hoje."
                      className="w-full h-24 xl:h-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <textarea
                      value={recordDraft.soapObjective}
                      onChange={(e) => setRecordField("soapObjective", e.target.value)}
                      placeholder="O - Objetivo: achados observáveis e medidas."
                      className="w-full h-24 xl:h-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <textarea
                      value={recordDraft.soapAssessment}
                      onChange={(e) => setRecordField("soapAssessment", e.target.value)}
                      placeholder="A - Avaliação: interpretação clínica."
                      className="w-full h-24 xl:h-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <textarea
                      value={recordDraft.soapPlan}
                      onChange={(e) => setRecordField("soapPlan", e.target.value)}
                      placeholder="P - Plano: conduta até o próximo atendimento."
                      className="w-full h-24 xl:h-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div className="xl:col-span-3 space-y-3">
                  {shouldShowFullClinicalRecord ? (
                  <>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <button type="button" onClick={() => toggleRecordSection("identification")} className="w-full flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">Identificação e alertas</span>
                      <span className="text-xs font-semibold text-purple-700">{recordSectionsOpen.identification ? "Ocultar" : "Expandir"}</span>
                    </button>
                    {recordSectionsOpen.identification && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input value={recordDraft.socialName} onChange={(e) => setRecordField("socialName", e.target.value)} placeholder="Nome social" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.genderIdentity} onChange={(e) => setRecordField("genderIdentity", e.target.value)} placeholder="Identidade de gênero" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.biologicalSex} onChange={(e) => setRecordField("biologicalSex", e.target.value)} placeholder="Sexo biológico" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.cpf} onChange={(e) => setRecordField("cpf", formatCpf(e.target.value))} placeholder="CPF (000.000.000-00)" type="tel" inputMode="numeric" maxLength={14} pattern="\d{3}\.\d{3}\.\d{3}-\d{2}" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.rg} onChange={(e) => setRecordField("rg", e.target.value)} placeholder="RG" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.cns} onChange={(e) => setRecordField("cns", e.target.value)} placeholder="CNS" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.insurancePlan} onChange={(e) => setRecordField("insurancePlan", e.target.value)} placeholder="Convênio/plano" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.occupation} onChange={(e) => setRecordField("occupation", e.target.value)} placeholder="Profissão/ocupação" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.education} onChange={(e) => setRecordField("education", e.target.value)} placeholder="Escolaridade" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.maritalStatus} onChange={(e) => setRecordField("maritalStatus", e.target.value)} placeholder="Estado civil" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.religion} onChange={(e) => setRecordField("religion", e.target.value)} placeholder="Religião" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.phone} onChange={(e) => setRecordField("phone", e.target.value)} placeholder="Telefone/WhatsApp" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.email} onChange={(e) => setRecordField("email", e.target.value)} placeholder="E-mail" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.legalGuardianName} onChange={(e) => setRecordField("legalGuardianName", e.target.value)} placeholder="Responsável legal" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.emergencyContactName} onChange={(e) => setRecordField("emergencyContactName", e.target.value)} placeholder="Contato de emergência" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.emergencyContactPhone} onChange={(e) => setRecordField("emergencyContactPhone", e.target.value)} placeholder="Telefone de emergência" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.emergencyContactRelation} onChange={(e) => setRecordField("emergencyContactRelation", e.target.value)} placeholder="Parentesco" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.fullAddress} onChange={(e) => setRecordField("fullAddress", e.target.value)} placeholder="Endereço completo" className="md:col-span-2 h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.allergies} onChange={(e) => setRecordField("allergies", e.target.value)} placeholder="Alergias (medicamentos, alimentos, látex)" className="h-16 px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-sm" />
                        <input value={recordDraft.bloodTypeRh} onChange={(e) => setRecordField("bloodTypeRh", e.target.value)} placeholder="Tipagem sanguínea / Rh" className="px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-sm" />
                        <textarea value={recordDraft.criticalConditions} onChange={(e) => setRecordField("criticalConditions", e.target.value)} placeholder="Condições críticas (diabetes, cardiopatia etc.)" className="md:col-span-2 h-16 px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-sm" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <button type="button" onClick={() => toggleRecordSection("history")} className="w-full flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">Anamnese integrada</span>
                      <span className="text-xs font-semibold text-purple-700">{recordSectionsOpen.history ? "Ocultar" : "Expandir"}</span>
                    </button>
                    {recordSectionsOpen.history && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <textarea value={recordDraft.chiefComplaint} onChange={(e) => setRecordField("chiefComplaint", e.target.value)} placeholder="Queixa principal (QP)" className="md:col-span-2 h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.currentIllnessHistory} onChange={(e) => setRecordField("currentIllnessHistory", e.target.value)} placeholder="História da doença atual (HDA)" className="md:col-span-2 h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.pastMedicalHistory} onChange={(e) => setRecordField("pastMedicalHistory", e.target.value)} placeholder="Histórico médico pregresso (HMP)" className="h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.familyHistory} onChange={(e) => setRecordField("familyHistory", e.target.value)} placeholder="Histórico familiar" className="h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.gynecoObsHistory} onChange={(e) => setRecordField("gynecoObsHistory", e.target.value)} placeholder="Histórico fisiológico/ginecológico (se aplicável)" className="md:col-span-2 h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.lifestyleDiet} onChange={(e) => setRecordField("lifestyleDiet", e.target.value)} placeholder="Hábitos: alimentação" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.lifestyleSleep} onChange={(e) => setRecordField("lifestyleSleep", e.target.value)} placeholder="Hábitos: sono" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.lifestylePhysicalActivity} onChange={(e) => setRecordField("lifestylePhysicalActivity", e.target.value)} placeholder="Hábitos: atividade física" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.bowelUrinaryHabits} onChange={(e) => setRecordField("bowelUrinaryHabits", e.target.value)} placeholder="Hábitos intestinais/urinários" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.smokingAlcoholSubstances} onChange={(e) => setRecordField("smokingAlcoholSubstances", e.target.value)} placeholder="Tabaco, álcool e substâncias" className="md:col-span-2 h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.medicationsSupplements} onChange={(e) => setRecordField("medicationsSupplements", e.target.value)} placeholder="Medicamentos e suplementos em uso" className="md:col-span-2 h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <button type="button" onClick={() => toggleRecordSection("objective")} className="w-full flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">Avaliação clínica objetiva</span>
                      <span className="text-xs font-semibold text-purple-700">{recordSectionsOpen.objective ? "Ocultar" : "Expandir"}</span>
                    </button>
                    {recordSectionsOpen.objective && (
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2">
                        <input value={recordDraft.bloodPressure} onChange={(e) => setRecordField("bloodPressure", e.target.value)} placeholder="PA" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.heartRate} onChange={(e) => setRecordField("heartRate", e.target.value)} placeholder="FC" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.respiratoryRate} onChange={(e) => setRecordField("respiratoryRate", e.target.value)} placeholder="FR" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.temperature} onChange={(e) => setRecordField("temperature", e.target.value)} placeholder="Temperatura" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.oxygenSaturation} onChange={(e) => setRecordField("oxygenSaturation", e.target.value)} placeholder="SpO2" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.capillaryGlycemia} onChange={(e) => setRecordField("capillaryGlycemia", e.target.value)} placeholder="Glicemia capilar" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.weight} onChange={(e) => setRecordField("weight", e.target.value)} placeholder="Peso" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.height} onChange={(e) => setRecordField("height", e.target.value)} placeholder="Altura" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.bmi} onChange={(e) => setRecordField("bmi", e.target.value)} placeholder="IMC" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.waistCircumference} onChange={(e) => setRecordField("waistCircumference", e.target.value)} placeholder="Circ. abdominal" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.professionSpecificAssessment} onChange={(e) => setRecordField("professionSpecificAssessment", e.target.value)} placeholder="Avaliação específica da sua profissão (EEM, odontograma, ADM, etc.)" className="col-span-2 md:col-span-5 h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <button type="button" onClick={() => toggleRecordSection("diagnosisPlan")} className="w-full flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">Diagnóstico e plano de cuidados</span>
                      <span className="text-xs font-semibold text-purple-700">{recordSectionsOpen.diagnosisPlan ? "Ocultar" : "Expandir"}</span>
                    </button>
                    {recordSectionsOpen.diagnosisPlan && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input value={recordDraft.diagnosisCodes} onChange={(e) => setRecordField("diagnosisCodes", e.target.value)} placeholder="CID-10/11, DSM-5 (quando aplicável)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.functionalClassification} onChange={(e) => setRecordField("functionalClassification", e.target.value)} placeholder="CIF (quando aplicável)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <input value={recordDraft.nursingDiagnosis} onChange={(e) => setRecordField("nursingDiagnosis", e.target.value)} placeholder="NANDA/NIC/NOC (enfermagem)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                        <textarea value={recordDraft.diagnosticImpression} onChange={(e) => setRecordField("diagnosticImpression", e.target.value)} placeholder="Hipóteses e conclusão clínica" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                        <textarea value={recordDraft.treatmentGoals} onChange={(e) => setRecordField("treatmentGoals", e.target.value)} placeholder="Objetivos curto/médio/longo prazo" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                        <textarea value={recordDraft.prescriptionsPlan} onChange={(e) => setRecordField("prescriptionsPlan", e.target.value)} placeholder="Prescrição multiprofissional e condutas" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                        <textarea value={recordDraft.proceduresPerformed} onChange={(e) => setRecordField("proceduresPerformed", e.target.value)} placeholder="Procedimentos realizados na sessão" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.referrals} onChange={(e) => setRecordField("referrals", e.target.value)} placeholder="Encaminhamentos e interconsultas" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.homeGuidance} onChange={(e) => setRecordField("homeGuidance", e.target.value)} placeholder="Orientações domiciliares" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <button type="button" onClick={() => toggleRecordSection("legal")} className="w-full flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">Documentos e termos legais</span>
                      <span className="text-xs font-semibold text-purple-700">{recordSectionsOpen.legal ? "Ocultar" : "Expandir"}</span>
                    </button>
                    {recordSectionsOpen.legal && (
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <div className="rounded-lg border border-slate-200 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-700">Anexos do prontuário (PDF, imagem, laudo)</p>
                            <label className="px-2 py-1 rounded bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer">
                              {isUploadingAttachment ? "Enviando..." : "Adicionar anexo"}
                              <input
                                type="file"
                                className="hidden"
                                disabled={isUploadingAttachment}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    void handleUploadClinicalAttachment(file);
                                  }
                                  if (e.target) e.target.value = "";
                                }}
                              />
                            </label>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">Limite por arquivo: {formatFileBytes(CLINICAL_ATTACHMENT_MAX_BYTES)}.</p>
                          {recordDraft.attachments.length === 0 ? (
                            <p className="text-[11px] text-slate-500 mt-2">Nenhum anexo neste prontuário.</p>
                          ) : (
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                              {recordDraft.attachments.map((item) => (
                                <div key={item.id} className="flex items-center justify-between gap-2 text-xs border border-slate-200 rounded p-1.5">
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 truncate">
                                    {item.name}
                                  </a>
                                  <div className="text-slate-500 whitespace-nowrap">{formatFileBytes(item.sizeBytes)}</div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveClinicalAttachment(item.id)}
                                    className="text-rose-700 font-semibold"
                                  >
                                    Remover
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <textarea value={recordDraft.attachmentsNotes} onChange={(e) => setRecordField("attachmentsNotes", e.target.value)} placeholder="Resumo de anexos/exames/laudos" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        <textarea value={recordDraft.legalTerms} onChange={(e) => setRecordField("legalTerms", e.target.value)} placeholder="TCLE, LGPD e demais termos (status/observações)" className="h-16 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <button type="button" onClick={() => toggleRecordSection("closure")} className="w-full flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">Encerramento do caso</span>
                      <span className="text-xs font-semibold text-purple-700">{recordSectionsOpen.closure ? "Ocultar" : "Expandir"}</span>
                    </button>
                    {recordSectionsOpen.closure && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <select
                          value={recordDraft.patientStatus}
                          onChange={(e) => setRecordField("patientStatus", e.target.value as ClinicalRecordDraft["patientStatus"])}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                          <option value="active">Ativo</option>
                          <option value="discharged">Alta clínica</option>
                          <option value="abandoned">Abandono</option>
                          <option value="transferred">Transferência</option>
                          <option value="deceased">Óbito</option>
                        </select>
                        <input
                          type="date"
                          value={recordDraft.closureDate}
                          onChange={(e) => setRecordField("closureDate", e.target.value)}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        <textarea
                          value={recordDraft.dischargeSummary}
                          onChange={(e) => setRecordField("dischargeSummary", e.target.value)}
                          placeholder="Resumo de alta / epicrise"
                          className="md:col-span-2 h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    )}
                  </div>
                  </>
                  ) : (
                    <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
                      Modo retorno ativo: exibindo SOAP para registro rápido. Use "Mostrar anamnese completa" se precisar revisar ou completar os demais blocos.
                    </div>
                  )}
                  </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>



        <section className="xl:col-span-8 xl:order-5 grid grid-cols-1 2xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="font-bold text-slate-900 mb-3">Criador de Orientação</h2>
            <div className="space-y-2">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nome da orientação (ex.: Protocolo Matinal)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <input
                value={templateGoal}
                onChange={(e) => setTemplateGoal(e.target.value)}
                placeholder="Meta clínica"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <textarea
                value={templateTasksText}
                onChange={(e) => setTemplateTasksText(e.target.value)}
                placeholder={"Tarefas (1 por linha)\nTomar medicação\nEscovar os dentes\nChecklist da mochila"}
                className="w-full h-28 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <div>
                <label className="text-xs font-semibold text-slate-600">Duração da orientação (dias)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={templateDurationDays}
                  onChange={(e) => setTemplateDurationDays(Math.min(60, Math.max(1, Number(e.target.value || 14))))}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateScheduleMode("rigid")}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 ${templateScheduleMode === "rigid" ? "border-slate-700 bg-slate-100" : "border-slate-200 bg-white"}`}
                >
                  Rígida (horário)
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateScheduleMode("flex")}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 ${templateScheduleMode === "flex" ? "border-slate-700 bg-slate-100" : "border-slate-200 bg-white"}`}
                >
                  Flexível (período)
                </button>
              </div>
              {templateScheduleMode === "rigid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={templateScheduleTime}
                    onChange={(e) => setTemplateScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={templateReminderEnabled}
                      onChange={(e) => setTemplateReminderEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Lembrete ativo
                  </label>
                </div>
              ) : (
                <select
                  value={templateSchedulePeriod}
                  onChange={(e) => setTemplateSchedulePeriod(e.target.value as HabitFlexPeriod)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="morning">Manhã</option>
                  <option value="afternoon">Tarde</option>
                  <option value="night">Noite</option>
                </select>
              )}
                <button
                  type="button"
                  onClick={() => { void handleSaveTemplate(); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold"
                >
                {editingTemplateId ? "Atualizar orientação" : "Salvar orientação"}
                </button>
              {templates.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-2">
                  <p className="text-xs font-bold text-slate-600 mb-1">Orientações salvas</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {templates.map((template) => (
                      <div key={template.id} className="text-xs text-slate-700 border-b border-slate-100 pb-1 last:border-0">
                        <p className="font-semibold">{template.name} • {template.durationDays} dias</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {template.tasks.join(" • ")}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTemplateId(template.id);
                              setTemplateName(template.name);
                              setTemplateGoal(template.goal);
                              setTemplateTasksText(template.tasks.join("\n"));
                              setTemplateDurationDays(Math.min(60, Math.max(1, Number(template.durationDays || 14))));
                              setTemplateScheduleMode(template.scheduleMode);
                              setTemplateScheduleTime(template.scheduleTime || "07:30");
                              setTemplateSchedulePeriod(template.schedulePeriod || "morning");
                              setTemplateReminderEnabled(Boolean(template.reminderEnabled));
                            }}
                            className="text-[11px] font-bold text-indigo-700"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const confirmDelete = window.confirm(`Excluir orientação "${template.name}"?`);
                              if (!confirmDelete) return;
                              if (window.confirm("Também remover automaticamente esta orientação dos pacientes vinculados?")) {
                                await pushTemplateToLinkedPatients(template, true);
                              }
                              await deleteDoc(doc(db, "professionalRoutineTemplates", template.id));
                            }}
                            className="text-[11px] font-bold text-rose-700"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="font-bold text-slate-900 mb-3">Enviar para Paciente</h2>
            <div className="space-y-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">Selecione a orientação</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedPatientKey}
                onChange={(e) => setSelectedPatientKey(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">Selecione o paciente</option>
                {patients.map((patient) => (
                  <option key={`${patient.familyId}::${patient.childId}`} value={`${patient.familyId}::${patient.childId}`}>
                    {patient.childName} ({patient.familyId.slice(0, 6)}...)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { void handleSendOrientation(); }}
                disabled={isSendingOrientation}
                className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
              >
                {isSendingOrientation ? "Enviando..." : "Enviar orientação para paciente"}
              </button>
            </div>
          </div>
        </section>

        <section className="xl:col-span-8 xl:order-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h2 className="font-bold text-slate-900 mb-2">Visão Geral dos Pacientes</h2>
          {loadingPatients && <p className="text-sm text-slate-500">Carregando pacientes...</p>}
          {!loadingPatients && patients.length === 0 && <p className="text-sm text-slate-500">Nenhum paciente vinculado ainda.</p>}
          {patients.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2">Paciente</th>
                    <th className="py-2">Adesão (7d)</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Última atividade</th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr key={`${patient.familyId}-${patient.childId}`} className="border-b last:border-b-0">
                      <td className="py-2 font-semibold text-slate-800">
                        {patient.childName}
                        {patient.source === "family" && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            aguardando cadastro da pessoa
                          </span>
                        )}
                      </td>
                      <td className="py-2">{patient.adherencePct}%</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          patient.status === "compliant"
                            ? "bg-emerald-100 text-emerald-700"
                            : patient.status === "risk"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-rose-100 text-rose-700"
                        }`}>
                          {patient.status === "compliant" ? "Em dia" : patient.status === "risk" ? "Atenção" : "Crítico"}
                        </span>
                      </td>
                      <td className="py-2">{toDateLabel(patient.lastActivityDate)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => { void handleUnlinkPatient(patient); }}
                          className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-bold"
                        >
                          Desvincular
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="xl:col-span-4 xl:order-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h2 className="font-bold text-slate-900 mb-2">Histórico de Vínculos</h2>
          {linkEvents.length === 0 && <p className="text-sm text-slate-500">Sem eventos de vínculo até agora.</p>}
          {linkEvents.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {linkEvents.slice(0, 40).map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-200 p-2">
                  <p className={`text-xs font-bold ${event.type === "linked" ? "text-emerald-700" : "text-rose-700"}`}>
                    {event.type === "linked" ? "Vinculado" : "Desvinculado"}
                  </p>
                  <p className="text-xs text-slate-700">
                    {event.childName || event.requesterFullName || event.requestedByEmail || "Paciente"} • família {event.familyId.slice(0, 8)}...
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalDashboard;

