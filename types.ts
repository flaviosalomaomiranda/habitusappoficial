
export type IconName = 
  | 'Book' | 'Toothbrush' | 'Bed' | 'Broom' | 'Backpack' | 'Apple' 
  | 'Paintbrush' | 'Soccer' | 'Dog' | 'Cat' | 'Heart' | 'GameController'
  | 'Gift' | 'Trophy' | 'Tv' | 'Star' | 'Sparkles';

export enum RewardType {
  STARS = 'STARS',
  ACTIVITY = 'ACTIVITY',
}

export interface Reward {
  type: RewardType;
  value: number;
  activityName?: string;
}

export type ScheduleType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONCE';
export type LimitPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'NONE';

export interface RewardLimit {
  count: number;
  period: LimitPeriod;
}

export interface HabitSchedule {
  type: ScheduleType;
  days?: number[]; 
  count?: number; // Usado para o modelo antigo de 'mensal'
  date?: string; // Usado para 'ONCE'
  dayOfMonth?: number; // Usado para o novo modelo de 'mensal'
}

export type HabitCompletionStatus = 'COMPLETED' | 'SKIPPED' | 'PENDING';

export type HabitCategory =
  | 'Saude e bem-estar'
  | 'Sono'
  | 'Estudos e leitura'
  | 'Rotina e organizacao'
  | 'Alimentacao'
  | 'Exercicios'
  | 'Higiene'
  | 'Emocoes e convivencia';

export interface Habit {
  id: string;
  name:string;
  icon: IconName;
  imageUrl?: string;
  semanticTags?: string[];
  source?: "manual" | "template" | "qrsaude";
  prescribedByProfessionalId?: string;
  prescribedByProfessionalName?: string;
  prescribedByProfessionalPhotoUrl?: string;
  prescribedByProfessionalWhatsapp?: string;
  prescribedAt?: string;
  category?: HabitCategory;
  schedule: HabitSchedule;
  reward: Reward;
  completions: { [date: string]: HabitCompletionStatus };
  startDate?: string; // Data de início para hábitos recorrentes
}

export interface Child {
  id: string;
  name: string;
  avatar: string;
  stars: number;
  habits: Habit[];
  starHistory: { [date: string]: number };
  birthDate?: string;
  showAgeInfo?: boolean;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  imageUrl?: string;
  isActive?: boolean;
  semanticTags?: string[];
  uf?: string;
  cityId?: string;
  cityName?: string;
  icon?: IconName;
  reward?: Reward;
  schedule?: HabitSchedule;
}

export interface ShopReward {
    id: string;
    name: string;
    icon: IconName;
    cost: number;
    imageUrl?: string;
    semanticTags?: string[];
    limit?: RewardLimit;
}

export interface RedeemedReward {
    id: string;
    childId: string;
    childName?: string;
    reward: ShopReward;
    date: string;
    createdAt?: number;
    isDelivered: boolean;
    deliveryDate?: string; // Campo para registrar o dia da entrega real
}

export interface FamilyLocation {
    uf: string;
    cityId: string;
    cityName: string;
}

export interface AppSettings {
    pin: string | null;
    adminPin?: string | null;
    familyLocation?: FamilyLocation;
    defaultMasterProfessionalId?: string | null;
    semanticTagScores?: Record<string, number>;
}

export type BillingCycle = "monthly" | "annual";

export interface SupportNetworkPricing {
  plans: Record<ProfessionalTier, { monthly: number; annual: number }>;
  updatedAt?: string;
  updatedByEmail?: string | null;
}

export type AgeGroup = "0-2" | "3-5" | "6-10" | "10-12" | "13-17" | "18+";

export type ProfileRole = "kids_teens" | "adults" | "family";

