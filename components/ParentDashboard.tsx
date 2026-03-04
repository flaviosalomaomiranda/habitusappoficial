import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { isAdminUser } from "../src/lib/admin";
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../src/lib/firebase";

import { signOut } from "firebase/auth";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';


import { Child, Habit, Professional } from '../types';
import { PlusIcon, UserCircleIcon, PencilIcon, ClipboardListIcon, StarsIcon, ChartBarIcon, TrashIcon, XCircleIcon, CheckCircleIcon, MenuIcon, UserIcon, GiftIcon, UsersIcon, MapPinIcon, HeartIcon, TvIcon, BellIcon, ShoppingBagIcon } from './icons/MiscIcons';
import AddChildModal from './AddChildModal';
import EditChildModal from './EditChildModal';
import AddHabitModal from './AddHabitModal';
import ManageTemplatesModal from './ManageTemplatesModal';
import ManageRewardsModal from './ManageRewardsModal';
import ProgressDashboardModal from './ProgressDashboardModal';
import ParentRewardShopModal from './ParentRewardShopModal';
import ProductsRecommendations from './ProductsRecommendations';
import SupportNetworkPage from './SupportNetworkPage';
import AdSlot from './AdSlot';
import ManageSupportNetworkModal from './ManageSupportNetworkModal';
import ManageSupportNetworkPricingModal from './ManageSupportNetworkPricingModal';
import ManageMasterDefaultsModal from './ManageMasterDefaultsModal';
import ManageRecommendationsModal from './ManageRecommendationsModal';
import ManageTagCatalogModal from './ManageTagCatalogModal';
import UserProfileModal from './UserProfileModal';
import ManageFamilyMembersModal from './ManageFamilyMembersModal';
import ManageManagersModal from './ManageManagersModal';
import RoutineLibraryPage from './RoutineLibraryPage';
import ChildAvatar from './ChildAvatar';
import { HABIT_ICONS, getHabitCategoryStyle } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { getTodayDateString, calculateAge, daysUntilNextBirthday } from '../utils/dateUtils';
import { inferSemanticTags } from '../utils/semanticTags';
import { pickContextualFooterAd } from '../utils/adMatching';
import { ROUTINE_LIBRARY_AREAS } from '../data/routineLibraryData';

type DeletionInfo = {
    childId: string;
    habitId: string;
    habitName: string;
    date: string;
}

type ParentView = 'dashboard' | 'recommendations' | 'supportNetwork' | 'routineLibrary' | 'favorites' | 'manageLinks' | 'adminTemplates' | 'adminSupportNetwork' | 'adminRecommendations' | 'adminSupportNetworkPricing' | 'adminMasterDefaults' | 'adminTagCatalog';

type FamilyProfessionalLink = {
    id: string;
    professionalId: string;
    professionalName: string;
    status: string;
    linkedChildIds: string[];
    consentBlocks: { personal: boolean; profile: boolean; health: boolean };
    linkExpiresAtMs: number | null;
};

type FamilyAppointment = {
    id: string;
    professionalId: string;
    childId: string;
    childName: string;
    startsAtIso: string;
    durationMin: number;
    notes: string;
    tags: string[];
    patientStatus: 'pending' | 'confirmed' | 'cancelled';
    syncToPatientCard: boolean;
    cancelledByProfessional?: boolean;
};

type LinkDraft = {
    linkedChildIds: string[];
    consentBlocks: { personal: boolean; profile: boolean; health: boolean };
    expiresAtDate: string;
};

type AchievementShareMode = "summary" | "list" | "full";

interface ParentDashboardProps {
    onEnterTvMode: () => void;
}
const MAX_FREEMIUM_PROFILES = 4; // principal + 3 secundarios

const rotateBySeed = <T,>(items: T[], seed: number): T[] => {
    if (items.length <= 1) return items;
    const shift = Math.abs(seed) % items.length;
    if (shift === 0) return items;
    return [...items.slice(shift), ...items.slice(0, shift)];
};

const normalizeText = (value?: string) => (value || "").trim().toLowerCase();

const matchesProfessionalByLocation = (
    professional: Professional,
    location?: { uf?: string; cityId?: string; cityName?: string }
) => {
    if (!location) return true;
    const selectedUf = normalizeText(location.uf);
    const selectedCityId = String(location.cityId || "").trim();
    const selectedCityName = normalizeText(location.cityName);

    const profUf = normalizeText(professional.uf);
    const profCityId = String(professional.cityId || "").trim();
    const profCityName = normalizeText(professional.city);

    const ufMatches = !selectedUf || profUf === selectedUf;
    const cityMatchesById = !!selectedCityId && !!profCityId && profCityId === selectedCityId;
    const cityMatchesByName = !!selectedCityName && !!profCityName && profCityName === selectedCityName;
    const cityMatches = cityMatchesById || (cityMatchesByName && ufMatches);

    if (selectedCityId || selectedCityName) return cityMatches;
    if (selectedUf) return ufMatches;
    return true;
};

const getSpecialtiesLabel = (prof: Professional) => {
    const list = prof.specialties && prof.specialties.length > 0
        ? prof.specialties
        : prof.specialty
            ? [prof.specialty]
            : [];
    return list.join(", ");
};

const buildBookingMessage = (professional: Professional) => {
    if (professional.bookingMessage) return professional.bookingMessage;
    const greeting = professional.bookingGreeting || "dra";
    if (greeting === "clinic") {
        return "Oi, pessoal! Estou usando o Habitus App e gostaria de agendar uma consulta.";
    }
    const label = greeting === "dr" ? "Dr." : "Dra.";
    const suffix = professional.name ? ` ${professional.name}` : "";
    return `Olá ${label}${suffix}, estou usando o Habitus App e gostaria de agendar uma consulta.`;
};

const buildWhatsAppLink = (phone: string, message: string) => {
    const cleaned = phone.replace(/\D/g, "");
    const withCountryCode = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
    const text = encodeURIComponent(message);
    return `https://wa.me/${withCountryCode}?text=${text}`;
};

const isValidHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const timestampToMs = (value: any): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value?.toMillis === "function") return Number(value.toMillis());
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};