export interface UserProfile {
  city?: FamilyLocation;
  role?: ProfileRole;
  ageGroups?: AgeGroup[];
  mainGoals?: string[];
  habitsToBuild?: string[];
  habitsToReduce?: string[];
  interests?: string[];
  shoppingPreferences?: string[];
  timeGoals?: string[];
  updatedAt?: string;
}

export interface ActivityInspiration {
  id: string;
  ageGroup: AgeGroup;
  text: string;
}

// Modelo de dados da Rede de Apoio atualizado
export interface ProfessionalContact {
    whatsapp?: string;
    phone?: string;
    responsiblePhone?: string;
    email?: string;
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    maps?: string;
    websiteUrl?: string;
    bookingUrl?: string;
    otherLinks?: string[];
}

export interface ExclusiveRoutineTemplate {
  id: string;
  name: string;
  diamonds: number;
}

export type ProfessionalTier = "verified" | "top" | "exclusive" | "master";

export interface Professional {
  id: string;
  name: string;
  personType?: "pf" | "pj";
  legalName?: string;
  tradeName?: string;
  cpf?: string;
  cnpj?: string;
  specialties: string[];
  specialty?: string;
  uf: string;
  city: string; // Nome da cidade para exibição
  cityId: string; // ID do IBGE para filtro
  
  tier: ProfessionalTier;
  tierJoinedAt?: string; // Data ISO de quando entrou no tier atual
  validFrom?: string;
  validTo?: string;
  spotlightKeywords?: string[];
  spotlightDailyLimit?: number;
  verified?: boolean; // Selo de verificado (check de dados)
  isActive?: boolean;
  
  registryLabel?: string; 
  council?: string;
  rqe?: string;
  bookingGreeting?: "dr" | "dra" | "clinic";
  bookingChannel?: "whatsapp" | "phone";
  bookingPhone?: string;
  bookingMessage?: string;
  bio?: string;
  photoUrl?: string;
  contacts: ProfessionalContact;
  videoUrl?: string; 
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressReference?: string;
  addressNeighborhood?: string;
  addressCep?: string;
  addressCity?: string;
  addressUf?: string;
  paymentBilling?: "monthly" | "annual";
  paymentPrice?: number;
  paymentLink?: string;
  paymentStatus?: "pending" | "paid" | "canceled";
  
  // Campos premium
  headline?: string;
  highlights?: string[];
  galleryUrls?: string[];
  exclusiveRoutines?: ExclusiveRoutineTemplate[];
  semanticTags?: string[];
}

export interface Manager {
  id: string;
  fullName: string;
  cpf: string;
  email: string;
  emailLower?: string;
  whatsapp?: string;
  phone?: string;
  address?: string;
  pix?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  bankAccountType?: "corrente" | "poupanca";
  mustChangePassword?: boolean;
  status: "active" | "inactive";
  uf: string;
  cityIds: string[];
  cityNames?: string[];
  commissionPercent?: number;
  clientsRegistered?: number;
  clientsPaying?: number;
  profilePhotoUrl?: string;
  inviteStatus?: "pending" | "active";
  authUserId?: string;
  resetLinkSentAt?: string;
  createdAt?: string;
  updatedAt?: string;
}


export interface AdContent {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  href: string;
  imageUrl?: string;
  color?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  category: string;
  description?: string;
  imageUrl?: string;
  ctaLabel?: string;
  linkUrl: string;
  isAffiliate?: boolean;
  isActive?: boolean;
  tags?: string[];
  ageMin?: number | null;
  ageMax?: number | null;
  priority?: number;
  placement?: "master" | "hero" | "contextual_footer" | "explore";
  createdAt: string;
  updatedAt: string;
}

export interface AdMatchInput {
  userTaskTags?: string[];
  userRewardTags?: string[];
  userLocation?: FamilyLocation;
}

export interface TagTaxonomy {
  officialTags: string[];
  synonyms: Record<string, string>;
  updatedAt?: string;
  updatedByEmail?: string | null;
}

export interface SuggestedTag {
  tag: string;
  count: number;
}