const toIsoDate = (ms: number) => {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const getRecommendationBadgeClassName = (type?: "app_exclusive" | "offer" | "coupon" | "urgency") => {
    if (type === "app_exclusive") return "bg-purple-600 text-white";
    if (type === "coupon") return "bg-emerald-600 text-white";
    if (type === "urgency") return "bg-amber-500 text-white";
    return "bg-rose-600 text-white";
};

const getRecommendationCategoryClassName = (category?: string) => {
    const normalized = (category || "").toLowerCase();
    if (normalized.includes("livro") || normalized.includes("leitura")) return "bg-blue-100 text-blue-700";
    if (normalized.includes("brinquedo")) return "bg-orange-100 text-orange-700";
    if (normalized.includes("tecnologia")) return "bg-slate-100 text-slate-700";
    if (normalized.includes("sono")) return "bg-indigo-100 text-indigo-700";
    if (normalized.includes("rotina")) return "bg-purple-100 text-purple-700";
    return "bg-gray-100 text-gray-700";
};

const getHabitScheduleMeta = (habit: Habit) => {
    const mode = habit.schedule?.mode || (habit.schedule?.time ? "rigid" : "flex");
    if (mode === "rigid") {
        return {
            mode,
            label: habit.schedule?.time ? `⏰ ${habit.schedule.time}` : "⏰ horário",
            className: "bg-rose-100 text-rose-700",
        };
    }
    const period = habit.schedule?.period || "morning";
    const periodLabel = period === "afternoon" ? "Tarde" : period === "night" ? "Noite" : "Manhã";
    return {
        mode,
        label: `🕒 ${periodLabel}`,
        className: "bg-blue-100 text-blue-700",
    };
};

const getHabitLeftSwipeAction = (habit: Habit) => {
    const type = habit.leftSwipeActionType;
    const label = habit.leftSwipeActionLabel?.trim();
    if (!type || !label) return null;

    if (type === "whatsapp") {
        const phone = (habit.leftSwipeActionWhatsapp || "").replace(/\D/g, "");
        if (phone.length < 10) return null;
        const message = `Olá! Vi o hábito "${habit.name}" no Habitus e gostaria de agendar uma consulta.`;
        return { label, href: buildWhatsAppLink(phone, message) };
    }

    const url = (habit.leftSwipeActionUrl || "").trim();
    if (!isValidHttpUrl(url)) return null;
    return { label, href: url };
};

// Card para profissionais Master ou Exclusivo na Home (Versão Fixa e Compacta)
const SupportSpotlightCard: React.FC<{ 
    prof: Professional, 
    type: 'master' | 'pro' | 'exclusive', 
    onOpenNetwork: () => void,
    isCollapsed: boolean,
    onToggle: () => void,
    collapsible?: boolean
}> = ({ prof, type, onOpenNetwork, isCollapsed, onToggle, collapsible = true }) => {
    if (type === "master" && prof.videoUrl) {
        return (
            <div className="relative w-full overflow-hidden rounded-2xl border border-purple-300 shadow-md bg-black">
                <video
                    src={prof.videoUrl}
                    className="w-full h-40 sm:h-60 md:h-72 lg:h-80 object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

                <div className="absolute top-2 right-2 px-2 py-0.5 text-[9px] font-black uppercase tracking-tight rounded-full bg-yellow-400 text-purple-900">
                    MASTER
                </div>

                <div className="absolute bottom-2 left-2 right-2 sm:left-4 sm:right-4 space-y-2 text-white">
                    <div className="flex items-center gap-3">
                        <img
                            src={prof.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.name)}&background=random`}
                            alt={prof.name}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border border-white/40"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm sm:text-base truncate">{prof.name}</h4>
                                <span className="text-[10px] sm:text-xs opacity-80 truncate">• {getSpecialtiesLabel(prof)}</span>
                            </div>
                            <p className="text-[10px] sm:text-xs opacity-80 flex items-center gap-1 truncate">
                                <MapPinIcon className="w-3 h-3"/> {prof.city} - {prof.uf}
                            </p>
                        </div>
                    </div>

                    {prof.headline && (
                        <p className="text-[11px] sm:text-xs bg-white/10 px-2 py-1 rounded-md line-clamp-2">
                            {prof.headline}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                            <a
                                href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-w-[120px] text-center font-bold text-xs sm:text-sm py-2 rounded-lg bg-green-500 text-white hover:bg-green-600"
                            >
                                WhatsApp
                            </a>
                        )}
                        {prof.contacts.maps && (
                            <a
                                href={prof.contacts.maps}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-w-[120px] text-center font-bold text-xs sm:text-sm py-2 rounded-lg bg-white/15 text-white hover:bg-white/25"
                            >
                                Localização
                            </a>
                        )}
                        {prof.contacts.instagram && (
                            <a
                                href={prof.contacts.instagram}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-w-[120px] text-center font-bold text-xs sm:text-sm py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
                            >
                                Instagram
                            </a>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div 
            onClick={collapsible ? onToggle : undefined}
            className={`p-3 rounded-xl border shadow-sm relative overflow-hidden transition-all ${collapsible ? 'cursor-pointer' : ''} ${
                type === 'master'
                    ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white border-violet-400'
                    : type === 'pro'
                        ? 'bg-gradient-to-r from-purple-500 to-purple-700 text-white border-purple-400'
                        : 'bg-white border-purple-200'
            }`}
        >
            {/* Badge de Nível */}
            <div className={`absolute top-0 right-0 px-2 py-0.5 text-[8px] font-black uppercase tracking-tight rounded-bl-lg ${
                type === 'master'
                    ? 'bg-yellow-400 text-purple-900'
                    : type === 'pro'
                        ? 'bg-white/20 text-white'
                        : 'bg-purple-100 text-purple-800'
            }`}>
                {type === 'master' ? 'MASTER' : type === 'pro' ? 'PRO' : 'PREMIUM'}
            </div>
            
            <div className="flex gap-3 items-center">
                <img 
                    src={prof.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.name)}&background=random`}
                    alt={prof.name}
                    className={`object-cover rounded-full border border-white/20 shadow-sm transition-all ${isCollapsed ? 'w-10 h-10' : 'w-14 h-14'}`}
                />
                <div className="flex-1 min-w-0">
                    <h4 className={`font-bold truncate ${isCollapsed ? 'text-sm' : 'text-base'} ${type === 'master' || type === 'pro' ? 'text-white' : 'text-gray-800'}`}>
                        {prof.name}
                    </h4>
                    <p className={`text-[10px] sm:text-xs truncate ${type === 'master' || type === 'pro' ? 'text-purple-100' : 'text-gray-500'}`}>
                        {getSpecialtiesLabel(prof)}
                    </p>
                    <p className={`text-[9px] flex items-center gap-1 ${type === 'master' || type === 'pro' ? 'text-purple-200' : 'text-gray-400'}`}>
                        <MapPinIcon className="w-2.5 h-2.5"/> {prof.city} - {prof.uf}
                    </p>
                </div>

                {/* Ícone de Expansão */}
                {collapsible && (
                    <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                )}
            </div>

            {/* Detalhes Expandidos */}
            {!isCollapsed && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    {prof.headline && (
                        <p className={`text-xs italic mb-3 px-2 py-1.5 rounded-lg ${type === 'master' || type === 'pro' ? 'bg-white/10 text-purple-50' : 'bg-gray-50 text-gray-600'}`}>
                            "{prof.headline}"
                        </p>
                    )}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                            <a
                                href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex-1 text-center font-bold text-[11px] py-2 rounded-lg transition-all ${
                                    type === 'master'
                                        ? 'bg-yellow-400 text-purple-900 hover:bg-yellow-300'
                                        : type === 'pro'
                                            ? 'bg-white text-purple-700 hover:bg-purple-50'
                                            : 'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                            >
                                Contato
                            </a>
                        )}
                        {type === "exclusive" && (
                            <button type="button" className="px-3 flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-purple-700">
                                <span className="text-[9px] font-bold uppercase">Rotinas</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenNetwork();
                            }}
                            className={`px-3 flex items-center justify-center rounded-lg border ${
                                type === 'master' || type === 'pro' ? 'border-white/30 text-white hover:bg-white/10' : 'border-gray-200 bg-gray-50 text-gray-700'
                            }`}
                        >
                            <span className="text-[9px] font-bold uppercase">Perfil</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Botões Compactos (Sempre visíveis mas menores se colapsado) */}
            {isCollapsed && collapsible && (
                <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                        <a
                            href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex-1 text-center font-bold text-[10px] py-1 rounded-md bg-green-500 text-white`}
                        >
                            Contato
                        </a>
                    )}
                    {type === "exclusive" && (
                        <button type="button" className={`px-2 py-1 text-[10px] font-bold rounded-md border ${type === 'master' ? 'border-white/30 text-white' : 'border-gray-200 text-gray-500'}`}>
                            Rotinas
                        </button>
                    )}
                    <button onClick={onOpenNetwork} className={`px-2 py-1 text-[10px] font-bold rounded-md border ${type === 'master' ? 'border-white/30 text-white' : 'border-gray-200 text-gray-500'}`}>
                        Perfil
                    </button>
                </div>
            )}
        </div>
    );
};

// Card compacto para profissionais favoritados
const SupportFavoriteTopCard: React.FC<{ prof: Professional; onToggleFavorite: (id: string) => void }> = ({ prof, onToggleFavorite }) => (
    <div className="bg-gradient-to-br from-purple-50 to-white p-3 rounded-xl border border-purple-300 shadow-sm space-y-2 relative h-full flex flex-col min-h-[200px] sm:min-h-[220px]">
        <div className="flex items-start gap-3">
            <img
                src={prof.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.name)}&background=random`}
                alt={prof.name}
                className="w-12 h-12 rounded-full object-cover border border-white shadow-sm"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm truncate text-gray-800">⭐ {prof.name}</h4>
                    <button
                        type="button"
                        onClick={() => onToggleFavorite(prof.id)}
                        className="p-1 rounded-full bg-white/80 text-red-500 hover:bg-white transition-colors"
                        aria-label="Remover dos favoritos"
                    >
                        <HeartIcon filled className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs text-gray-500 truncate">{getSpecialtiesLabel(prof)}</p>
                {prof.city && prof.uf && <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {prof.city} - {prof.uf}</p>}
            </div>
        </div>

        {prof.headline && (
            <p className="text-xs text-gray-700 bg-purple-100/70 rounded-md px-2 py-1 line-clamp-2">
                {prof.headline}
            </p>
        )}

        {prof.galleryUrls && prof.galleryUrls.length > 0 && (
            <div className="space-y-1.5">
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {prof.galleryUrls.slice(0, 4).map((url, idx) => (
                        <img
                            key={`${prof.id}-top-g-${idx}`}
                            src={url}
                            alt={`${prof.name} destaque ${idx + 1}`}
                            className="w-12 h-9 sm:w-14 sm:h-10 rounded-lg object-cover border border-purple-200 flex-shrink-0"
                        />
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    {prof.galleryUrls.slice(0, 4).map((_, idx) => (
                        <span
                            key={`${prof.id}-top-dot-${idx}`}
                            className={`h-1.5 w-1.5 rounded-full ${idx === 0 ? 'bg-purple-500' : 'bg-purple-200'}`}
                        />
                    ))}
                </div>
            </div>
        )}

        {prof.highlights && prof.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
                {prof.highlights.slice(0, 3).map((item, idx) => (
                    <span key={`${prof.id}-top-h-${idx}`} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                        {item}
                    </span>
                ))}
            </div>
        )}
        {prof.bio && (
            <p
                className="text-xs text-gray-600"
                style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    wordBreak: "break-word",
                }}
            >
                {prof.bio}
            </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                <a
                    href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-purple-600 text-white font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                >
                    Entrar em contato
                </a>
            )}
            {prof.contacts.phone && (
                <a
                    href={`tel:${prof.contacts.phone}`}
                    className="flex-1 text-center bg-purple-100 text-purple-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-purple-200 transition-colors whitespace-nowrap"
                >
                    Ligar
                </a>
            )}
            {prof.contacts.maps && (
                <a
                    href={prof.contacts.maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-emerald-100 text-emerald-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-emerald-200 transition-colors whitespace-nowrap"
                >
                    Localização
                </a>
            )}
        </div>
    </div>
);

const SupportFavoriteVerifiedCard: React.FC<{ prof: Professional; onToggleFavorite: (id: string) => void }> = ({ prof, onToggleFavorite }) => (
    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2 h-full flex flex-col min-h-[200px] sm:min-h-[220px]">
        <div className="flex items-start gap-3">
            <img
                src={prof.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.name)}&background=random`}
                alt={prof.name}
                className="w-11 h-11 rounded-full object-cover border border-white shadow-sm"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm truncate flex items-center gap-2">
                        <span className="truncate">{prof.name}</span>
                        {prof.verified && <span className="flex-shrink-0 text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">✅ Registro verificado</span>}
                    </h4>
                    <button
                        type="button"
                        onClick={() => onToggleFavorite(prof.id)}
                        className="p-1 rounded-full bg-white text-red-500 transition-colors"
                        aria-label="Remover dos favoritos"
                    >
                        <HeartIcon filled className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs text-gray-500 truncate">{getSpecialtiesLabel(prof)}</p>
                {prof.city && prof.uf && <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {prof.city} - {prof.uf}</p>}
            </div>
        </div>

        {prof.headline && (
            <p className="text-xs text-gray-600 bg-gray-100 rounded-md px-2 py-1 line-clamp-2">
                {prof.headline}
            </p>
        )}

        {prof.galleryUrls && prof.galleryUrls.length > 0 && (
            <div className="space-y-1.5">
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {prof.galleryUrls.slice(0, 4).map((url, idx) => (
                        <img
                            key={`${prof.id}-ver-g-${idx}`}
                            src={url}
                            alt={`${prof.name} destaque ${idx + 1}`}
                            className="w-12 h-9 sm:w-14 sm:h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                        />
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    {prof.galleryUrls.slice(0, 4).map((_, idx) => (
                        <span
                            key={`${prof.id}-ver-dot-${idx}`}
                            className={`h-1.5 w-1.5 rounded-full ${idx === 0 ? 'bg-gray-500' : 'bg-gray-300'}`}
                        />
                    ))}
                </div>
            </div>
        )}

        {prof.highlights && prof.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
                {prof.highlights.slice(0, 2).map((item, idx) => (
                    <span key={`${prof.id}-ver-h-${idx}`} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                        {item}
                    </span>
                ))}
            </div>
        )}
        {prof.bio && (
            <p
                className="text-xs text-gray-600"
                style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    wordBreak: "break-word",
                }}
            >
                {prof.bio}
            </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                <a
                    href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-green-100 text-green-800 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-green-200 whitespace-nowrap"
                >
                    Entrar em contato
                </a>
            )}
            {prof.contacts.phone && (
                <a
                    href={`tel:${prof.contacts.phone}`}
                    className="flex-1 text-center bg-purple-100 text-purple-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-purple-200 transition-colors whitespace-nowrap"
                >
                    Ligar
                </a>
            )}
            {prof.contacts.maps && (
                <a
                    href={prof.contacts.maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-emerald-100 text-emerald-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-emerald-200 transition-colors whitespace-nowrap"
                >
                    Localização
                </a>
            )}
        </div>
    </div>
);


const ParentDashboard: React.FC<ParentDashboardProps> = ({ onEnterTvMode }) => {
  const { familyId, settings, userProfile, supportNetworkDefaultMasters, children, deleteHabit, skipHabitForDate, getHabitsForChildOnDate, toggleHabitCompletion, rejectHabitCompletion, redeemedRewards, toggleRewardDelivery, getFavoriteProfessionals, toggleFavoriteProfessional, supportNetworkProfessionals, activeSupportNetworkProfessionals, productRecommendations, routineTemplates, trackProfessionalEvent, trackAdEvent, isFamilyOwner, canManageMembers, canEditChildren, canEditHabits, canMarkHabits, isManager } = useAppContext();

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setCurrentUserEmail(user?.email ?? null);
        });
        return () => unsub();
    }, []);
    const professionalRotationSeedRef = useRef<number>(Math.floor(Math.random() * 997));

  const isAdmin = isAdminUser(currentUserEmail);

  const canWriteChildren = isFamilyOwner || canEditChildren || canManageMembers;
  const canWriteHabits = isFamilyOwner || canEditHabits || canManageMembers;

  // ... resto do seu código

    
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
    const selectedChild = useMemo(() => children.find(c => c.id === selectedChildId), [children, selectedChildId]);
    const orderedChildren = useMemo(() => {
  if (!selectedChildId) return children;
  const selected = children.find(c => c.id === selectedChildId);
  const rest = children.filter(c => c.id !== selectedChildId);
  return selected ? [selected, ...rest] : children;
}, [children, selectedChildId]);

const pinnedChildren = orderedChildren.slice(0, 3); // sempre visíveis
const extraChildren = orderedChildren.slice(3);     // só daqui em diante tem scroll


    const [currentView, setCurrentView] = useState<ParentView>('dashboard');
    const isAdminPanelView = currentView === 'adminTemplates' || currentView === 'adminSupportNetwork' || currentView === 'adminRecommendations' || currentView === 'adminSupportNetworkPricing' || currentView === 'adminMasterDefaults' || currentView === 'adminTagCatalog';

    // Estado de Colapso do Spotlight Premium
    const [isPremiumCollapsed, setIsPremiumCollapsed] = useState(() => {
        const saved = localStorage.getItem('premiumSpotlightCollapsed');
        return saved === null ? true : JSON.parse(saved);
    });
    const [premiumRotationTick, setPremiumRotationTick] = useState(0);
    const [isDocumentVisible, setIsDocumentVisible] = useState(
        typeof document === "undefined" ? true : document.visibilityState === "visible"
    );
    const isDashboardActive = currentView === "dashboard" && isDocumentVisible;
    const premiumRotationWindowMs = isDashboardActive ? 2 * 60 * 1000 : 5 * 60 * 1000;

    useEffect(() => {
        localStorage.setItem('premiumSpotlightCollapsed', JSON.stringify(isPremiumCollapsed));
    }, [isPremiumCollapsed]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            setIsDocumentVisible(document.visibilityState === "visible");
            setPremiumRotationTick((prev) => prev + 1);
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, []);

    useEffect(() => {
        const intervalMs = isDashboardActive ? 20_000 : 60_000;
        const timer = window.setInterval(() => {
            setPremiumRotationTick((prev) => prev + 1);
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [isDashboardActive]);

    const todayStr = getTodayDateString();
    const [adQuotaTargets, setAdQuotaTargets] = useState<{
        defaults: { premiumHeroTarget: number; proCarouselTarget: number };
        byCityId: Record<string, { premiumHeroTarget?: number; proCarouselTarget?: number }>;
    }>({
        defaults: { premiumHeroTarget: 400, proCarouselTarget: 250 },
        byCityId: {},
    });

    // Filtros de Cidade Atual da Família (REATIVO)
    const familyLocation = userProfile?.city || settings.familyLocation;
    const hasCompletedProfile = Boolean(userProfile?.city?.uf && userProfile?.city?.cityId);
    const selectedCityQuota = familyLocation?.cityId ? adQuotaTargets.byCityId[String(familyLocation.cityId)] : null;
    const premiumDailyTarget = Math.max(1, Number(selectedCityQuota?.premiumHeroTarget ?? adQuotaTargets.defaults.premiumHeroTarget ?? 400));
    const proDailyTarget = Math.max(1, Number(selectedCityQuota?.proCarouselTarget ?? adQuotaTargets.defaults.proCarouselTarget ?? 250));
    const [dailyProfessionalImpressions, setDailyProfessionalImpressions] = useState<Record<string, { hero: number; pro: number }>>({});

    useEffect(() => {
        const quotaRef = doc(db, "supportNetworkSettings", "adQuotaTargets");
        const unsub = onSnapshot(
            quotaRef,
            (snap) => {
                if (!snap.exists()) {
                    setAdQuotaTargets({
                        defaults: { premiumHeroTarget: 400, proCarouselTarget: 250 },
                        byCityId: {},
                    });
                    return;
                }
                const data = snap.data() as any;
                setAdQuotaTargets({
                    defaults: {
                        premiumHeroTarget: Math.max(1, Number(data?.defaults?.premiumHeroTarget ?? 400)),
                        proCarouselTarget: Math.max(1, Number(data?.defaults?.proCarouselTarget ?? 250)),
                    },
                    byCityId: (data?.byCityId && typeof data.byCityId === "object") ? data.byCityId : {},
                });
            },
            (err) => console.error("Falha ao ler metas de cota de anúncios:", err)
        );
        return () => unsub();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "supportNetworkDailyStats"), where("date", "==", todayStr));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const next: Record<string, { hero: number; pro: number }> = {};
                snap.docs.forEach((docSnap) => {
                    const data = docSnap.data() as any;
                    const professionalId = String(data?.professionalId || "");
                    if (!professionalId) return;
                    const cityId = String(data?.cityId || "");
                    const selectedCityId = String(familyLocation?.cityId || "");
                    if (selectedCityId && cityId && cityId !== selectedCityId) return;
                    const slotGroup = String(data?.slotGroup || "");
                    const impressions = Number(data?.impressions || 0);
                    if (!Number.isFinite(impressions) || impressions <= 0) return;
                    if (!next[professionalId]) {
                        next[professionalId] = { hero: 0, pro: 0 };
                    }
                    if (slotGroup === "hero_exclusive") next[professionalId].hero += impressions;
                    if (slotGroup === "pro_carousel") next[professionalId].pro += impressions;
                });
                setDailyProfessionalImpressions(next);
            },
            (err) => console.error("Falha ao ler supportNetworkDailyStats:", err)
        );
        return () => unsub();
    }, [todayStr, familyLocation?.cityId]);

    const masterProfessional = useMemo(() => {
        const activeCityMaster = familyLocation?.cityId
            ? activeSupportNetworkProfessionals.find((p) => p.tier === 'master' && p.cityId === familyLocation.cityId)
            : null;
        if (activeCityMaster) return activeCityMaster;

        const cityDefaultId = familyLocation?.cityId ? supportNetworkDefaultMasters.byCityId?.[String(familyLocation.cityId)] : null;
        if (cityDefaultId) {
            const fallbackByCity = supportNetworkProfessionals.find((p) => p.id === cityDefaultId && p.isActive !== false);
            if (fallbackByCity) return fallbackByCity;
        }

        const ufDefaultLegacyId = familyLocation?.uf ? supportNetworkDefaultMasters.byUfLegacy?.[familyLocation.uf] : null;
        if (ufDefaultLegacyId) {
            const fallbackByUf = supportNetworkProfessionals.find((p) => p.id === ufDefaultLegacyId && p.isActive !== false);
            if (fallbackByUf) return fallbackByUf;
        }

        const globalDefaultId = supportNetworkDefaultMasters.globalProfessionalId;
        if (globalDefaultId) {
            const fallbackGlobal = supportNetworkProfessionals.find((p) => p.id === globalDefaultId && p.isActive !== false);
            if (fallbackGlobal) return fallbackGlobal;
        }

        const defaultMasterId = settings.defaultMasterProfessionalId;
        if (defaultMasterId) {
            const fallbackById = supportNetworkProfessionals.find(
                (p) => p.id === defaultMasterId && p.isActive !== false
            );
            if (fallbackById) return fallbackById;
        }

        const anyActiveMaster = activeSupportNetworkProfessionals.find((p) => p.tier === "master");
        return anyActiveMaster ?? null;
    }, [activeSupportNetworkProfessionals, familyLocation, settings.defaultMasterProfessionalId, supportNetworkDefaultMasters, supportNetworkProfessionals]);

    const cityProProfessionals = useMemo(() => {
        const activeProPool = activeSupportNetworkProfessionals
            .filter((p) => p.tier === "top" || p.tier === "pro")
            .sort((a, b) => a.name.localeCompare(b.name));
        const anyProPool = supportNetworkProfessionals
            .filter((p) => p.tier === "top" || p.tier === "pro")
            .sort((a, b) => a.name.localeCompare(b.name));
        const proPool = activeProPool.length > 0 ? activeProPool : anyProPool;
        const exactCity = proPool.filter((p) => matchesProfessionalByLocation(p, familyLocation || undefined));
        const ufFallback = proPool.filter((p) => normalizeText(p.uf) === normalizeText(familyLocation?.uf));
        const ordered = exactCity.length > 0 ? exactCity : (ufFallback.length > 0 ? ufFallback : proPool);
        const prioritized = [...ordered].sort((a, b) => {
            const aImpressions = dailyProfessionalImpressions[a.id]?.pro ?? 0;
            const bImpressions = dailyProfessionalImpressions[b.id]?.pro ?? 0;
            const aBelow = aImpressions < proDailyTarget ? 0 : 1;
            const bBelow = bImpressions < proDailyTarget ? 0 : 1;
            if (aBelow !== bBelow) return aBelow - bBelow;
            const ratioDiff = (aImpressions / proDailyTarget) - (bImpressions / proDailyTarget);
            if (Math.abs(ratioDiff) > 0.0001) return ratioDiff;
            if (aImpressions !== bImpressions) return aImpressions - bImpressions;
            return a.name.localeCompare(b.name);
        });
        const dailyShift = Number(todayStr.replaceAll("-", ""));
        return rotateBySeed(prioritized, professionalRotationSeedRef.current + dailyShift);
    }, [activeSupportNetworkProfessionals, supportNetworkProfessionals, familyLocation?.cityId, familyLocation?.uf, familyLocation?.cityName, todayStr, dailyProfessionalImpressions, proDailyTarget]);

    const cityExclusiveProfessionals = useMemo(() => {
        const activeExclusivePool = activeSupportNetworkProfessionals
            .filter((p) => p.tier === "exclusive")
            .sort((a, b) => a.name.localeCompare(b.name));
        const anyExclusivePool = supportNetworkProfessionals
            .filter((p) => p.tier === "exclusive")
            .sort((a, b) => a.name.localeCompare(b.name));
        const exclusivePool = activeExclusivePool.length > 0 ? activeExclusivePool : anyExclusivePool;
        const exactCity = exclusivePool.filter((p) => matchesProfessionalByLocation(p, familyLocation || undefined));
        const ufFallback = exclusivePool.filter((p) => normalizeText(p.uf) === normalizeText(familyLocation?.uf));
        const ordered = exactCity.length > 0 ? exactCity : (ufFallback.length > 0 ? ufFallback : exclusivePool);
        return rotateBySeed(ordered, professionalRotationSeedRef.current + 7);
    }, [activeSupportNetworkProfessionals, supportNetworkProfessionals, familyLocation?.cityId, familyLocation?.uf, familyLocation?.cityName]);

    const heroExclusiveProfessional = useMemo(() => {
        if (cityExclusiveProfessionals.length === 0) return null;
        if (cityExclusiveProfessionals.length === 1) return cityExclusiveProfessionals[0];
        const scored = cityExclusiveProfessionals.map((professional) => {
            const impressions = dailyProfessionalImpressions[professional.id]?.hero ?? 0;
            return {
                professional,
                impressions,
                ratio: impressions / premiumDailyTarget,
            };
        });
        const belowTarget = scored.filter((item) => item.impressions < premiumDailyTarget);
        const pool = (belowTarget.length > 0 ? belowTarget : scored)
            .sort((a, b) => {
                if (Math.abs(a.ratio - b.ratio) > 0.0001) return a.ratio - b.ratio;
                if (a.impressions !== b.impressions) return a.impressions - b.impressions;
                return a.professional.name.localeCompare(b.professional.name);
            });
        const bucket = Math.floor(Date.now() / premiumRotationWindowMs);
        const cityKey = familyLocation?.cityId || familyLocation?.uf || "global";
        const cityHash = String(cityKey).split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const index = (bucket + cityHash) % pool.length;
        return pool[index]?.professional || pool[0]?.professional || null;
    }, [cityExclusiveProfessionals, familyLocation?.cityId, familyLocation?.uf, premiumRotationTick, premiumRotationWindowMs, dailyProfessionalImpressions, premiumDailyTarget]);

    const proCarouselChunks = useMemo(() => {
        const dedupedMap = new Map<string, Professional>(
            cityProProfessionals.map((p) => [p.id, p] as [string, Professional])
        );
        const deduped = Array.from(dedupedMap.values());
        const chunks: Professional[][] = [];
        const CHUNK_SIZE = 5;
        const MAX_CHUNKS = 3;
        for (let i = 0; i < deduped.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
            const next = deduped.slice(i, i + CHUNK_SIZE);
            if (next.length > 0) chunks.push(next);
        }
        return chunks;
    }, [cityProProfessionals]);

    const proInsertPositions = useMemo(() => {
        const firstIndex = heroExclusiveProfessional ? 5 : 1; // após 6º, ou após 2º se não houver exclusive
        const blockSpacing = 6; // distancia mínima em hábitos entre blocos PRO
        return [firstIndex, firstIndex + blockSpacing, firstIndex + blockSpacing * 2];
    }, [heroExclusiveProfessional]);

    const favoriteProfessionals = getFavoriteProfessionals();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAddChildModalOpen, setAddChildModalOpen] = useState(false);
    const [editingChild, setEditingChild] = useState<Child | null>(null);
    const [isAddHabitModalOpen, setAddHabitModalOpen] = useState(false);
    const [isManageRewardsModalOpen, setManageRewardsModalOpen] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState<DeletionInfo | null>(null);
    
    const [isProgressModalOpen, setProgressModalOpen] = useState(false);
    const [isRewardShopOpen, setRewardShopOpen] = useState(false);
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    const [isManageMembersModalOpen, setManageMembersModalOpen] = useState(false);
    const [isManageManagersModalOpen, setManageManagersModalOpen] = useState(false);
    const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; type?: string; metadata?: any; readAt?: any; createdAt?: any }>>([]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [pendingLinkAction, setPendingLinkAction] = useState<{
        notificationId: string;
        requestId: string;
        professionalName: string;
        requestedConsentBlocks?: { personal: boolean; profile: boolean; health: boolean } | null;
    } | null>(null);
    const [selectedSharedChildId, setSelectedSharedChildId] = useState<string>("");
    const [sharePersonalBlock, setSharePersonalBlock] = useState(true);
    const [shareProfileBlock, setShareProfileBlock] = useState(true);
    const [shareHealthBlock, setShareHealthBlock] = useState(true);
    const [generatedLinkCode, setGeneratedLinkCode] = useState<string | null>(null);
    const [generatedLinkCodeExpiresAtMs, setGeneratedLinkCodeExpiresAtMs] = useState<number | null>(null);
    const [linkCodeNowMs, setLinkCodeNowMs] = useState<number>(Date.now());
    const [isProcessingLinkAction, setIsProcessingLinkAction] = useState(false);
    const [mobileProfessionalArea, setMobileProfessionalArea] = useState("all");
    const [mobileHomeBannerIndex, setMobileHomeBannerIndex] = useState(0);
    const [routineLibraryInitialArea, setRoutineLibraryInitialArea] = useState("all");
    const [showAreasScrollHint, setShowAreasScrollHint] = useState(true);
    const [showRoutineScrollHint, setShowRoutineScrollHint] = useState(true);
    const [importedRoutineTemplateIds, setImportedRoutineTemplateIds] = useState<string[]>([]);
    const [isAchievementShareOpen, setAchievementShareOpen] = useState(false);
    const [achievementShareMode, setAchievementShareMode] = useState<AchievementShareMode>("list");
    const [achievementShowName, setAchievementShowName] = useState(true);
    const [isGeneratingAchievementAsset, setIsGeneratingAchievementAsset] = useState(false);
    const [familyProfessionalLinks, setFamilyProfessionalLinks] = useState<FamilyProfessionalLink[]>([]);
    const [familyAppointments, setFamilyAppointments] = useState<FamilyAppointment[]>([]);
    const [linkDrafts, setLinkDrafts] = useState<Record<string, LinkDraft>>({});
    const mobileBannerScrollerRef = useRef<HTMLDivElement | null>(null);
    const areasScrollHintTimeoutRef = useRef<number | null>(null);
    const routineScrollHintTimeoutRef = useRef<number | null>(null);
    const celebrationAudioCtxRef = useRef<AudioContext | null>(null);
    
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);
    
    const [viewedDate, setViewedDate] = useState(getTodayDateString());
    const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
    const swipeSessionRef = useRef<{
        habitId: string;
        startX: number;
        startY: number;
        locked: boolean;
        isHorizontal: boolean;
        lastOffset: number;
    } | null>(null);
    const reminderTriggeredRef = useRef<Set<string>>(new Set());
    
    useEffect(() => {
        if (!familyId) return;
        const q = query(collection(db, "userNotifications"), where("familyId", "==", familyId));
        const unsub = onSnapshot(q, (snap) => {
            const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
            rows.sort((a: any, b: any) => {
                const aMs = typeof a?.createdAt?.toMillis === "function" ? a.createdAt.toMillis() : 0;
                const bMs = typeof b?.createdAt?.toMillis === "function" ? b.createdAt.toMillis() : 0;
                return bMs - aMs;
            });
            setNotifications(rows.slice(0, 30));
        });
        return () => unsub();
    }, [familyId]);

    const unreadNotificationsCount = notifications.filter((item) => !item.readAt).length;
    const readNotificationsCount = notifications.filter((item) => !!item.readAt).length;
    const markNotificationAsRead = async (id: string) => {
        try {
            await setDoc(doc(db, "userNotifications", id), { readAt: serverTimestamp() }, { merge: true });
        } catch (err) {
            console.error("Falha ao marcar notificação como lida:", err);
        }
    };
    useEffect(() => {
        if (!pendingLinkAction || !generatedLinkCode || !generatedLinkCodeExpiresAtMs) return;
        setLinkCodeNowMs(Date.now());
        const timer = window.setInterval(() => {
            setLinkCodeNowMs(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, [pendingLinkAction, generatedLinkCode, generatedLinkCodeExpiresAtMs]);
    const generatedCodeSecondsRemaining = useMemo(() => {
        if (!generatedLinkCodeExpiresAtMs) return 0;
        return Math.max(0, Math.floor((generatedLinkCodeExpiresAtMs - linkCodeNowMs) / 1000));
    }, [generatedLinkCodeExpiresAtMs, linkCodeNowMs]);
    const generatedCodeCountdownLabel = useMemo(() => {
        const min = Math.floor(generatedCodeSecondsRemaining / 60);
        const sec = generatedCodeSecondsRemaining % 60;
        return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }, [generatedCodeSecondsRemaining]);
    useEffect(() => {
        if (currentView !== "dashboard") return;
        const timer = window.setInterval(() => setMobileHomeBannerIndex((prev) => prev + 1), 30_000);
        return () => window.clearInterval(timer);
    }, [currentView]);
    useEffect(() => {
        return () => {
            if (areasScrollHintTimeoutRef.current) window.clearTimeout(areasScrollHintTimeoutRef.current);
            if (routineScrollHintTimeoutRef.current) window.clearTimeout(routineScrollHintTimeoutRef.current);
        };
    }, []);

    const handleAreasScroll = () => {
        setShowAreasScrollHint(false);
        if (areasScrollHintTimeoutRef.current) window.clearTimeout(areasScrollHintTimeoutRef.current);
        areasScrollHintTimeoutRef.current = window.setTimeout(() => setShowAreasScrollHint(true), 700);
    };

    const handleRoutineScroll = () => {
        setShowRoutineScrollHint(false);
        if (routineScrollHintTimeoutRef.current) window.clearTimeout(routineScrollHintTimeoutRef.current);
        routineScrollHintTimeoutRef.current = window.setTimeout(() => setShowRoutineScrollHint(true), 700);
    };

    const playHabitSuccessSound = () => {
        if (typeof window === "undefined") return;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        try {
            if (!celebrationAudioCtxRef.current) {
                celebrationAudioCtxRef.current = new AudioCtx();
            }
            const ctx = celebrationAudioCtxRef.current;
            if (!ctx) return;
            if (ctx.state === "suspended") {
                void ctx.resume();
            }
            const now = ctx.currentTime;
            const master = ctx.createGain();
            master.connect(ctx.destination);
            master.gain.setValueAtTime(0.0001, now);
            master.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
            master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

            const playCoinTone = (startAt: number, freq: number, duration: number) => {
                const tone = ctx.createOscillator();
                const overtone = ctx.createOscillator();
                const env = ctx.createGain();
                const shaper = ctx.createBiquadFilter();
                shaper.type = "bandpass";
                shaper.frequency.setValueAtTime(2400, startAt);
                shaper.Q.setValueAtTime(5, startAt);

                tone.type = "triangle";
                overtone.type = "sine";
                tone.frequency.setValueAtTime(freq, startAt);
                overtone.frequency.setValueAtTime(freq * 2.02, startAt);

                env.gain.setValueAtTime(0.0001, startAt);
                env.gain.exponentialRampToValueAtTime(0.42, startAt + 0.0035);
                env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

                tone.connect(env);
                overtone.connect(env);
                env.connect(shaper);
                shaper.connect(master);

                tone.start(startAt);
                overtone.start(startAt);
                tone.stop(startAt + duration + 0.01);
                overtone.stop(startAt + duration + 0.01);
            };

            // Classic arcade-like pickup: two bright ascending tones.
            playCoinTone(now, 1318.51, 0.09); // E6
            playCoinTone(now + 0.055, 1760, 0.1); // A6
        } catch {
            // noop
        }
    };

    const triggerHabitCelebration = (target?: HTMLElement | null) => {
        if (typeof document === "undefined") return;
        const root = document.body;
        if (!root) return;
        const rect = target?.getBoundingClientRect();
        const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const originY = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.6;

        const flare = document.createElement("div");
        flare.style.position = "fixed";
        flare.style.left = `${originX}px`;
        flare.style.top = `${originY}px`;
        flare.style.width = "16px";
        flare.style.height = "16px";
        flare.style.borderRadius = "9999px";
        flare.style.background = "radial-gradient(circle, rgba(253,224,71,0.95) 0%, rgba(196,181,253,0.25) 70%, rgba(196,181,253,0) 100%)";
        flare.style.pointerEvents = "none";
        flare.style.zIndex = "80";
        flare.style.transform = "translate(-50%, -50%) scale(0.2)";
        root.appendChild(flare);
        flare.animate(
            [
                { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.85 },
                { transform: "translate(-50%, -50%) scale(3)", opacity: 0 },
            ],
            { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
        window.setTimeout(() => flare.remove(), 560);

        const particles = 12;
        for (let i = 0; i < particles; i += 1) {
            const node = document.createElement("div");
            node.textContent = Math.random() > 0.45 ? "✨" : "⭐";
            node.style.position = "fixed";
            node.style.left = `${originX}px`;
            node.style.top = `${originY}px`;
            node.style.fontSize = `${Math.floor(12 + Math.random() * 8)}px`;
            node.style.pointerEvents = "none";
            node.style.zIndex = "85";
            node.style.willChange = "transform, opacity";
            root.appendChild(node);

            const angle = (Math.PI * 2 * i) / particles + (Math.random() - 0.5) * 0.35;
            const distance = 36 + Math.random() * 62;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance - 10;

            node.animate(
                [
                    { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0 },
                    { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.2 },
                    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.95)`, opacity: 0 },
                ],
                { duration: 820 + Math.random() * 220, easing: "cubic-bezier(.17,.84,.44,1)" }
            );

            window.setTimeout(() => node.remove(), 1100);
        }
    };

    const handleHabitCompleteAction = (
        childId: string,
        habitId: string,
        currentStatus: string | undefined,
        sourceEl?: HTMLElement | null
    ) => {
        const willComplete = currentStatus !== "COMPLETED";
        toggleHabitCompletion(childId, habitId, viewedDate);
        if (willComplete) {
            playHabitSuccessSound();
            triggerHabitCelebration(sourceEl);
        }
    };

    const handleConfirmAppointment = async (appointmentId: string) => {
        try {
            await setDoc(
                doc(db, "professionalAppointments", appointmentId),
                {
                    patientStatus: "confirmed",
                    patientStatusAt: serverTimestamp(),
                    patientStatusByUid: auth.currentUser?.uid || null,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            showToast("Consulta confirmada.", "success");
        } catch (err) {
            console.error("Falha ao confirmar consulta:", err);
            showToast("Não foi possível confirmar a consulta.", "error");
        }
    };

    const handleCancelAppointment = async (appointmentId: string) => {
        try {
            await setDoc(
                doc(db, "professionalAppointments", appointmentId),
                {
                    patientStatus: "cancelled",
                    patientStatusAt: serverTimestamp(),
                    patientStatusByUid: auth.currentUser?.uid || null,
                    cancelledByPatient: true,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            showToast("Consulta cancelada.", "warning");
        } catch (err) {
            console.error("Falha ao cancelar consulta:", err);
            showToast("Não foi possível cancelar a consulta.", "error");
        }
    };

    const mobileLocationLabel = useMemo(() => {
        if (!familyLocation?.cityName || !familyLocation?.uf) return "Localização não definida";
        return `${familyLocation.cityName} - ${familyLocation.uf}`;
    }, [familyLocation?.cityName, familyLocation?.uf]);

    const mobileProfessionalAreas = useMemo(
        () => [
            { key: "all", label: "Tudo" },
            { key: "medicina", label: "Medicina" },
            { key: "odontologia", label: "Odonto" },
            { key: "saude_mental", label: "Saude Mental" },
            { key: "fisio_terapias", label: "Fisio/Terapias" },
            { key: "nutricao", label: "Nutri" },
            { key: "enfermagem", label: "Enfermagem" },
            { key: "outras", label: "Outras" },
        ],
        []
    );
    const routineLibraryAreas = useMemo(() => {
        const byKey = new Map<string, string>();
        ROUTINE_LIBRARY_AREAS.forEach((area) => {
            byKey.set(area.key, area.label);
        });
        routineTemplates.forEach((template) => {
            const key = String(template.areaKey || "").trim();
            const label = String(template.areaLabel || "").trim();
            if (!key || !label || byKey.has(key)) return;
            byKey.set(key, label);
        });
        return Array.from(byKey.entries()).map(([key, label]) => ({ key, label }));
    }, [routineTemplates]);

    useEffect(() => {
        const storageKey = `routine-library-imports:${familyId || "guest"}`;
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) {
                setImportedRoutineTemplateIds([]);
                return;
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                setImportedRoutineTemplateIds([]);
                return;
            }
            const ids = parsed.map((item) => String(item || "")).filter(Boolean);
            setImportedRoutineTemplateIds(ids);
        } catch {
            setImportedRoutineTemplateIds([]);
        }
    }, [familyId]);

    useEffect(() => {
        const storageKey = `routine-library-imports:${familyId || "guest"}`;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(importedRoutineTemplateIds));
        } catch {
            // noop
        }
    }, [familyId, importedRoutineTemplateIds]);

    const toggleRoutineTemplateImport = (templateId: string) => {
        setImportedRoutineTemplateIds((prev) => {
            const isImported = prev.includes(templateId);
            const next = isImported ? prev.filter((id) => id !== templateId) : [...prev, templateId];
            showToast(isImported ? "Rotina removida da sua biblioteca." : "Rotina importada para sua biblioteca.", "success");
            return next;
        });
    };

    useEffect(() => {
        if (!familyId) {
            setFamilyProfessionalLinks([]);
            setFamilyAppointments([]);
            setLinkDrafts({});
            return;
        }
        const qLinks = query(collection(db, "professionalPatientLinks"), where("familyId", "==", familyId));
        const qAppointments = query(collection(db, "professionalAppointments"), where("familyId", "==", familyId));
        const unsubLinks = onSnapshot(qLinks, (snap) => {
            const nowMs = Date.now();
            const rows = snap.docs
                .map((docSnap) => {
                    const data = docSnap.data() as any;
                    const professionalId = String(data?.professionalId || "");
                    const fallbackName = supportNetworkProfessionals.find((prof) => prof.id === professionalId)?.name || "";
                    const expiresAt = timestampToMs(data?.linkExpiresAtMs) ?? timestampToMs(data?.linkExpiresAt);
                    const hasExpiration = typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0;
                    const status = String(data?.status || "active");
                    const endedReason = String(data?.endedReason || "");

                    if (status === "inactive" && endedReason === "expired" && !hasExpiration) {
                        void setDoc(
                            doc(db, "professionalPatientLinks", docSnap.id),
                            {
                                status: "active",
                                endedReason: null,
                                endedAt: null,
                                updatedAt: serverTimestamp(),
                            },
                            { merge: true }
                        ).catch((err) => console.error("Falha ao reativar vínculo sem prazo:", err));
                    }

                    if (status === "active" && hasExpiration && expiresAt < nowMs) {
                        void setDoc(
                            doc(db, "professionalPatientLinks", docSnap.id),
                            {
                                status: "inactive",
                                endedReason: "expired",
                                endedAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                            },
                            { merge: true }
                        ).catch((err) => console.error("Falha ao encerrar vínculo expirado:", err));
                    }

                    const effectiveStatus =
                        status === "active" && (!hasExpiration || expiresAt >= nowMs)
                            ? "active"
                            : status === "inactive" && endedReason === "expired" && !hasExpiration
                                ? "active"
                                : status;
                    return {
                        id: docSnap.id,
                        professionalId,
                        professionalName: String(data?.professionalName || fallbackName || professionalId || "Profissional"),
                        status: effectiveStatus,
                        linkedChildIds: Array.isArray(data?.linkedChildIds) ? data.linkedChildIds.map((id: any) => String(id || "")).filter(Boolean) : [],
                        consentBlocks: {
                            personal: data?.consentBlocks?.personal ?? true,
                            profile: data?.consentBlocks?.profile ?? true,
                            health: data?.consentBlocks?.health ?? true,
                        },
                        linkExpiresAtMs: expiresAt,
                    } as FamilyProfessionalLink;
                })
                .filter((row) => row.professionalId && row.status === "active")
                .sort((a, b) => a.professionalName.localeCompare(b.professionalName, "pt-BR"));
            setFamilyProfessionalLinks(rows);
        });
        const unsubAppointments = onSnapshot(qAppointments, (snap) => {
            const rows = snap.docs
                .map((docSnap) => ({ ...(docSnap.data() as any), id: docSnap.id }))
                .map((row) => ({
                    id: String(row.id || ""),
                    professionalId: String(row.professionalId || ""),
                    childId: String(row.childId || ""),
                    childName: String(row.childName || "Paciente"),
                    startsAtIso: String(row.startsAtIso || ""),
                    durationMin: Math.max(10, Number(row.durationMin || 30)),
                    notes: String(row.notes || ""),
                    tags: Array.isArray(row.tags) ? row.tags.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
                    patientStatus: String(row.patientStatus || "pending") === "confirmed"
                        ? "confirmed"
                        : String(row.patientStatus || "pending") === "cancelled"
                            ? "cancelled"
                            : "pending",
                    syncToPatientCard: Boolean(row.syncToPatientCard),
                    cancelledByProfessional: Boolean(row.cancelledByProfessional),
                }))
                .filter((row) => row.startsAtIso)
                .sort((a, b) => new Date(a.startsAtIso).getTime() - new Date(b.startsAtIso).getTime()) as FamilyAppointment[];
            setFamilyAppointments(rows);
        });
        return () => {
            unsubLinks();
            unsubAppointments();
        };
    }, [familyId, supportNetworkProfessionals]);

    useEffect(() => {
        setLinkDrafts((prev) => {
            const next: Record<string, LinkDraft> = {};
            familyProfessionalLinks.forEach((link) => {
                const existing = prev[link.id];
                const normalizedChildIds = (link.linkedChildIds || []).slice(0, 1);
                next[link.id] = existing || {
                    linkedChildIds: normalizedChildIds,
                    consentBlocks: { ...link.consentBlocks },
                    expiresAtDate: link.linkExpiresAtMs ? toIsoDate(link.linkExpiresAtMs) : "",
                };
            });
            return next;
        });
    }, [familyProfessionalLinks]);
    const deleteNotification = async (id: string) => {
        try {
            await deleteDoc(doc(db, "userNotifications", id));
        } catch (err) {
            console.error("Falha ao apagar notificação:", err);
        }
    };
    const clearReadNotifications = async () => {
        const readItems = notifications.filter((item) => !!item.readAt);
        if (readItems.length === 0) return;
        try {
            await Promise.all(readItems.map((item) => deleteDoc(doc(db, "userNotifications", item.id))));
        } catch (err) {
            console.error("Falha ao apagar notificações lidas:", err);
        }
    };
    const openProfessionalLinkRequestModal = async (notificationId: string, requestId?: string, professionalName?: string) => {
        if (!requestId) return;
        setGeneratedLinkCode(null);
        setGeneratedLinkCodeExpiresAtMs(null);
        const defaultChildId = children[0]?.id || "";
        setSelectedSharedChildId(defaultChildId);
        const defaultRequested = { personal: true, profile: true, health: true };
        try {
            const requestSnap = await getDoc(doc(db, "professionalLinkRequests", requestId));
            const requestData = requestSnap.exists() ? (requestSnap.data() as any) : null;
            const requested = requestData?.requestedConsentBlocks || requestData?.consentBlocks || defaultRequested;
            setSharePersonalBlock(requested?.personal !== false);
            setShareProfileBlock(requested?.profile !== false);
            setShareHealthBlock(requested?.health !== false);
            setPendingLinkAction({
                notificationId,
                requestId,
                professionalName: professionalName || "Profissional",
                requestedConsentBlocks: {
                    personal: requested?.personal !== false,
                    profile: requested?.profile !== false,
                    health: requested?.health !== false,
                },
            });
        } catch {
            setSharePersonalBlock(true);
            setShareProfileBlock(true);
            setShareHealthBlock(true);
            setPendingLinkAction({
                notificationId,
                requestId,
                professionalName: professionalName || "Profissional",
                requestedConsentBlocks: defaultRequested,
            });
        }
        await markNotificationAsRead(notificationId);
    };
    const handleApproveProfessionalLink = async () => {
        if (!pendingLinkAction) return;
        if (children.length > 0 && !selectedSharedChildId) {
            showToast("Selecione 1 pessoa para vincular.", "warning");
            return;
        }
        if (!sharePersonalBlock && !shareProfileBlock && !shareHealthBlock) {
            showToast("Selecione ao menos 1 bloco para compartilhar.", "warning");
            return;
        }
        setIsProcessingLinkAction(true);
        try {
            const requestRef = doc(db, "professionalLinkRequests", pendingLinkAction.requestId);
            const snap = await getDoc(requestRef);
            if (!snap.exists()) {
                showToast("Solicitação não encontrada.", "error");
                return;
            }
            const data = snap.data() as any;
            if (String(data?.status || "") !== "pending_user") {
                showToast("Esta solicitação não está mais pendente.", "warning");
                return;
            }
            const code = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            const sharedChildren = children
                .filter((child) => child.id === selectedSharedChildId)
                .map((child) => ({ id: child.id, name: child.name }));
            const sharedChildIds = selectedSharedChildId ? [selectedSharedChildId] : [];
            await setDoc(
                requestRef,
                {
                    familyId: familyId || data?.familyId || null,
                    userUid: auth.currentUser?.uid || null,
                    requesterFullName: userProfile?.fullName || null,
                    requesterCpf: userProfile?.cpf || null,
                    requestedByEmail: auth.currentUser?.email || null,
                    sharedChildIds,
                    sharedChildren,
                    consentBlocks: {
                        personal: sharePersonalBlock,
                        profile: shareProfileBlock,
                        health: shareHealthBlock,
                    },
                    verificationCode: code,
                    codeGeneratedAt: serverTimestamp(),
                    codeExpiresAtMs: expiresAt.getTime(),
                    status: "pending_code",
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            setGeneratedLinkCode(code);
            setGeneratedLinkCodeExpiresAtMs(expiresAt.getTime());
            showToast("Código gerado. Passe ao profissional em até 10 minutos.", "success");
        } catch (err) {
            console.error("Falha ao aprovar solicitação de vínculo:", err);
            showToast("Não foi possível aprovar a solicitação.", "error");
        } finally {
            setIsProcessingLinkAction(false);
        }
    };
    const handleRejectProfessionalLink = async () => {
        if (!pendingLinkAction) return;
        setIsProcessingLinkAction(true);
        try {
            await setDoc(
                doc(db, "professionalLinkRequests", pendingLinkAction.requestId),
                {
                    status: "rejected",
                    decidedAt: serverTimestamp(),
                    decidedByUid: auth.currentUser?.uid || null,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            setPendingLinkAction(null);
            showToast("Solicitação recusada.", "warning");
        } catch (err) {
            console.error("Falha ao rejeitar solicitação:", err);
            showToast("Não foi possível recusar agora.", "error");
        } finally {
            setIsProcessingLinkAction(false);
        }
    };

    useEffect(() => {
        const currentChildExists = selectedChildId && children.some(c => c.id === selectedChildId);
        if (!currentChildExists && children.length > 0) {
            setSelectedChildId(children[0]?.id || null);
        } else if (children.length === 0) {
            setSelectedChildId(null);
        }
        setViewedDate(getTodayDateString());
    }, [children, selectedChildId]);


    const handleSelectChild = (child: Child) => {
        if (child.id !== selectedChildId) {
            setSelectedChildId(child.id);
            setViewedDate(getTodayDateString());
        }
        if (currentView !== "dashboard") {
            setCurrentView("dashboard");
        }
    };

    const isPrincipalProfile = (childId?: string) => String(childId || "").startsWith("principal-");
    const hasReachedFreemiumProfileLimit = children.length >= MAX_FREEMIUM_PROFILES;

    const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleOpenAddChildModal = () => {
        if (hasReachedFreemiumProfileLimit) {
            showToast("Plano freemium permite ate 4 perfis (principal + 3 secundarios).", "warning");
            return;
        }
        setAddChildModalOpen(true);
    };

    const updateLinkDraft = (linkId: string, updater: (draft: LinkDraft) => LinkDraft) => {
        setLinkDrafts((prev) => {
            const base = prev[linkId];
            if (!base) return prev;
            return { ...prev, [linkId]: updater(base) };
        });
    };

    const handleToggleLinkChild = (linkId: string, childId: string) => {
        updateLinkDraft(linkId, (draft) => ({
            ...draft,
            linkedChildIds: [childId],
        }));
    };

    const handleToggleLinkBlock = (linkId: string, block: "personal" | "profile" | "health") => {
        updateLinkDraft(linkId, (draft) => ({
            ...draft,
            consentBlocks: {
                ...draft.consentBlocks,
                [block]: !draft.consentBlocks[block],
            },
        }));
    };

    const handleSaveLinkDraft = async (link: FamilyProfessionalLink) => {
        const draft = linkDrafts[link.id];
        if (!draft) return;
        if (draft.linkedChildIds.length === 0) {
            showToast("Selecione ao menos 1 pessoa para manter o vínculo.", "warning");
            return;
        }
        if (draft.linkedChildIds.length > 1) {
            showToast("Este vínculo deve conter apenas 1 pessoa. Para outra pessoa, crie novo vínculo.", "warning");
            return;
        }
        const { personal, profile, health } = draft.consentBlocks;
        if (!personal && !profile && !health) {
            showToast("Selecione ao menos 1 bloco de compartilhamento.", "warning");
            return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const max = new Date(today);
        max.setDate(max.getDate() + 90);
        let linkExpiresAtMs: number | null = null;
        if (draft.expiresAtDate) {
            const picked = new Date(`${draft.expiresAtDate}T23:59:59`);
            if (!Number.isFinite(picked.getTime())) {
                showToast("Data de encerramento inválida.", "error");
                return;
            }
            if (picked.getTime() < today.getTime()) {
                showToast("A data de encerramento não pode estar no passado.", "warning");
                return;
            }
            if (picked.getTime() > max.getTime()) {
                showToast("O prazo máximo de vínculo é 90 dias.", "warning");
                return;
            }
            linkExpiresAtMs = picked.getTime();
        }
        const linkedChildren = children
            .filter((child) => draft.linkedChildIds.includes(child.id))
            .map((child) => ({ id: child.id, name: child.name }));
        try {
            await setDoc(
                doc(db, "professionalPatientLinks", link.id),
                {
                    linkedChildIds: draft.linkedChildIds,
                    linkedChildren,
                    consentBlocks: draft.consentBlocks,
                    linkExpiresAtMs,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            showToast("Vínculo atualizado com sucesso.", "success");
            setCurrentView("dashboard");
        } catch (err) {
            console.error("Falha ao atualizar vínculo:", err);
            showToast("Não foi possível atualizar o vínculo.", "error");
        }
    };

    const handleEndLinkNow = async (link: FamilyProfessionalLink) => {
        if (!window.confirm(`Encerrar vínculo com ${link.professionalName}?`)) return;
        try {
            await setDoc(
                doc(db, "professionalPatientLinks", link.id),
                {
                    status: "inactive",
                    endedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            showToast("Vínculo encerrado.", "success");
        } catch (err) {
            console.error("Falha ao encerrar vínculo:", err);
            showToast("Não foi possível encerrar o vínculo.", "error");
        }
    };
    
    const handleHabitAdded = (addedIds: string[]) => {
        const names = children.filter(c => addedIds.includes(c.id)).map(c => c.name);
        if (names.length > 2) {
            showToast(`Hábito aplicado para ${names.length} pessoas! ✨`);
        } else {
            showToast(`Hábito aplicado para ${names.join(' e ')}! ✨`);
        }
    };

    const renderBirthdayInfo = (child: Child) => {
        if (!child.birthDate || !child.showAgeInfo) return null;
        const daysUntil = daysUntilNextBirthday(child.birthDate);
        const age = calculateAge(child.birthDate);
        if (daysUntil === 0) {
            return <span className="text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full font-bold">🎉 Aniversário Hoje! ({age+1} anos)</span>
        }
        return <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full">🎂 {daysUntil} dias para {age+1} anos</span>
    }

    const toIsoLocalDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    const getWeekDatesFor = (dateStr: string) => {
        const base = new Date(`${dateStr}T00:00:00`);
        const sunday = new Date(base);
        sunday.setDate(base.getDate() - base.getDay());
        return Array.from({ length: 7 }, (_, idx) => {
            const next = new Date(sunday);
            next.setDate(sunday.getDate() + idx);
            return next;
        });
    };

    const weekDates = useMemo(() => getWeekDatesFor(viewedDate), [viewedDate]);
    const weekDayLetters = ["D", "S", "T", "Q", "Q", "S", "S"];
    const viewedWeekdayLabel = useMemo(() => {
        const label = new Date(`${viewedDate}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
        return label.replace("-feira", "");
    }, [viewedDate]);
    const viewedMonthYearLabel = useMemo(() => {
        const raw = new Date(`${viewedDate}T00:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
        const cleaned = raw.replace(".", "");
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }, [viewedDate]);

    const habitsForDate = selectedChild ? getHabitsForChildOnDate(selectedChild.id, viewedDate) : [];
    const appointmentsForSelectedChild = useMemo(() => {
        if (!selectedChild) return [];
        return familyAppointments
            .filter((item) => item.childId === selectedChild.id || item.childId === "__family__")
            .sort((a, b) => new Date(a.startsAtIso).getTime() - new Date(b.startsAtIso).getTime());
    }, [familyAppointments, selectedChild]);
    const appointmentsForViewedDate = useMemo(() => {
        return appointmentsForSelectedChild
            .filter((item) => String(item.startsAtIso || "").slice(0, 10) === viewedDate)
            .sort((a, b) => new Date(a.startsAtIso).getTime() - new Date(b.startsAtIso).getTime());
    }, [appointmentsForSelectedChild, viewedDate]);
    const nextAppointmentForSelectedChild = useMemo(() => {
        const now = Date.now();
        return appointmentsForSelectedChild.find((item) => new Date(item.startsAtIso).getTime() >= now) || null;
    }, [appointmentsForSelectedChild]);
    const getFamilyAppointmentVisual = (appointment: FamilyAppointment) => {
        if (appointment.patientStatus === "confirmed") {
            return {
                card: "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm",
                badge: "bg-blue-600 text-white",
                label: "Confirmada",
            };
        }
        if (appointment.patientStatus === "cancelled") {
            return {
                card: "border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 shadow-sm",
                badge: "bg-rose-600 text-white",
                label: appointment.cancelledByProfessional ? "CANCELADO PELO PROFISSIONAL" : "Cancelada",
            };
        }
        return {
            card: "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-sm",
            badge: "bg-amber-500 text-white",
            label: "Aguardando confirmação",
        };
    };
    const isFutureDate = viewedDate > getTodayDateString();
    const isViewingToday = viewedDate === getTodayDateString();
    const dayProgress = useMemo(() => {
        const total = habitsForDate.length;
        const done = habitsForDate.reduce((acc, habit) => (habit.completions[viewedDate] === "COMPLETED" ? acc + 1 : acc), 0);
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        return { done, total, percent };
    }, [habitsForDate, viewedDate]);
    const dayProgressBadgeClassName = useMemo(() => {
        if (dayProgress.percent >= 100) return "bg-emerald-500 text-white border-emerald-600";
        if (dayProgress.percent <= 0) return "bg-rose-500 text-white border-rose-600";
        return "bg-yellow-300 text-yellow-900 border-yellow-400";
    }, [dayProgress.percent]);
    const completedHabitsForViewedDate = useMemo(
        () => habitsForDate.filter((habit) => habit.completions[viewedDate] === "COMPLETED"),
        [habitsForDate, viewedDate]
    );
    const selectedChildDiamonds = useMemo(() => {
        if (!selectedChild) return 0;
        return selectedChild.habits.reduce((acc, habit) => {
            if (habit.source !== "qrsaude") return acc;
            const completedCount = Object.values(habit.completions || {}).filter((status) => status === "COMPLETED").length;
            return acc + completedCount;
        }, 0);
    }, [selectedChild]);

    const formatShareDate = (isoDate: string) => {
        const [yyyy, mm, dd] = isoDate.split("-");
        if (!yyyy || !mm || !dd) return isoDate;
        return `${dd}/${mm}/${yyyy}`;
    };

    const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
        const words = String(text || "").split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let line = "";
        words.forEach((word) => {
            const candidate = line ? `${line} ${word}` : word;
            if (ctx.measureText(candidate).width <= maxWidth) {
                line = candidate;
                return;
            }
            if (line) lines.push(line);
            line = word;
        });
        if (line) lines.push(line);
        return lines.length > 0 ? lines : [text];
    };

    const buildAchievementImageBlob = async (mode: AchievementShareMode, showName: boolean) => {
        const width = 1080;
        const height = 1920;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponível.");

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "#5b21b6");
        gradient.addColorStop(0.45, "#6d28d9");
        gradient.addColorStop(1, "#4c1d95");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "rgba(255,255,255,0.07)";
        for (let i = 0; i < 14; i += 1) {
            const size = 80 + (i % 4) * 26;
            const x = (i * 127) % width;
            const y = (i * 143) % height;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const profileLabel = showName
            ? (selectedChild?.preferredName || selectedChild?.name || "Perfil")
            : "Perfil anônimo";

        const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
            const radius = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + w, y, x + w, y + h, radius);
            ctx.arcTo(x + w, y + h, x, y + h, radius);
            ctx.arcTo(x, y + h, x, y, radius);
            ctx.arcTo(x, y, x + w, y, radius);
            ctx.closePath();
        };

        const loadImageSafe = (src?: string) =>
            new Promise<HTMLImageElement | null>((resolve) => {
                if (!src) {
                    resolve(null);
                    return;
                }
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.referrerPolicy = "no-referrer";
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 68px sans-serif";
        ctx.fillText("Meta batida", 60, 124);

        ctx.fillStyle = "rgba(255,255,255,0.12)";
        drawRoundRect(width - 332, 52, 272, 138, 28);
        ctx.fill();

        const chartX = width - 300;
        const chartY = 92;
        const bars = [36, 56, 44, 78, 98];
        bars.forEach((bar, idx) => {
            ctx.fillStyle = idx < 4 ? "rgba(250,204,21,0.35)" : "rgba(134,239,172,0.9)";
            drawRoundRect(chartX + idx * 44, chartY + (98 - bar), 24, bar, 8);
            ctx.fill();
        });
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(chartX + 12, chartY + 66);
        ctx.lineTo(chartX + 56, chartY + 42);
        ctx.lineTo(chartX + 100, chartY + 52);
        ctx.lineTo(chartX + 144, chartY + 24);
        ctx.lineTo(chartX + 188, chartY + 8);
        ctx.stroke();
        ctx.fillStyle = "#86efac";
        ctx.beginPath();
        ctx.arc(chartX + 188, chartY + 8, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.97)";
        drawRoundRect(40, 230, width - 80, 1500, 36);
        ctx.fill();

        ctx.fillStyle = "#5b21b6";
        ctx.font = "bold 54px sans-serif";
        const headlineLines = wrapCanvasText(ctx, `Hoje ${profileLabel} completou 100% das metas diárias`, width - 170);
        let headY = 320;
        headlineLines.slice(0, 2).forEach((line) => {
            ctx.fillText(line, 74, headY);
            headY += 56;
        });

        ctx.fillStyle = "#6b7280";
        ctx.font = "bold 34px sans-serif";
        ctx.fillText(`${dayProgress.done}/${dayProgress.total} tarefas • ${formatShareDate(viewedDate)}`, 74, headY + 16);

        // Bloco de conquistas para deixar o card mais vivo.
        ctx.fillStyle = "#ede9fe";
        drawRoundRect(70, headY + 38, width - 140, 104, 20);
        ctx.fill();
        ctx.fillStyle = "#6d28d9";
        ctx.font = "bold 34px sans-serif";
        ctx.fillText("🏅 Conquistas de hoje", 96, headY + 84);
        ctx.fillStyle = "#374151";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText("Disciplina diária concluída.", 430, headY + 84);

        const maxCards = mode === "summary" ? 1 : mode === "list" ? 3 : 6;
        const cards = completedHabitsForViewedDate.slice(0, maxCards);
        const cardTop = headY + 166;
        const cardBottom = 1518;
        const rowGap = 18;
        const rows = Math.max(1, cards.length);
        const cardAreaW = width - 148;
        const cardW = Math.min(860, cardAreaW);
        const availableH = cardBottom - cardTop - Math.max(0, rows - 1) * rowGap;
        const cardH = Math.max(138, Math.min(186, Math.floor(availableH / rows)));
        const totalGridH = rows * cardH + Math.max(0, rows - 1) * rowGap;
        const startY = Math.max(cardTop, cardTop + Math.max(0, Math.floor((cardBottom - cardTop - totalGridH) / 2)));

        const iconEmojiByName: Record<string, string> = {
            Book: "📘",
            Toothbrush: "🪥",
            Bed: "🛌",
            Broom: "🧹",
            Backpack: "🎒",
            Apple: "🍎",
            Paintbrush: "🎨",
            Soccer: "⚽",
            Dog: "🐶",
            Cat: "🐱",
            Heart: "❤️",
            GameController: "🎮",
            Gift: "🎁",
            Trophy: "🏆",
            Tv: "📺",
            Star: "⭐",
            Sparkles: "✨",
        };

        for (let i = 0; i < cards.length; i += 1) {
            const row = i;
            const x = Math.floor((width - cardW) / 2);
            const y = startY + row * (cardH + rowGap);

            ctx.fillStyle = "#f8fafc";
            drawRoundRect(x, y, cardW, cardH, 24);
            ctx.fill();
            ctx.strokeStyle = "#ddd6fe";
            ctx.lineWidth = 2;
            drawRoundRect(x, y, cardW, cardH, 24);
            ctx.stroke();

            const habit = cards[i];
            const img = await loadImageSafe(habit.imageUrl);
            const imgX = x + 18;
            const imgY = y + 18;
            const imgS = Math.max(84, Math.min(122, cardH - 34));
            if (img) {
                ctx.save();
                drawRoundRect(imgX, imgY, imgS, imgS, 18);
                ctx.clip();
                ctx.drawImage(img, imgX, imgY, imgS, imgS);
                ctx.restore();
            } else {
                ctx.fillStyle = "#ede9fe";
                drawRoundRect(imgX, imgY, imgS, imgS, 18);
                ctx.fill();
                ctx.fillStyle = "#7c3aed";
                ctx.font = "bold 42px sans-serif";
                const fallbackEmoji = iconEmojiByName[String(habit.icon || "")] || "✨";
                ctx.fillText(fallbackEmoji, imgX + 28, imgY + 66);
            }

            const textX = imgX + imgS + 18;
            ctx.fillStyle = "#1f2937";
            ctx.font = "bold 36px sans-serif";
            const nameLines = wrapCanvasText(ctx, habit.name || "Tarefa concluída", cardW - (textX - x) - 86);
            let textY = y + 58;
            nameLines.slice(0, 2).forEach((line) => {
                ctx.fillText(line, textX, textY);
                textY += 42;
            });

            ctx.fillStyle = "#6b7280";
            ctx.font = "bold 27px sans-serif";
            const periodLabel = getHabitScheduleMeta(habit).label.replace("🕒 ", "").replace("⏰ ", "");
            ctx.fillText(periodLabel, textX, y + Math.min(cardH - 22, 146));

            const checkCx = x + cardW - 48;
            const checkCy = y + 44;
            ctx.fillStyle = "#16a34a";
            ctx.beginPath();
            ctx.arc(checkCx, checkCy, 38, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 52px sans-serif";
            ctx.fillText("✓", checkCx - 16, checkCy + 18);
        }

        if (completedHabitsForViewedDate.length > cards.length) {
            ctx.fillStyle = "#6b7280";
            ctx.font = "italic 27px sans-serif";
            ctx.fillText(`+ ${completedHabitsForViewedDate.length - cards.length} tarefa(s) concluída(s)`, 74, cardBottom + 48);
        }

        ctx.fillStyle = "#4c1d95";
        ctx.fillRect(40, 1728, width - 80, 124);
        ctx.fillStyle = "#fde68a";
        ctx.font = "bold 34px sans-serif";
        const ctaLines = wrapCanvasText(ctx, "Acesse habitus (www.habitus.app) e evolua no seu dia-a-dia.", width - 160);
        const ctaYStart = 1774;
        ctaLines.slice(0, 2).forEach((line, idx) => {
            ctx.fillText(line, 68, ctaYStart + idx * 42);
        });

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Não foi possível gerar a imagem.");
        return blob;
    };

    const downloadAchievementImage = async () => {
        try {
            setIsGeneratingAchievementAsset(true);
            const blob = await buildAchievementImageBlob(achievementShareMode, achievementShowName);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `habitus-conquista-${viewedDate}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showToast("Imagem salva com sucesso.", "success");
        } catch (err) {
            console.error("Falha ao baixar imagem de conquista:", err);
            showToast("Não foi possível gerar a imagem agora.", "error");
        } finally {
            setIsGeneratingAchievementAsset(false);
        }
    };

    const shareAchievementImage = async () => {
        try {
            setIsGeneratingAchievementAsset(true);
            const blob = await buildAchievementImageBlob(achievementShareMode, achievementShowName);
            const file = new File([blob], `habitus-conquista-${viewedDate}.png`, { type: "image/png" });
            const shareText = `Concluí ${dayProgress.done}/${dayProgress.total} tarefas hoje (${dayProgress.percent}%) no Habitus.`;
            const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
            if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
                await nav.share({
                    title: "Minha conquista no Habitus",
                    text: shareText,
                    files: [file],
                });
                showToast("Conquista compartilhada.", "success");
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `habitus-conquista-${viewedDate}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showToast("Seu aparelho não aceita compartilhamento direto. Imagem foi baixada.", "warning");
        } catch (err) {
            console.error("Falha ao compartilhar imagem de conquista:", err);
            showToast("Não foi possível compartilhar agora.", "error");
        } finally {
            setIsGeneratingAchievementAsset(false);
        }
    };

    const shareAchievementOnWhatsApp = async () => {
        const shareText = encodeURIComponent(`Concluí ${dayProgress.done}/${dayProgress.total} tarefas hoje (${dayProgress.percent}%) no Habitus!`);
        window.open(`https://wa.me/?text=${shareText}`, "_blank", "noopener,noreferrer");
        await downloadAchievementImage();
    };

    useEffect(() => {
        if (!isViewingToday || !selectedChild) return;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        habitsForDate.forEach((habit) => {
            const schedule = habit.schedule || {};
            const mode = schedule.mode || (schedule.time ? "rigid" : "flex");
            if (mode !== "rigid" || !schedule.reminderEnabled || !schedule.time) return;
            if (habit.completions[viewedDate] === "COMPLETED") return;
            const [h, m] = schedule.time.split(":").map(Number);
            if (!Number.isFinite(h) || !Number.isFinite(m)) return;
            const targetMinutes = h * 60 + m;
            if (nowMinutes < targetMinutes) return;
            const key = `${selectedChild.id}:${habit.id}:${viewedDate}`;
            if (reminderTriggeredRef.current.has(key)) return;
            reminderTriggeredRef.current.add(key);

            if (typeof window !== "undefined" && "Notification" in window) {
                if (Notification.permission === "granted") {
                    new Notification("Lembrete de rotina", {
                        body: `${selectedChild.name}: ${habit.name} (${schedule.time})`,
                    });
                } else if (Notification.permission === "default") {
                    Notification.requestPermission().then((permission) => {
                        if (permission === "granted") {
                            new Notification("Lembrete de rotina", {
                                body: `${selectedChild.name}: ${habit.name} (${schedule.time})`,
                            });
                        }
                    }).catch(() => null);
                }
            }
            showToast(`Lembrete: ${habit.name} (${schedule.time})`, "warning");
        });
    }, [habitsForDate, isViewingToday, selectedChild, viewedDate]);
    const insertedProChunkCount = useMemo(
        () => proInsertPositions.filter((pos) => pos < habitsForDate.length).length,
        [proInsertPositions, habitsForDate.length]
    );
    const trailingProChunks = useMemo(
        () => proCarouselChunks.slice(insertedProChunkCount),
        [proCarouselChunks, insertedProChunkCount]
    );
    const SWIPE_COMPLETE_THRESHOLD = 84;
    const SWIPE_MAX_OFFSET = 110;
    const SWIPE_LEFT_REVEAL_OFFSET = 102;

    const getHabitSwipeRules = (habit: Habit) => {
        const status = habit.completions[viewedDate];
        const isCompleted = status === "COMPLETED";
        const isPending = status === "PENDING";
        const canSwipeToComplete = canMarkHabits && !isFutureDate && !isCompleted && !isPending;
        const leftSwipeAction = !isPending ? getHabitLeftSwipeAction(habit) : null;
        const canSwipeToAction = Boolean(leftSwipeAction);
        return { canSwipeToComplete, canSwipeToAction, leftSwipeAction };
    };

    const beginHabitSwipe = (habitId: string, event: React.TouchEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, a, input, select, textarea, label")) return;
        const touch = event.touches[0];
        if (!touch) return;
        setSwipeOffsets((prev) => {
            if (Object.keys(prev).length === 0) return prev;
            return prev[habitId] !== undefined ? { [habitId]: prev[habitId] } : {};
        });
        swipeSessionRef.current = {
            habitId,
            startX: touch.clientX,
            startY: touch.clientY,
            locked: false,
            isHorizontal: false,
            lastOffset: swipeOffsets[habitId] ?? 0,
        };
    };

    const moveHabitSwipe = (event: React.TouchEvent<HTMLDivElement>) => {
        const session = swipeSessionRef.current;
        if (!session) return;
        const touch = event.touches[0];
        if (!touch) return;

        const dx = touch.clientX - session.startX;
        const dy = touch.clientY - session.startY;

        if (!session.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            session.locked = true;
            session.isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
        }
        if (!session.isHorizontal) return;

        const habit = habitsForDate.find((item) => item.id === session.habitId);
        if (!habit) return;
        const rules = getHabitSwipeRules(habit);
        const minOffset = rules.canSwipeToAction ? -SWIPE_MAX_OFFSET : 0;
        const maxOffset = rules.canSwipeToComplete ? SWIPE_MAX_OFFSET : 0;
        const offset = Math.max(minOffset, Math.min(maxOffset, dx));
        session.lastOffset = offset;
        if (offset !== 0) event.preventDefault();
        setSwipeOffsets((prev) => (prev[session.habitId] === offset && Object.keys(prev).length === 1 ? prev : { [session.habitId]: offset }));
    };

    const endHabitSwipe = (habitId: string) => {
        const session = swipeSessionRef.current;
        const offset = session && session.habitId === habitId ? session.lastOffset : (swipeOffsets[habitId] ?? 0);
        swipeSessionRef.current = null;
        const habit = habitsForDate.find((item) => item.id === habitId);
        if (!habit) {
            setSwipeOffsets({});
            return;
        }
        const rules = getHabitSwipeRules(habit);
        if (offset >= SWIPE_COMPLETE_THRESHOLD && rules.canSwipeToComplete && selectedChild) {
            setSwipeOffsets({});
            handleHabitCompleteAction(selectedChild.id, habitId, habit.completions[viewedDate], null);
            showToast("Hábito marcado como feito.", "success");
            return;
        }
        if (offset <= -SWIPE_COMPLETE_THRESHOLD && rules.canSwipeToAction) {
            setSwipeOffsets({ [habitId]: -SWIPE_LEFT_REVEAL_OFFSET });
            showToast("Ação pronta. Toque no botão para continuar.", "warning");
            return;
        }
        setSwipeOffsets({});
    };

    const handleLeftSwipeActionClick = (habit: Habit) => {
        const leftAction = getHabitLeftSwipeAction(habit);
        if (!leftAction) {
            showToast("Ação indisponível para este hábito.", "error");
            return;
        }
        window.open(leftAction.href, "_blank", "noopener,noreferrer");
        setSwipeOffsets({});
    };
    
    const childRedeemedRewards = useMemo(() => {
        if (!selectedChildId) return [];
        return redeemedRewards
            .filter(r => r.childId === selectedChildId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 3);
    }, [redeemedRewards, selectedChildId]);

    const latestCompletedHabitTags = useMemo(() => {
        for (let i = habitsForDate.length - 1; i >= 0; i -= 1) {
            const habit = habitsForDate[i];
            if (habit.completions[viewedDate] !== 'COMPLETED') continue;
            return habit.semanticTags && habit.semanticTags.length > 0
                ? habit.semanticTags
                : inferSemanticTags(habit.name, habit.category);
        }
        return [] as string[];
    }, [habitsForDate, viewedDate]);

    const latestRewardTags = useMemo(() => {
        const reward = childRedeemedRewards[0]?.reward;
        if (!reward) return [] as string[];
        return reward.semanticTags && reward.semanticTags.length > 0
            ? reward.semanticTags
            : inferSemanticTags(reward.name);
    }, [childRedeemedRewards]);

    const contextualFooterAd = useMemo(() => {
        return pickContextualFooterAd({
            recommendations: productRecommendations,
            lastRewardTags: latestRewardTags,
            lastTaskTags: latestCompletedHabitTags,
        });
    }, [productRecommendations, latestRewardTags, latestCompletedHabitTags]);

    const mobileHomeBanners = useMemo(() => {
        type BannerItem = {
            id: string;
            type: "master" | "recommendation";
            title: string;
            description: string;
            imageUrl?: string;
            href?: string;
        };
        const items: BannerItem[] = [];
        if (masterProfessional) {
            items.push({
                id: `master:${masterProfessional.id}`,
                type: "master",
                title: masterProfessional.name,
                description: getSpecialtiesLabel(masterProfessional) || "Profissional master da sua região",
                imageUrl: masterProfessional.photoUrl || "",
            });
        }
        productRecommendations
            .filter((rec: any) => rec?.isActive !== false)
            .slice(0, 6)
            .forEach((rec: any) => {
                items.push({
                    id: `rec:${String(rec.id || rec.title || Math.random())}`,
                    type: "recommendation",
                    title: String(rec.title || "Recomendação"),
                    description: String(rec.description || "Conteúdo selecionado para você"),
                    imageUrl: String(rec.imageUrl || ""),
                    href: String(rec.linkUrl || ""),
                });
            });
        if (contextualFooterAd) {
            items.push({
                id: `contextual:${contextualFooterAd.id}`,
                type: "recommendation",
                title: String(contextualFooterAd.title || "Oferta"),
                description: String(contextualFooterAd.description || "Oferta contextual para você"),
                imageUrl: String(contextualFooterAd.imageUrl || ""),
                href: String(contextualFooterAd.linkUrl || ""),
            });
        }
        const unique = items.filter((item, index, arr) => arr.findIndex((i) => i.id === item.id) === index);
        if (unique.length === 0) return [] as BannerItem[];
        const target = Math.min(4, Math.max(1, unique.length));
        const next: BannerItem[] = [];
        for (let i = 0; i < target; i += 1) {
            next.push(unique[i % unique.length]);
        }
        while (next.length < 4) {
            next.push(unique[next.length % unique.length]);
        }
        return next;
    }, [masterProfessional, productRecommendations, contextualFooterAd]);

    useEffect(() => {
        if (mobileHomeBanners.length === 0) {
            setMobileHomeBannerIndex(0);
            return;
        }
        setMobileHomeBannerIndex((prev) => prev % mobileHomeBanners.length);
    }, [mobileHomeBanners.length]);

    const activeHomeBanner = useMemo(() => {
        if (mobileHomeBanners.length === 0) return null;
        return mobileHomeBanners[mobileHomeBannerIndex % mobileHomeBanners.length];
    }, [mobileHomeBanners, mobileHomeBannerIndex]);

    useEffect(() => {
        const container = mobileBannerScrollerRef.current;
        if (!container || mobileHomeBanners.length <= 1) return;
        const width = container.clientWidth;
        if (!width) return;
        const normalized = mobileHomeBannerIndex % mobileHomeBanners.length;
        container.scrollTo({ left: normalized * width, behavior: "smooth" });
    }, [mobileHomeBannerIndex, mobileHomeBanners.length]);

    const handleMobileBannerScroll = () => {
        const container = mobileBannerScrollerRef.current;
        if (!container || mobileHomeBanners.length <= 1) return;
        const width = container.clientWidth || 1;
        const rawIndex = Math.round(container.scrollLeft / width);
        const normalized = ((rawIndex % mobileHomeBanners.length) + mobileHomeBanners.length) % mobileHomeBanners.length;
        if (normalized !== (mobileHomeBannerIndex % mobileHomeBanners.length)) {
            setMobileHomeBannerIndex(normalized);
        }
    };

    useEffect(() => {
        if (heroExclusiveProfessional) {
            trackProfessionalEvent(heroExclusiveProfessional.id, "impression", {
                source: "dashboard",
                slot: "hero_exclusive",
                cityId: familyLocation?.cityId,
            });
            trackAdEvent(`hero:${heroExclusiveProfessional.id}`, "impression", { slot: "hero_exclusive" });
        }
    }, [heroExclusiveProfessional, familyLocation?.cityId, trackProfessionalEvent, trackAdEvent]);

    useEffect(() => {
        proCarouselChunks.forEach((chunk, chunkIndex) => {
            chunk.forEach((prof) => {
                trackProfessionalEvent(prof.id, "impression", {
                    source: "dashboard",
                    slot: `pro_carousel_${chunkIndex + 1}`,
                    cityId: familyLocation?.cityId,
                });
            });
        });
    }, [proCarouselChunks, familyLocation?.cityId, trackProfessionalEvent]);

    useEffect(() => {
        if (contextualFooterAd) {
            trackAdEvent(`footer:${contextualFooterAd.id}`, "impression", { slot: "contextual_footer" });
        }
    }, [contextualFooterAd, trackAdEvent]);

    useEffect(() => {
        if (!activeHomeBanner) return;
        if (activeHomeBanner.type === "master") {
            const masterId = activeHomeBanner.id.replace("master:", "");
            trackAdEvent(`home_banner:${activeHomeBanner.id}`, "impression", { slot: "home_mobile_carousel" });
            if (masterId) {
                trackProfessionalEvent(masterId, "impression", {
                    source: "dashboard",
                    slot: "home_mobile_carousel_master",
                    cityId: familyLocation?.cityId,
                });
            }
            return;
        }
        trackAdEvent(`home_banner:${activeHomeBanner.id}`, "impression", { slot: "home_mobile_carousel" });
    }, [activeHomeBanner, trackAdEvent, trackProfessionalEvent, familyLocation?.cityId]);

    const renderMasterBanner = () => {
        if (!masterProfessional) return null;
        return (
            <div className="max-w-4xl mx-auto">
                <SupportSpotlightCard
                    prof={masterProfessional}
                    type="master"
                    onOpenNetwork={() => setCurrentView('supportNetwork')}
                    isCollapsed={false}
                    onToggle={() => {}}
                    collapsible={false}
                />
            </div>
        );
    };

    const renderServiceSpotlight = (professional: Professional | null, { inline = false }: { inline?: boolean } = {}) => {
        if (!professional) return null;
        const cardType = professional.tier === "exclusive" ? "exclusive" : "pro";
        return (
            <div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 ${inline ? "" : "mb-6"}`}>
                <div className="grid grid-cols-1 gap-4">
                    <SupportSpotlightCard
                        prof={professional}
                        type={cardType}
                        onOpenNetwork={() => setCurrentView('supportNetwork')}
                        isCollapsed={isPremiumCollapsed}
                        onToggle={() => setIsPremiumCollapsed((prev) => !prev)}
                    />
                </div>
            </div>
        );
    };

    const renderProCarousel = (professionals: Professional[], keyPrefix: string) => (
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <div className="flex gap-3 overflow-x-auto pb-2">
                {professionals.map((prof) => (
                    <div key={`${keyPrefix}-${prof.id}`} className="relative min-w-[220px] max-w-[220px] bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <span className="absolute top-0 right-0 inline-flex items-center rounded-bl-lg bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5">
                            PRO
                        </span>
                        <div className="flex items-center gap-2">
                            <img src={prof.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.name)}&background=random`} alt={prof.name} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{prof.name}</p>
                                <p className="text-[11px] text-gray-500 truncate">{getSpecialtiesLabel(prof)}</p>
                            </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                            {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                                <a
                                    href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => trackAdEvent(`pro:${prof.id}`, "click", { slot: "pro_carousel" })}
                                    className="flex-1 text-center text-xs font-bold rounded-lg py-1.5 bg-purple-600 text-white"
                                >
                                    Contato
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderFavoritesView = () => (
        <div className="max-w-4xl mx-auto bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Meus Favoritos</h3>
                <button onClick={() => setCurrentView('supportNetwork')} className="text-purple-600 font-bold text-xs">Ver Rede de Serviços Profissionais &rarr;</button>
            </div>
            {favoriteProfessionals.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {favoriteProfessionals.map((prof) => (
                        <SupportFavoriteTopCard key={prof.id} prof={prof} onToggleFavorite={toggleFavoriteProfessional} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-6">
                    <p className="text-gray-500 text-sm">Você ainda não tem favoritos.</p>
                    <button onClick={() => setCurrentView('supportNetwork')} className="mt-2 text-purple-600 font-bold text-xs">Explorar profissionais &rarr;</button>
                </div>
            )}
        </div>
    );

    const SidebarActions = () => {
        const adminNavButtonClass = (view?: ParentView) => {
            const isActive = view ? currentView === view : false;
            return `w-full flex items-center gap-3 p-3 rounded-xl transition-colors font-semibold text-sm border ${
                isActive
                    ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                    : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
            }`;
        };

        return (
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto px-4 pt-4 space-y-2 pb-4">
                {isAdmin && (
                    <div className="mb-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                        <div className="px-1">
                            <div className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">Painel Administrativo</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">Gestão central do aplicativo</div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-2 space-y-2">
                            <div className="px-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Profissionais</div>
                            <button onClick={() => { setCurrentView('adminSupportNetwork'); setIsMenuOpen(false); }} className={adminNavButtonClass('adminSupportNetwork')}>
                                <UsersIcon className="w-5 h-5 text-purple-500" />
                                <span>Adicionar Profissional</span>
                            </button>
                            <button onClick={() => { setManageManagersModalOpen(true); setIsMenuOpen(false); }} className={adminNavButtonClass()}>
                                <UsersIcon className="w-5 h-5 text-indigo-500" />
                                <span>Adicionar Gerente</span>
                            </button>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-2 space-y-2">
                            <div className="px-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Planos e Master</div>
                            <button onClick={() => { setCurrentView('adminSupportNetworkPricing'); setIsMenuOpen(false); }} className={adminNavButtonClass('adminSupportNetworkPricing')}>
                                <ClipboardListIcon className="w-5 h-5 text-amber-500" />
                                <span>Precificação de Planos</span>
                            </button>
                            <button onClick={() => { setCurrentView('adminMasterDefaults'); setIsMenuOpen(false); }} className={adminNavButtonClass('adminMasterDefaults')}>
                                <UsersIcon className="w-5 h-5 text-rose-500" />
                                <span>Master Default</span>
                            </button>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-2 space-y-2">
                            <div className="px-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Conteúdo</div>
                            <button onClick={() => { setCurrentView('adminTemplates'); setIsMenuOpen(false); }} className={adminNavButtonClass('adminTemplates')}>
                                <ClipboardListIcon className="w-5 h-5 text-emerald-500" />
                                <span>Gerenciar Rotinas</span>
                            </button>
                            <button onClick={() => { setCurrentView('adminRecommendations'); setIsMenuOpen(false); }} className={adminNavButtonClass('adminRecommendations')}>
                                <GiftIcon className="w-5 h-5 text-cyan-500" />
                                <span>Gerenciar Shopping</span>
                            </button>
                            <button onClick={() => { setCurrentView('adminTagCatalog'); setIsMenuOpen(false); }} className={adminNavButtonClass('adminTagCatalog')}>
                                <ClipboardListIcon className="w-5 h-5 text-fuchsia-500" />
                                <span>Catálogo de Tags</span>
                            </button>
                        </div>
                    </div>
                )}

                {isAdmin ? (
                    <>
                        <div className="px-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">Operação</div>
                        <button onClick={() => { setManageRewardsModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><StarsIcon className="w-5 h-5 text-gray-500" /> Gerenciar Recompensas</button>
                        {canManageMembers && (
                            <button onClick={() => { setManageMembersModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><UserIcon className="w-5 h-5 text-gray-500" /> Gerenciar Membros</button>
                        )}
                    </>
                ) : null}

                {!isAdmin && (
                    <button onClick={() => { setProgressModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><ChartBarIcon className="w-5 h-5 text-gray-500" /> Quadro de Progresso</button>
                )}
                {!isAdmin && (
                    <button onClick={() => { setManageRewardsModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><StarsIcon className="w-5 h-5 text-gray-500" /> Gerenciar Recompensas</button>
                )}
                {!isAdmin && canManageMembers && (
                    <button onClick={() => { setManageMembersModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><UserIcon className="w-5 h-5 text-gray-500" /> Gerenciar Membros</button>
                )}
                <button
                    onClick={() => {
                        onEnterTvMode();
                        setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-4 p-3 bg-purple-50 text-purple-800 rounded-xl hover:bg-purple-100 transition-colors font-semibold text-sm"
                >
                    <TvIcon className="w-5 h-5 text-purple-600" /> Modo TV/Tablet
                </button>
                <hr className="my-2"/>
                {!isAdmin && (
                    <>
                        <button onClick={() => { setCurrentView('recommendations'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><GiftIcon className="w-5 h-5 text-gray-500" /> Shopping</button>
                        <button onClick={() => { setCurrentView('supportNetwork'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><UsersIcon className="w-5 h-5 text-gray-500" /> Rede de Serviços Profissionais</button>
                        <button onClick={() => { setCurrentView('manageLinks'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><ClipboardListIcon className="w-5 h-5 text-gray-500" /> Gerenciar vínculos</button>
                        <button onClick={() => { setCurrentView('favorites'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><HeartIcon className="w-5 h-5 text-gray-500" /> Meus Favoritos</button>
                    </>
                )}
                {isManager && !isAdmin && (
                    <div className="pt-2 mt-2 border-t">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Gerente</div>
                        <button onClick={() => { setCurrentView('adminSupportNetwork'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-purple-50 text-purple-800 rounded-xl hover:bg-purple-100 transition-colors font-semibold text-sm"><UsersIcon className="w-5 h-5 text-purple-500" /> Inserir Profissionais</button>
                    </div>
                )}
            </div>

            <div className="p-4 mt-auto space-y-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Perfil</p>
                    <p className="text-sm text-gray-700">
                        <span className="font-semibold">Logado:</span>{' '}
                        <span className="font-bold">{currentUserEmail || "-"}</span>
                    </p>
                    <button
                        onClick={() => setProfileModalOpen(true)}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-700 hover:bg-purple-100 transition-colors"
                        aria-label="Editar perfil"
                    >
                        <PencilIcon className="w-4 h-4" />
                        Editar perfil
                    </button>
                </div>
                <button
                    onClick={() => {
                        signOut(auth);
                        setIsMenuOpen(false);
                    }}
                    className="w-full rounded-xl border border-gray-200 p-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                    Sair / Trocar conta
                </button>
                {!isAdmin && <AdSlot placement="SIDEBAR" />}
            </div>
        </div>
    )};

    const renderCurrentView = () => {
        switch (currentView) {
            case 'recommendations':
                return <ProductsRecommendations onClose={() => setCurrentView('dashboard')} />;
            case 'supportNetwork':
                return (
                    <SupportNetworkPage
                        onClose={() => {
                            setCurrentView('dashboard');
                        }}
                        linkedProfessionalIds={familyProfessionalLinks
                            .filter((link) => link.status === "active")
                            .map((link) => link.professionalId)}
                    />
                );
            case 'routineLibrary':
                return (
                    <RoutineLibraryPage
                        onClose={() => setCurrentView("dashboard")}
                        templates={routineTemplates}
                        familyLocation={settings.familyLocation}
                        importedTemplateIds={importedRoutineTemplateIds}
                        onToggleImport={toggleRoutineTemplateImport}
                        initialAreaKey={routineLibraryInitialArea}
                    />
                );
            case 'manageLinks':
                return (
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 space-y-4">
                        <div className="max-w-4xl mx-auto space-y-3">
                            <div className="bg-white rounded-2xl border border-gray-200 p-4">
                                <h2 className="text-lg font-bold text-gray-800">Gerenciar vínculos</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Ajuste pessoas compartilhadas, blocos autorizados e prazo (até 90 dias).
                                </p>
                            </div>
                            {familyProfessionalLinks.length === 0 && (
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm text-gray-500">
                                    Você ainda não possui vínculos ativos.
                                </div>
                            )}
                            {familyProfessionalLinks.map((link) => {
                                const draft = linkDrafts[link.id];
                                if (!draft) return null;
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const maxDate = new Date(today);
                                maxDate.setDate(maxDate.getDate() + 90);
                                const maxDateStr = toIsoDate(maxDate.getTime());
                                const expiresMs = draft.expiresAtDate ? new Date(`${draft.expiresAtDate}T23:59:59`).getTime() : null;
                                const daysRemaining = expiresMs ? Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                                const isNearExpiry = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 10;
                                const expiresDateLabel = expiresMs
                                    ? new Date(expiresMs).toLocaleDateString("pt-BR")
                                    : null;
                                return (
                                    <div key={link.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-base font-bold text-gray-800">{link.professionalName}</p>
                                                <p className="text-xs text-gray-500">ID: {link.professionalId}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { void handleEndLinkNow(link); }}
                                                className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 text-xs font-bold"
                                            >
                                                Encerrar vínculo
                                            </button>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-600 mb-2">Pessoas vinculadas</p>
                                            <div className="flex flex-wrap gap-2">
                                                {children.map((child) => {
                                                    const isSelected = draft.linkedChildIds.includes(child.id);
                                                    return (
                                                        <button
                                                            key={`${link.id}-${child.id}`}
                                                            type="button"
                                                            onClick={() => handleToggleLinkChild(link.id, child.id)}
                                                            className={`px-2 py-1 rounded-full text-xs font-semibold border ${
                                                                isSelected ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200"
                                                            }`}
                                                        >
                                                            {child.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                                            <p className="text-xs font-bold text-gray-600">Blocos autorizados</p>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input type="checkbox" checked={draft.consentBlocks.personal} onChange={() => handleToggleLinkBlock(link.id, "personal")} />
                                                Informações pessoais
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input type="checkbox" checked={draft.consentBlocks.profile} onChange={() => handleToggleLinkBlock(link.id, "profile")} />
                                                Perfil e rotina
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input type="checkbox" checked={draft.consentBlocks.health} onChange={() => handleToggleLinkBlock(link.id, "health")} />
                                                Saúde
                                            </label>
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-[260px_1fr] items-start">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">Encerrar vínculo em</label>
                                                <input
                                                    type="date"
                                                    value={draft.expiresAtDate}
                                                    min={getTodayDateString()}
                                                    max={maxDateStr}
                                                    onChange={(e) => updateLinkDraft(link.id, (prev) => ({ ...prev, expiresAtDate: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                                />
                                                <p className="text-[11px] text-gray-500 mt-1">Opcional. Máximo de 90 dias.</p>
                                            </div>
                                            <div className="pt-1">
                                                {isNearExpiry && expiresDateLabel && (
                                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                                        Vínculo encerrará no dia {expiresDateLabel} (alterar?)
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => { void handleSaveLinkDraft(link); }}
                                                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700"
                                            >
                                                Salvar alterações
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            case 'favorites':
                return (
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24">
                        {renderFavoritesView()}
                    </div>
                );
            case "adminSupportNetwork":
                if (!isAdmin && !isManager) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageSupportNetworkModal embedded onClose={() => setCurrentView("dashboard")} />;
            case "adminTemplates":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageTemplatesModal embedded onClose={() => setCurrentView("dashboard")} />;
            case "adminRecommendations":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageRecommendationsModal embedded onClose={() => setCurrentView("dashboard")} />;
            case "adminSupportNetworkPricing":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageSupportNetworkPricingModal embedded onClose={() => setCurrentView("dashboard")} />;
            case "adminMasterDefaults":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageMasterDefaultsModal embedded onClose={() => setCurrentView("dashboard")} />;
            case "adminTagCatalog":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageTagCatalogModal embedded onClose={() => setCurrentView("dashboard")} />;
            case 'dashboard':
            default:
                return (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <header className="md:hidden bg-gradient-to-b from-purple-700 via-purple-700 to-purple-600 border-b border-purple-500 px-4 py-1.5 z-10 space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="inline-flex h-8 items-center gap-1 rounded-lg border border-purple-300 bg-white/95 px-2 text-[11px] font-semibold text-purple-900">
                                    <MapPinIcon className="w-3.5 h-3.5 text-purple-700" />
                                    <span className="max-w-[170px] truncate">{mobileLocationLabel}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setIsNotificationsOpen((prev) => !prev)}
                                        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-300 bg-yellow-100 text-purple-800"
                                        aria-label="Notificações"
                                        title="Notificações"
                                    >
                                        <BellIcon className="w-4 h-4" />
                                        {unreadNotificationsCount > 0 && (
                                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold leading-4 text-center">
                                                {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setIsMenuOpen(true)}
                                        className="inline-flex h-8 w-8 items-center justify-center text-purple-800 rounded-lg border border-yellow-300 bg-yellow-100"
                                        aria-label="Menu"
                                        title="Menu"
                                    >
                                        <MenuIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div
                                className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5"
                                style={{ msOverflowStyle: "none", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                                onScroll={handleAreasScroll}
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMobileProfessionalArea("all");
                                        try {
                                            window.localStorage.setItem("supportNetworkPrefilters", JSON.stringify({ searchQuery: "", selectedArea: "all" }));
                                        } catch {}
                                        setCurrentView("supportNetwork");
                                    }}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap bg-white text-gray-700 border-purple-200"
                                >
                                    Tudo
                                </button>
                                {mobileProfessionalAreas.filter((item) => item.key !== "all").map((area) => (
                                    <button
                                        key={`chip-${area.key}`}
                                        type="button"
                                        onClick={() => {
                                            setMobileProfessionalArea(area.key);
                                            try {
                                                window.localStorage.setItem("supportNetworkPrefilters", JSON.stringify({ searchQuery: "", selectedArea: area.key }));
                                            } catch {}
                                            setCurrentView("supportNetwork");
                                        }}
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap bg-white text-gray-700 border-purple-200"
                                    >
                                        {area.label}
                                    </button>
                                ))}
                            </div>
                            <div className="rounded-xl border border-purple-300 bg-white p-1.5">
                                {mobileHomeBanners.length > 0 ? (
                                    <div
                                        ref={mobileBannerScrollerRef}
                                        onScroll={handleMobileBannerScroll}
                                        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
                                    >
                                        {mobileHomeBanners.map((banner) => (
                                            <button
                                                key={`mobile-banner-${banner.id}`}
                                                type="button"
                                                onClick={() => {
                                                    if (banner.type === "master") {
                                                        trackAdEvent(`home_banner:${banner.id}`, "click", { slot: "home_mobile_carousel" });
                                                        setCurrentView("supportNetwork");
                                                        return;
                                                    }
                                                    if (banner.href) {
                                                        trackAdEvent(`home_banner:${banner.id}`, "click", { slot: "home_mobile_carousel" });
                                                        window.open(banner.href, "_blank", "noopener,noreferrer");
                                                    }
                                                }}
                                                className="w-full shrink-0 snap-center text-left relative flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-3 min-h-[86px]"
                                            >
                                                {banner.imageUrl ? (
                                                    <img src={banner.imageUrl} alt={banner.title} className="w-14 h-14 rounded-lg object-cover border border-purple-200" />
                                                ) : (
                                                    <GiftIcon className="w-6 h-6 text-purple-600" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[13px] font-bold text-purple-800 line-clamp-1 leading-tight">{banner.title}</p>
                                                    <p className="text-[12px] text-purple-600 line-clamp-2 leading-snug">{banner.description}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <AdSlot placement="MOBILE_BANNER" />
                                )}
                            </div>
                            <div
                                className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar pb-0.5"
                                style={{ msOverflowStyle: "none", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                                onScroll={handleRoutineScroll}
                            >
                                {routineLibraryAreas.map((area) => (
                                    <button
                                        key={`theme-${area.key}`}
                                        type="button"
                                        onClick={() => {
                                            setRoutineLibraryInitialArea(area.key);
                                            setCurrentView("routineLibrary");
                                        }}
                                        className="text-[11px] font-semibold text-white whitespace-nowrap"
                                    >
                                        {area.label}
                                    </button>
                                ))}
                            </div>
                        </header>
                        {isNotificationsOpen && (
                            <div className="md:hidden bg-purple-600/95 border-b border-purple-500 px-4 py-2">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-[11px] font-semibold text-purple-100">
                                        {unreadNotificationsCount} não lida(s) • {readNotificationsCount} lida(s)
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => { void clearReadNotifications(); }}
                                        disabled={readNotificationsCount === 0}
                                        className="text-[11px] font-bold text-yellow-200 disabled:text-purple-300"
                                    >
                                        Apagar lidas
                                    </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-2">
                                    {notifications.length === 0 && <p className="text-xs text-gray-500">Sem notificações.</p>}
                                    {notifications.map((item) => (
                                        <div
                                            key={item.id}
                                            className={`w-full rounded-lg border px-2 py-2 ${
                                                item.readAt ? "bg-white border-gray-200" : "bg-purple-50 border-purple-200"
                                            }`}
                                        >
                                            <button
                                                onClick={() => {
                                                    if (item.type === "PRO_LINK_CPF_REQUEST" && item.metadata?.requestId) {
                                                        void openProfessionalLinkRequestModal(
                                                            item.id,
                                                            String(item.metadata.requestId),
                                                            String(item.metadata.professionalName || "")
                                                        );
                                                        return;
                                                    }
                                                    void markNotificationAsRead(item.id);
                                                }}
                                                className="w-full text-left"
                                            >
                                                <p className="text-xs font-bold text-gray-800">{item.title || "Notificação"}</p>
                                                <p className="text-[11px] text-gray-600">{item.message || ""}</p>
                                            </button>
                                            {item.readAt && (
                                                <div className="mt-1 flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => { void deleteNotification(item.id); }}
                                                        className="text-[11px] font-bold text-rose-700"
                                                    >
                                                        Excluir
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto px-4 pt-0 pb-32 md:p-6 md:pb-28 space-y-6 custom-scrollbar">
                            {masterProfessional && (
                                <>
                                    <div className="hidden md:block mb-2">
                                        {renderMasterBanner()}
                                    </div>
                                </>
                            )}
                            {children.length > 0 && (
                                <div className="md:hidden sticky top-0 z-20 mt-0 mb-1 bg-white border-y border-gray-100 pt-0.5 pb-0.5 shadow-sm isolate">
                                    <div className="relative">
                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                                        {canWriteChildren && !isAdmin && (
                                            <button
                                                type="button"
                                                onClick={handleOpenAddChildModal}
                                                disabled={hasReachedFreemiumProfileLimit}
                                                className="sticky left-0 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-bold whitespace-nowrap shadow-sm disabled:opacity-50"
                                                aria-label="Adicionar pessoa"
                                                title="Adicionar pessoa"
                                            >
                                                <UsersIcon className="w-3.5 h-3.5" />
                                                <PlusIcon className="w-3 h-3" />
                                            </button>
                                        )}
                                        {children.map((child) => (
                                            <button
                                                key={child.id}
                                                onClick={() => handleSelectChild(child)}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold whitespace-nowrap ${
                                                    selectedChildId === child.id
                                                        ? "bg-purple-600 text-white border-purple-600"
                                                        : "bg-white text-gray-600 border-gray-200"
                                                }`}
                                            >
                                                <ChildAvatar
                                                    avatar={child.avatar}
                                                    alt={child.name}
                                                    emojiClassName="text-base"
                                                    imageClassName="w-4.5 h-4.5 rounded-full object-cover border border-white/40"
                                                />
                                                <span className="max-w-[90px] truncate">{child.name}</span>
                                                {isPrincipalProfile(child.id) && (
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${selectedChildId === child.id ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
                                                        #1
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-1 h-1 w-16 rounded-full bg-purple-300" />
                                    </div>
                                </div>
                            )}
                            {selectedChild ? (
                                <div className="max-w-4xl mx-auto">
                                    <div className="bg-white/95 p-4 md:p-6 rounded-2xl shadow-[0_12px_28px_-18px_rgba(76,29,149,.45)] border border-purple-100 mb-6 -mt-6 backdrop-blur-sm">
                                        <div className="-mt-1 mb-3 space-y-2">
                                            <div className="relative flex items-center justify-center">
                                                <div className="absolute left-0 flex items-center gap-1">
                                                    {isViewingToday && (
                                                        <span className="text-[11px] font-black px-2 py-1 rounded-full bg-purple-600 text-white">
                                                            Hoje
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => showToast("Seção de desafios será liberada em breve.", "warning")}
                                                    className="text-xs font-bold text-orange-600"
                                                >
                                                    🔥 Desafio
                                                </button>
                                                <span className={`absolute right-0 text-[10px] font-black px-2 py-1 rounded-full border ${dayProgressBadgeClassName}`}>
                                                    {dayProgress.done}/{dayProgress.total} {dayProgress.percent}%
                                                </span>
                                            </div>
                                            {dayProgress.percent >= 100 && (
                                                <div className="flex justify-end -mt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAchievementShareOpen(true)}
                                                        className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700"
                                                    >
                                                        😄 Causar inveja
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-semibold text-gray-700 capitalize">{viewedWeekdayLabel}</span>
                                                <span className="text-sm font-semibold text-gray-500">{viewedMonthYearLabel}</span>
                                            </div>
                                            <div className="grid grid-cols-7 gap-1.5 rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50/60 to-fuchsia-50/50 p-2">
                                                {weekDayLetters.map((letter, idx) => {
                                                    const date = weekDates[idx];
                                                    const iso = toIsoLocalDate(date);
                                                    const isTodayCell = iso === getTodayDateString();
                                                    const isSelectedCell = iso === viewedDate;
                                                    return (
                                                        <button
                                                            key={`week-${iso}`}
                                                            type="button"
                                                            onClick={() => setViewedDate(iso)}
                                                            className={`rounded-xl py-1.5 text-center border transition ${
                                                                isSelectedCell
                                                                    ? "border-purple-500 bg-purple-50 shadow-sm"
                                                                    : "border-transparent bg-gray-50 hover:bg-gray-100"
                                                            }`}
                                                        >
                                                            <div className="text-[10px] font-black text-gray-500">{letter}</div>
                                                            <div className={`text-[11px] font-black ${isTodayCell ? "text-white bg-purple-700 ring-2 ring-purple-200 rounded-full w-6 h-6 mx-auto flex items-center justify-center shadow-sm" : "text-gray-700"}`}>
                                                                {date.getDate()}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {appointmentsForViewedDate.length > 0 && (
                                            <div className="mb-3 space-y-2.5">
                                                <p className="text-xs font-black uppercase tracking-wide text-slate-600">Consultas do dia</p>
                                                {appointmentsForViewedDate.map((appointment) => {
                                                    const status = appointment.patientStatus;
                                                    const visual = getFamilyAppointmentVisual(appointment);
                                                    return (
                                                        <div
                                                            key={`appt-card-${appointment.id}`}
                                                            className={`rounded-2xl border p-3.5 ${visual.card} transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md`}
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div>
                                                                    <p className="text-sm font-black text-slate-800">
                                                                        {new Date(appointment.startsAtIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {appointment.childName}
                                                                    </p>
                                                                    {appointment.tags.length > 0 && (
                                                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                                                            {appointment.tags.map((tag) => (
                                                                                <span key={`${appointment.id}-${tag}`} className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-slate-200 bg-white/90 text-slate-700 shadow-sm">
                                                                                    {tag}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {appointment.notes && (
                                                                        <p className="text-[11px] text-slate-700 mt-1 line-clamp-2">{appointment.notes}</p>
                                                                    )}
                                                                    {status === "cancelled" && appointment.cancelledByProfessional && (
                                                                        <p className="text-[11px] mt-1 font-black text-rose-700">Esta consulta foi cancelada pelo profissional.</p>
                                                                    )}
                                                                </div>
                                                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${visual.badge}`}>
                                                                    {visual.label}
                                                                </span>
                                                            </div>
                                                            <div className="mt-2.5 flex flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { void handleConfirmAppointment(appointment.id); }}
                                                                    disabled={status !== "pending"}
                                                                    className={`h-9 px-3.5 rounded-xl text-xs font-black shadow-sm ${
                                                                        status === "confirmed" ? "bg-blue-600 text-white" : "bg-amber-500 text-white hover:bg-amber-600"
                                                                    } disabled:opacity-80`}
                                                                >
                                                                    Confirmar consulta
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { void handleCancelAppointment(appointment.id); }}
                                                                    disabled={status === "cancelled"}
                                                                    className="h-9 px-3.5 rounded-xl bg-rose-600 text-white text-xs font-black shadow-sm hover:bg-rose-700 disabled:opacity-80"
                                                                >
                                                                    X Cancelar consulta
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {appointmentsForViewedDate.length === 0 && nextAppointmentForSelectedChild && (
                                            <div className="mb-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3.5 py-2.5 shadow-sm animate-[fadeIn_.25s_ease-out]">
                                                <p className="text-[11px] font-black text-sky-900">
                                                    Próxima consulta em {new Date(nextAppointmentForSelectedChild.startsAtIso).toLocaleDateString("pt-BR")} às {new Date(nextAppointmentForSelectedChild.startsAtIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
                                                </p>
                                                <p className="text-[10px] text-sky-700 mt-0.5">
                                                    Selecione esse dia no calendário para confirmar ou cancelar.
                                                </p>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                            {habitsForDate.map((habit, index) => {
                                                const Icon = HABIT_ICONS[habit.icon];
                                                const status = habit.completions[viewedDate];
                                                const isCompleted = status === 'COMPLETED';
                                                const isPending = status === 'PENDING';
                                                const scheduleMeta = getHabitScheduleMeta(habit);
                                                const isQrSaude = habit.source === "qrsaude";
                                                const bgColor = isCompleted ? 'bg-green-50/70 border-green-100' : isPending ? 'bg-yellow-50/70 border-yellow-200' : 'bg-gray-50/70 border-red-200';
                                                const qrSaudeBorderClass = isQrSaude ? "border-amber-300 ring-1 ring-amber-200" : "";
                                                const rewardClass = isCompleted || isPending ? 'text-yellow-700' : 'text-yellow-700/35';
                                                const categoryStyle = getHabitCategoryStyle(habit.category);
                                                const iconClasses = isCompleted
                                                    ? 'bg-white text-green-500'
                                                    : isPending
                                                    ? 'bg-white text-yellow-500'
                                                    : `${categoryStyle?.iconBg ?? 'bg-white'} ${categoryStyle?.icon ?? 'text-purple-500'}`;
                                                const cardThumbUrl = isQrSaude
                                                    ? (habit.prescribedByProfessionalPhotoUrl || habit.imageUrl || "")
                                                    : (habit.imageUrl || "");
                                                const swipeRules = getHabitSwipeRules(habit);
                                                const canSwipeToComplete = swipeRules.canSwipeToComplete;
                                                const canSwipeToAction = swipeRules.canSwipeToAction;
                                                const leftSwipeAction = swipeRules.leftSwipeAction;
                                                const canHandleSwipe = canSwipeToComplete || canSwipeToAction;
                                                const swipeOffset = swipeOffsets[habit.id] ?? 0;
                                                const swipeRightProgress = swipeOffset > 0 ? Math.min(1, swipeOffset / SWIPE_COMPLETE_THRESHOLD) : 0;
                                                const swipeLeftProgress = swipeOffset < 0 ? Math.min(1, Math.abs(swipeOffset) / SWIPE_COMPLETE_THRESHOLD) : 0;

                                                // Hero Exclusive: inserir após a 2a rotina (fallback após a 1a se lista curta)
                                                const shouldInsertSupportMobile = index === Math.min(1, Math.max(0, habitsForDate.length - 1));
                                                const supportProfessionalMobile = shouldInsertSupportMobile
                                                    ? heroExclusiveProfessional
                                                    : null;

                                                // Desktop md/xl: mesma regra de inserir 1x por carregamento
                                                const shouldInsertSupportDesktopMd = index === Math.min(1, Math.max(0, habitsForDate.length - 1));
                                                const supportProfessionalDesktopMd = shouldInsertSupportDesktopMd
                                                    ? heroExclusiveProfessional
                                                    : null;

                                                const shouldInsertSupportDesktopXl = index === Math.min(1, Math.max(0, habitsForDate.length - 1));
                                                const supportProfessionalDesktopXl = shouldInsertSupportDesktopXl
                                                    ? heroExclusiveProfessional
                                                    : null;
                                                const proChunkSlot = proInsertPositions.indexOf(index);
                                                const proChunk = proChunkSlot >= 0 ? proCarouselChunks[proChunkSlot] : null;
                                                return (
                                                    <React.Fragment key={habit.id}>
                                                        <div className="relative rounded-xl overflow-hidden">
                                                            {canSwipeToComplete && (
                                                                <div
                                                                    className="absolute inset-y-0 left-0 flex items-center gap-1.5 bg-green-500/15 px-3 text-green-700"
                                                                    style={{ width: `${Math.max(56, swipeOffset)}px`, opacity: Math.max(0.25, swipeRightProgress) }}
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                    <span className="text-[11px] font-bold">Feito</span>
                                                                </div>
                                                            )}
                                                            {canSwipeToAction && leftSwipeAction && (
                                                                <div
                                                                    className="absolute inset-y-0 right-0 flex items-center justify-end px-2 bg-indigo-500/15"
                                                                    style={{
                                                                        width: `${Math.max(92, Math.abs(Math.min(0, swipeOffset)))}px`,
                                                                        opacity: Math.max(0.3, swipeLeftProgress),
                                                                    }}
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleLeftSwipeActionClick(habit)}
                                                                        className="min-h-[42px] max-w-[118px] px-2 py-1 rounded-lg text-[10px] leading-tight font-bold bg-indigo-600 text-white whitespace-normal break-words text-center"
                                                                    >
                                                                        {leftSwipeAction.label}
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <div
                                                                className={`grid grid-cols-[56px,1fr,76px] items-start gap-2 p-2 sm:p-2 rounded-xl border transition-transform ${canHandleSwipe ? "" : "transition-all"} ${bgColor} ${qrSaudeBorderClass}`}
                                                                style={canHandleSwipe ? { transform: `translateX(${swipeOffset}px)` } : undefined}
                                                                onTouchStart={canHandleSwipe ? (event) => beginHabitSwipe(habit.id, event) : undefined}
                                                                onTouchMove={canHandleSwipe ? moveHabitSwipe : undefined}
                                                                onTouchEnd={canHandleSwipe ? () => endHabitSwipe(habit.id) : undefined}
                                                                onTouchCancel={canHandleSwipe ? () => endHabitSwipe(habit.id) : undefined}
                                                            >
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 ${iconClasses}`}>
                                                                        {cardThumbUrl ? (
                                                                            <img src={cardThumbUrl} alt={habit.name} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                                                                        )}
                                                                    </div>
                                                                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold leading-tight text-center ${scheduleMeta.className}`}>
                                                                        {scheduleMeta.label}
                                                                    </span>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span className={`text-[12px] sm:text-[13px] font-bold block leading-tight break-words line-clamp-2 ${isCompleted ? 'text-green-800' : 'text-gray-800'}`}>{habit.name}</span>
                                                                    {isQrSaude && habit.prescribedByProfessionalName && (
                                                                        <div className="mt-0.5 text-[9px] text-amber-700 font-semibold line-clamp-1">
                                                                            {habit.prescribedByProfessionalName}
                                                                        </div>
                                                                    )}
                                                                    <div className="mt-0.5 flex items-start gap-1 text-[9px] sm:text-[10px] text-gray-500 min-w-0">
                                                                        <span className={`${rewardClass} font-bold flex items-center gap-0.5 shrink-0`}>
                                                                            {isQrSaude
                                                                                ? "+1 💎"
                                                                                : habit.reward.type === 'STARS'
                                                                                    ? `+${habit.reward.value}`
                                                                                    : habit.reward.activityName}
                                                                            {!isQrSaude && habit.reward.type === 'STARS' && <StarIcon className="w-3.5 h-3.5" />}
                                                                        </span>
                                                                        {habit.sponsorNote && (
                                                                            <span className="text-[9px] sm:text-[10px] leading-tight text-gray-500 line-clamp-2 break-words min-w-0">
                                                                                {habit.sponsorNote}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="w-[76px] flex flex-col items-end gap-1 flex-shrink-0">
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        {isFutureDate ? (
                                                                            <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Agendado</span>
                                                                        ) : isPending ? (
                                                                            canMarkHabits ? (
                                                                                <>
                                                                                    <button onClick={() => rejectHabitCompletion(selectedChild.id, habit.id, viewedDate)} className="h-8 w-8 sm:h-8 sm:w-8 flex items-center justify-center text-red-500 hover:bg-red-100 rounded-lg transition-colors active:scale-95"><XCircleIcon className="w-4.5 h-4.5" /></button>
                                                                                    <button onClick={(event) => handleHabitCompleteAction(selectedChild.id, habit.id, habit.completions[viewedDate], event.currentTarget)} className="h-8 w-8 sm:h-8 sm:w-8 flex items-center justify-center text-green-500 hover:bg-green-100 rounded-lg transition-colors active:scale-95"><CheckCircleIcon className="w-4.5 h-4.5" /></button>
                                                                                </>
                                                                            ) : null
                                                                        ) : (
                                                                            <>
                                                                                {canMarkHabits && (
                                                                                    isCompleted && habit.source === "qrsaude" && habit.prescribedByProfessionalWhatsapp ? (
                                                                                        <a
                                                                                            href={`https://wa.me/55${habit.prescribedByProfessionalWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá Dr(a). ${habit.prescribedByProfessionalName || ""}, aqui está a comprovação da minha tarefa: ${habit.name}.`)}`}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            onClick={() => trackAdEvent(`qrsaude:${habit.id}`, "click", { slot: "habit_whatsapp_proof" })}
                                                                                            className="h-8 px-2 rounded-lg transition-all font-bold text-[9px] flex items-center justify-center bg-emerald-500 text-white active:scale-95"
                                                                                        >
                                                                                            WhatsApp
                                                                                        </a>
                                                                                    ) : (
                                                                                        <button onClick={(event) => handleHabitCompleteAction(selectedChild.id, habit.id, habit.completions[viewedDate], event.currentTarget)} className={`h-8 w-8 rounded-lg transition-all font-bold text-[9px] flex items-center justify-center active:scale-95 ${isCompleted ? 'bg-green-500 text-white' : 'bg-white text-gray-400 hover:text-purple-600 border border-gray-200 shadow-sm'}`}>{isCompleted ? <CheckCircleIcon className="w-4 h-4 text-white" /> : 'OK'}</button>
                                                                                    )
                                                                                )}
                                                                                {canWriteHabits && (
                                                                                    <button onClick={() => setConfirmingDelete({ childId: selectedChild.id, habitId: habit.id, habitName: habit.name, date: viewedDate })} className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {shouldInsertSupportMobile && supportProfessionalMobile && (
                                                            <div className="md:hidden col-span-full">
                                                                {renderServiceSpotlight(supportProfessionalMobile, { inline: true })}
                                                            </div>
                                                        )}
                                                        {shouldInsertSupportDesktopMd && supportProfessionalDesktopMd && (
                                                            <div className="hidden md:block xl:hidden col-span-2">
                                                                {renderServiceSpotlight(supportProfessionalDesktopMd, { inline: true })}
                                                            </div>
                                                        )}
                                                        {shouldInsertSupportDesktopXl && supportProfessionalDesktopXl && (
                                                            <div className="hidden xl:block col-span-3">
                                                                {renderServiceSpotlight(supportProfessionalDesktopXl, { inline: true })}
                                                            </div>
                                                        )}
                                                        {proChunk && (
                                                            <div className="col-span-full">
                                                                {renderProCarousel(proChunk, `inline-pro-${index}`)}
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                            {habitsForDate.length === 0 && heroExclusiveProfessional && (
                                                <div className="col-span-full">
                                                    {renderServiceSpotlight(heroExclusiveProfessional, { inline: true })}
                                                </div>
                                            )}
                                            {trailingProChunks.map((chunk, idx) => (
                                                <div className="col-span-full" key={`trailing-pro-${idx}`}>
                                                    {renderProCarousel(chunk, `trailing-pro-${idx}`)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto space-y-6">
                                    <div className="flex flex-col items-center justify-center text-center p-8">
                                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4"><UserCircleIcon className="w-12 h-12 text-gray-300" /></div>
                                        {!hasCompletedProfile ? (
                                            <>
                                                <h2 className="text-xl font-bold text-gray-700">Complete seu perfil para começar</h2>
                                                <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
                                                    Preencha primeiro seu estado e cidade no perfil. Com isso o app define os profissionais e recomendações da sua região.
                                                </p>
                                                <div className="mt-5">
                                                    <button
                                                        onClick={() => setProfileModalOpen(true)}
                                                        className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors"
                                                    >
                                                        Completar perfil
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <h2 className="text-xl font-bold text-gray-700">Tudo certo com seu perfil</h2>
                                                <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
                                                    Agora adicione sua primeira pessoa, rotina, tarefa ou evento para começar a organizar o dia.
                                                </p>
                                                <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:gap-3">
                                                    {canWriteChildren && !isAdmin && (
                                                        <button
                                                            onClick={handleOpenAddChildModal}
                                                            disabled={hasReachedFreemiumProfileLimit}
                                                            className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
                                                        >
                                                            Adicionar pessoa para iniciar
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setCurrentView('supportNetwork')}
                                                        className="px-4 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-50 transition-colors"
                                                    >
                                                        Ver rede de profissionais
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {heroExclusiveProfessional && (
                                        <div className="max-w-4xl mx-auto">
                                            {renderServiceSpotlight(heroExclusiveProfessional, { inline: true })}
                                        </div>
                                    )}
                                    {proCarouselChunks[0] && (
                                        <div className="max-w-4xl mx-auto">
                                            {renderProCarousel(proCarouselChunks[0], "onboarding-pro")}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
        }
    }

    const toastColors = {
        success: 'bg-gray-800',
        error: 'bg-red-600',
        warning: 'bg-yellow-500',
    }

    return (
        <div className="flex flex-col md:flex-row h-[100dvh] bg-gray-50 overflow-hidden">
            {toast && (<div className={`fixed bottom-5 left-1/2 -translate-x-1/2 ${toastColors[toast.type]} text-white text-sm font-bold py-2.5 px-5 rounded-full shadow-lg z-[200] animate-in fade-in slide-in-from-bottom`}>{toast.message}</div>)}
            
            {isMenuOpen && (<div className="fixed inset-0 bg-black/40 z-[60] md:hidden animate-in fade-in" onClick={() => setIsMenuOpen(false)} />)}
            <div className={`fixed inset-y-0 left-0 w-full max-w-[300px] bg-white shadow-2xl z-[70] transform transition-transform duration-300 md:hidden flex flex-col rounded-r-2xl ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}><SidebarActions /></div>

            {isAddChildModalOpen && <AddChildModal onClose={() => setAddChildModalOpen(false)} />}
            {editingChild && <EditChildModal child={editingChild} onClose={() => setEditingChild(null)} />}
            {isAddHabitModalOpen && <AddHabitModal 
                onClose={() => setAddHabitModalOpen(false)} 
                selectedChildId={selectedChildId} 
                viewedDate={viewedDate}
                importedTemplateIds={importedRoutineTemplateIds}
                onHabitAdded={handleHabitAdded}
                onHabitExists={() => showToast('Este hábito já existe para as pessoas selecionadas.', 'warning')}
                onNoChildSelected={() => showToast('Selecione pelo menos 1 pessoa.', 'error')}
                onImportNow={() => {
                    setAddHabitModalOpen(false);
                    setRoutineLibraryInitialArea("all");
                    setCurrentView("routineLibrary");
                }}
            />}
            {isManageRewardsModalOpen && <ManageRewardsModal onClose={() => setManageRewardsModalOpen(false)} />}
            {isProgressModalOpen && <ProgressDashboardModal onClose={() => setProgressModalOpen(false)} />}
            {isRewardShopOpen && selectedChild && <ParentRewardShopModal child={selectedChild} onClose={() => setRewardShopOpen(false)} />}
            {isProfileModalOpen && (
                <UserProfileModal
                    onClose={() => setProfileModalOpen(false)}
                    onEditSecondaryProfile={(childId) => {
                        const childToEdit = children.find((child) => child.id === childId);
                        if (!childToEdit) return;
                        setProfileModalOpen(false);
                        setEditingChild(childToEdit);
                    }}
                />
            )}
            {isManageMembersModalOpen && <ManageFamilyMembersModal onClose={() => setManageMembersModalOpen(false)} />}
            {isManageManagersModalOpen && <ManageManagersModal onClose={() => setManageManagersModalOpen(false)} />}
            {isAchievementShareOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[175] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">😄 Causar inveja</h3>
                            <button
                                type="button"
                                onClick={() => setAchievementShareOpen(false)}
                                className="text-sm font-semibold text-gray-500"
                            >
                                Fechar
                            </button>
                        </div>
                        <p className="text-sm text-gray-600">
                            Escolha como deseja compartilhar sua conquista de hoje.
                        </p>
                        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                            <p className="text-xs font-bold text-gray-600">Formato</p>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: "summary", label: "Resumo" },
                                    { key: "list", label: "Com lista" },
                                    { key: "full", label: "Completo" },
                                ].map((item) => (
                                    <button
                                        key={`share-mode-${item.key}`}
                                        type="button"
                                        onClick={() => setAchievementShareMode(item.key as AchievementShareMode)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                                            achievementShareMode === item.key
                                                ? "bg-purple-600 text-white border-purple-600"
                                                : "bg-white text-gray-600 border-gray-200"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                            <p className="text-xs font-bold text-gray-600">Privacidade</p>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={achievementShowName}
                                    onChange={(e) => setAchievementShowName(e.target.checked)}
                                />
                                Mostrar nome do perfil
                            </label>
                        </div>
                        <div className="rounded-lg bg-purple-50 border border-purple-100 p-3">
                            <p className="text-sm font-semibold text-purple-700">
                                Progresso: {dayProgress.done}/{dayProgress.total} ({dayProgress.percent}%)
                            </p>
                            <p className="text-xs text-purple-600 mt-1">
                                Tarefas concluídas: {completedHabitsForViewedDate.length}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => { void shareAchievementImage(); }}
                                disabled={isGeneratingAchievementAsset}
                                className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold disabled:opacity-60"
                            >
                                Compartilhar
                            </button>
                            <button
                                type="button"
                                onClick={() => { void shareAchievementOnWhatsApp(); }}
                                disabled={isGeneratingAchievementAsset}
                                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
                            >
                                WhatsApp
                            </button>
                            <button
                                type="button"
                                onClick={() => { void downloadAchievementImage(); }}
                                disabled={isGeneratingAchievementAsset}
                                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-bold disabled:opacity-60"
                            >
                                Baixar PNG
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {pendingLinkAction && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[170] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-5 space-y-3">
                        <h3 className="text-lg font-bold text-gray-800">Autorizar vínculo profissional</h3>
                        <p className="text-sm text-gray-600">
                            {pendingLinkAction.professionalName} deseja vincular você à lista de pacientes.
                        </p>
                        {pendingLinkAction.requestedConsentBlocks && (
                            <p className="text-xs text-gray-500">
                                Solicitação do profissional:{" "}
                                {[
                                    pendingLinkAction.requestedConsentBlocks.personal ? "Pessoais" : null,
                                    pendingLinkAction.requestedConsentBlocks.profile ? "Perfil/Rotina" : null,
                                    pendingLinkAction.requestedConsentBlocks.health ? "Saúde" : null,
                                ]
                                    .filter(Boolean)
                                    .join(", ") || "Sem blocos definidos"}
                            </p>
                        )}
                        {children.length > 0 && (
                            <div className="rounded-lg border border-gray-200 p-3">
                                <p className="text-xs font-bold text-gray-600 mb-2">Escolha 1 pessoa para vincular</p>
                                <p className="text-[11px] text-gray-500 mb-2">Para vincular outra pessoa, faça nova autorização.</p>
                                <div className="flex flex-wrap gap-2">
                                    {children.map((child) => {
                                        const isSelected = selectedSharedChildId === child.id;
                                        return (
                                            <button
                                                key={`share-${child.id}`}
                                                type="button"
                                                onClick={() => setSelectedSharedChildId(child.id)}
                                                className={`px-2 py-1 rounded-full text-xs font-semibold border ${
                                                    isSelected ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200"
                                                }`}
                                            >
                                                {child.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                            <p className="text-xs font-bold text-gray-600">Blocos autorizados</p>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={sharePersonalBlock} onChange={(e) => setSharePersonalBlock(e.target.checked)} />
                                Informações pessoais
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={shareProfileBlock} onChange={(e) => setShareProfileBlock(e.target.checked)} />
                                Perfil e rotina
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={shareHealthBlock} onChange={(e) => setShareHealthBlock(e.target.checked)} />
                                Saúde
                            </label>
                            <p className="text-[11px] text-gray-500 pt-1">Prazo inicial do vínculo: 21 dias (você pode estender em Gerenciar vínculos).</p>
                        </div>
                        {generatedLinkCode && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                <p className="text-xs font-bold text-emerald-700">Código temporário (10 min)</p>
                                <p className="text-3xl font-black tracking-[0.3em] text-emerald-800">{generatedLinkCode}</p>
                                <p className="text-xs text-emerald-700 mt-1">Tempo restante: <span className="font-bold">{generatedCodeCountdownLabel}</span></p>
                                <p className="text-xs text-emerald-700 mt-1">
                                    {generatedCodeSecondsRemaining > 0
                                        ? "Passe este código ao profissional para concluir a vinculação."
                                        : "Código expirado. Gere um novo código para continuar."}
                                </p>
                            </div>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => { void handleRejectProfessionalLink(); }}
                                disabled={isProcessingLinkAction}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold disabled:opacity-60"
                            >
                                Não autorizar
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleApproveProfessionalLink(); }}
                                disabled={isProcessingLinkAction}
                                className="flex-1 px-3 py-2 rounded-lg bg-purple-600 text-white font-semibold disabled:opacity-60"
                            >
                                {isProcessingLinkAction ? "Processando..." : "Autorizar e gerar código"}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPendingLinkAction(null)}
                            className="w-full text-xs font-semibold text-gray-500"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
            
            {canWriteHabits && confirmingDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4">
                    <div className="bg-white rounded-2xl p-6 text-center text-gray-800 shadow-lg max-w-sm w-full">
                        <h3 className="text-xl font-bold">Apagar Hábito</h3>
                        <p className="text-sm text-gray-600 mt-2">Você quer apagar o hábito <span className="font-bold text-purple-600">"{confirmingDelete.habitName}"</span>?</p>
                        <div className="flex flex-col gap-3 mt-6">
                            <button onClick={() => { skipHabitForDate(confirmingDelete.childId, confirmingDelete.habitId, confirmingDelete.date); setConfirmingDelete(null); }} className="px-5 py-3 bg-yellow-500 text-white rounded-xl font-bold hover:bg-yellow-600 active:scale-95 transition-transform">Apagar somente hoje</button>
                            <button onClick={() => { deleteHabit(confirmingDelete.childId, confirmingDelete.habitId); setConfirmingDelete(null); }} className="px-5 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 active:scale-95 transition-transform">Apagar para sempre</button>
                            <button onClick={() => setConfirmingDelete(null)} className="mt-2 py-2 text-gray-600 hover:text-black font-semibold">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

           <aside className="hidden md:flex w-72 bg-white border-r border-gray-100 flex-col flex-shrink-0 h-full min-h-0 relative z-20 pointer-events-auto overflow-y-auto overscroll-contain">
                <div className="p-4">
                    <h1 className="text-2xl font-bold text-purple-700">Habitus App</h1>
                </div>

                {!isAdmin && (
                <div className="border-t border-gray-100 p-4">

                    <div className={children.length > 3 ? "max-h-[210px] overflow-y-auto pr-1" : ""}>
                        <nav className="space-y-1">
                            {children.map(child => (
                                <div key={child.id} className="group relative flex items-center justify-between p-2 rounded-xl transition-colors hover:bg-gray-50">
                                    <button
                                        onClick={() => handleSelectChild(child)}
                                        className={`flex items-center gap-3 flex-1 text-left ${selectedChildId === child.id ? "font-bold text-purple-700" : "text-gray-600"}`}
                                    >
                                        <ChildAvatar
                                            avatar={child.avatar}
                                            alt={child.name}
                                            emojiClassName="text-3xl"
                                            imageClassName="w-9 h-9 rounded-full object-cover border border-gray-200"
                                        />
                                        <span className="truncate">{child.name}</span>
                                        {isPrincipalProfile(child.id) && (
                                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                                                #1
                                            </span>
                                        )}
                                    </button>

                                    {canWriteChildren && !String(child.id).startsWith("principal-") && (
                                        <button
                                            onClick={() => setEditingChild(child)}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-purple-600 transition-opacity"
                                        >
                                            <PencilIcon className="w-4 h-4" />
                                        </button>
                                    )}

                                    {selectedChildId === child.id && (
                                        <div className="absolute -left-4 top-2 bottom-2 w-1.5 bg-purple-600 rounded-r-full" />
                                    )}
                                </div>
                            ))}
                        </nav>
                    </div>

                    {canWriteChildren && !isAdmin && (
                        <button
                            type="button"
                            onClick={handleOpenAddChildModal}
                            disabled={hasReachedFreemiumProfileLimit}
                            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                            <PlusIcon className="w-5 h-5" />
                            Adicionar pessoa
                        </button>
                    )}
                </div>
                )}

                <div className="border-t border-gray-100 flex-1 overflow-y-auto">
                    <SidebarActions />
                </div>
            </aside>



            <main className="flex-1 flex flex-col h-full overflow-hidden bg-white min-h-0 relative z-10 pointer-events-auto">
               {children.length > 0 && currentView !== "dashboard" && currentView !== "supportNetwork" && currentView !== "routineLibrary" && !isAdminPanelView && (
                   <div className="md:hidden border-b border-gray-100 px-4 py-2">
                       <div className="relative">
                           <div className="flex items-center gap-2 overflow-x-auto pb-1">
                           {canWriteChildren && !isAdmin && (
                               <button
                                   type="button"
                                   onClick={handleOpenAddChildModal}
                                   disabled={hasReachedFreemiumProfileLimit}
                                   className="sticky left-0 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[11px] font-bold whitespace-nowrap shadow-sm disabled:opacity-50"
                                   aria-label="Adicionar pessoa"
                                   title="Adicionar pessoa"
                               >
                                   <UsersIcon className="w-4 h-4" />
                                   <PlusIcon className="w-3.5 h-3.5" />
                               </button>
                           )}
                           {children.map((child) => (
                               <button
                                   key={child.id}
                                   onClick={() => handleSelectChild(child)}
                                   className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${
                                       selectedChildId === child.id
                                           ? "bg-purple-600 text-white border-purple-600"
                                           : "bg-white text-gray-600 border-gray-200"
                                   }`}
                               >
                                   <ChildAvatar
                                       avatar={child.avatar}
                                       alt={child.name}
                                       emojiClassName="text-base"
                                       imageClassName="w-5 h-5 rounded-full object-cover border border-white/40"
                                   />
                                   <span className="max-w-[108px] truncate">{child.name}</span>
                                   {isPrincipalProfile(child.id) && (
                                       <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${selectedChildId === child.id ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
                                           #1
                                       </span>
                                   )}
                               </button>
                           ))}
                           </div>
                       </div>
                   </div>
               )}
               {renderCurrentView()}
               <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-30 px-2.5 pt-0.5 pb-[max(0.2rem,env(safe-area-inset-bottom))]">
                   <div className="grid grid-cols-5 items-end gap-1 text-[10px]">
                       <button type="button" onClick={() => setCurrentView("dashboard")} className={`flex flex-col items-center gap-0.5 ${currentView === "dashboard" ? "text-purple-700 font-bold" : "text-gray-600"}`}>
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12 12 3l9.75 9M4.5 10.5V21h15V10.5" />
                           </svg>
                           <span>Início</span>
                       </button>
                       <button type="button" onClick={() => setCurrentView("supportNetwork")} className={`flex flex-col items-center gap-0.5 ${currentView === "supportNetwork" ? "text-purple-700 font-bold" : "text-gray-600"}`}>
                           <UserIcon className="w-5 h-5" />
                           <span>Profissionais</span>
                       </button>
                       <button type="button" onClick={() => setCurrentView("dashboard")} className="flex flex-col items-center -mt-6">
                           <div className="h-[52px] w-[52px] rounded-full border-2 border-yellow-300 bg-gradient-to-b from-purple-700 to-purple-600 text-yellow-200 shadow-md flex flex-col items-center justify-center leading-none">
                               <span className="text-[10px] font-black">⭐ {selectedChild?.stars ?? 0}</span>
                               <span className="mt-1 text-[9px] font-black">💎 {selectedChildDiamonds}</span>
                           </div>
                       </button>
                       <button type="button" onClick={() => setCurrentView("recommendations")} className={`flex flex-col items-center gap-0.5 ${currentView === "recommendations" ? "text-purple-700 font-bold" : "text-gray-600"}`}>
                           <ShoppingBagIcon className="w-5 h-5" />
                           <span>Shop</span>
                       </button>
                       <button
                           type="button"
                           onClick={() => {
                               if (!selectedChild) {
                                   showToast("Selecione um perfil para adicionar hábito.", "warning");
                                   return;
                               }
                               setAddHabitModalOpen(true);
                           }}
                           className="flex flex-col items-center gap-0 rounded-lg px-1 py-0 text-purple-700"
                       >
                           <PlusIcon className="w-4 h-4" />
                           <span className="text-[9px] font-bold">+ Hábitos</span>
                       </button>
                   </div>
               </nav>
            </main>
        </div>
    );
};

export default ParentDashboard;







