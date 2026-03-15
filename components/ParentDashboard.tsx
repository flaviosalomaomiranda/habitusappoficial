import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { isAdminUser } from "../src/lib/admin";
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../src/lib/firebase";

import { signOut } from "firebase/auth";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';


import { Child, Habit, Professional } from '../types';
import { PlusIcon, UserCircleIcon, PencilIcon, ClipboardListIcon, StarsIcon, ChartBarIcon, TrashIcon, XCircleIcon, CheckCircleIcon, MenuIcon, UserIcon, GiftIcon, UsersIcon, MapPinIcon, HeartIcon, TvIcon, BellIcon } from './icons/MiscIcons';
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
import ChildAvatar from './ChildAvatar';
import { HABIT_ICONS, getHabitCategoryStyle } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { getTodayDateString, calculateAge, daysUntilNextBirthday } from '../utils/dateUtils';
import { inferSemanticTags } from '../utils/semanticTags';
import { pickContextualFooterAd } from '../utils/adMatching';

type DeletionInfo = {
    childId: string;
    habitId: string;
    habitName: string;
    date: string;
}

type ParentView = 'dashboard' | 'recommendations' | 'supportNetwork' | 'favorites' | 'adminTemplates' | 'adminSupportNetwork' | 'adminRecommendations' | 'adminSupportNetworkPricing' | 'adminMasterDefaults' | 'adminTagCatalog';

interface ParentDashboardProps {
    onEnterTvMode: () => void;
}

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
  const { familyId, settings, userProfile, supportNetworkDefaultMasters, children, deleteHabit, skipHabitForDate, getHabitsForChildOnDate, toggleHabitCompletion, rejectHabitCompletion, redeemedRewards, toggleRewardDelivery, getFavoriteProfessionals, toggleFavoriteProfessional, supportNetworkProfessionals, activeSupportNetworkProfessionals, productRecommendations, trackProfessionalEvent, trackAdEvent, isFamilyOwner, canManageMembers, canEditChildren, canEditHabits, canMarkHabits, isManager } = useAppContext();

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
    const [openQrScannerOnSupportNetwork, setOpenQrScannerOnSupportNetwork] = useState(false);
    const [incomingQrLink, setIncomingQrLink] = useState<string | null>(null);
    const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; readAt?: any; createdAt?: any }>>([]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    
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

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search || "");
        const qrToken = String(params.get("qrsaude") || "").trim();
        if (!qrToken) return;
        const fullQrLink = `${window.location.origin}/?qrsaude=${encodeURIComponent(qrToken)}`;
        setIncomingQrLink(fullQrLink);
        setCurrentView("supportNetwork");
        params.delete("qrsaude");
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, document.title, nextUrl);
    }, []);

    const unreadNotificationsCount = notifications.filter((item) => !item.readAt).length;
    const readNotificationsCount = notifications.filter((item) => !!item.readAt).length;
    const markNotificationAsRead = async (id: string) => {
        try {
            await setDoc(doc(db, "userNotifications", id), { readAt: serverTimestamp() }, { merge: true });
        } catch (err) {
            console.error("Falha ao marcar notificação como lida:", err);
        }
    };
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

    const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
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

    const getFormattedDateTitle = (dateStr: string) => {
        const todayStr = getTodayDateString();
        if (dateStr === todayStr) return "Hoje";
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    const getWeekdayName = (dateStr: string) => {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
    };

    const habitsForDate = selectedChild ? getHabitsForChildOnDate(selectedChild.id, viewedDate) : [];
    const isFutureDate = viewedDate > getTodayDateString();
    const isViewingToday = viewedDate === getTodayDateString();

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
            toggleHabitCompletion(selectedChild.id, habitId, viewedDate);
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
                        initialOpenQrScanner={openQrScannerOnSupportNetwork}
                        incomingQrLink={incomingQrLink}
                        onClose={() => {
                            setOpenQrScannerOnSupportNetwork(false);
                            setIncomingQrLink(null);
                            setCurrentView('dashboard');
                        }}
                    />
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
                        <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
                            <button onClick={() => setIsMenuOpen(true)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">
                                <MenuIcon />
                            </button>
                            <h1 className="font-bold text-purple-700">Habitus App</h1>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsNotificationsOpen((prev) => !prev)}
                                    className="relative p-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700"
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
                                    onClick={() => {
                                        setOpenQrScannerOnSupportNetwork(true);
                                        setCurrentView('supportNetwork');
                                    }}
                                    className="px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 text-[10px] font-bold text-purple-700"
                                    aria-label="Scan QRSaúde"
                                    title="Scan QRSaúde"
                                >
                                    Scan QRSaúde
                                </button>
                            </div>
                        </header>
                        {isNotificationsOpen && (
                            <div className="md:hidden bg-white border-b border-gray-100 px-4 py-2">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-[11px] font-semibold text-gray-500">
                                        {unreadNotificationsCount} não lida(s) • {readNotificationsCount} lida(s)
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => { void clearReadNotifications(); }}
                                        disabled={readNotificationsCount === 0}
                                        className="text-[11px] font-bold text-rose-700 disabled:text-gray-300"
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
                                                onClick={() => { void markNotificationAsRead(item.id); }}
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

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 pb-28 custom-scrollbar">
                            {masterProfessional && (
                                <>
                                    <div className="md:hidden sticky top-0 z-30 -mx-4 px-4 pt-1 pb-2 bg-gray-50/95 backdrop-blur-sm border-b border-gray-100">
                                        {renderMasterBanner()}
                                    </div>
                                    <div className="hidden md:block mb-2">
                                        {renderMasterBanner()}
                                    </div>
                                </>
                            )}
                            {children.length > 0 && (
                                <div className="md:hidden -mt-2 mb-3">
                                    <div className="relative">
                                        <div className="pointer-events-none absolute left-0 top-0 z-20 h-full w-8 bg-gradient-to-r from-white to-transparent" />
                                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                        {canWriteChildren && !isAdmin && (
                                            <button
                                                type="button"
                                                onClick={() => setAddChildModalOpen(true)}
                                                className="sticky left-0 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[11px] font-bold whitespace-nowrap shadow-sm"
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
                                                <span className="max-w-[90px] truncate">{child.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    </div>
                                </div>
                            )}
                            {selectedChild ? (
                                <div className="max-w-4xl mx-auto">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setCurrentView("dashboard")}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    setCurrentView("dashboard");
                                                }
                                            }}
                                            className="flex items-start sm:items-center gap-3 sm:gap-4 text-left cursor-pointer w-full min-w-0"
                                            aria-label="Voltar para o quadro de tarefas"
                                        >
                                            <div className="relative group">
                                                <ChildAvatar
                                                    avatar={selectedChild.avatar}
                                                    alt={selectedChild.name}
                                                    emojiClassName="text-4xl sm:text-6xl"
                                                    imageClassName="w-14 h-14 sm:w-20 sm:h-20 rounded-full object-cover border border-purple-100"
                                                />
                                                {canWriteChildren && (
                                                    <button onClick={(event) => { event.stopPropagation(); setEditingChild(selectedChild); }} className="absolute -bottom-1 -right-1 p-1.5 bg-white shadow-md rounded-full text-gray-400 hover:text-purple-600 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <h2 className="text-xl sm:text-3xl font-bold flex items-center gap-1.5 sm:gap-3 flex-wrap">
                                                    <span className="flex items-center gap-2 min-w-0">
                                                        <span className="truncate max-w-[180px] sm:max-w-none">{selectedChild.name}</span>
                                                    </span>
                                                    {selectedChild.birthDate && selectedChild.showAgeInfo && (
                                                        <span className="text-gray-400 text-base sm:text-lg font-medium">{calculateAge(selectedChild.birthDate)} anos</span>
                                                    )}
                                                    {renderBirthdayInfo(selectedChild)}
                                                </h2>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                                                    <div className="flex items-center gap-1.5 text-yellow-500 font-bold bg-yellow-50 px-2.5 py-1 rounded-full text-sm sm:text-base">
                                                        <StarIcon className="w-5 h-5" /> <span>{selectedChild.stars}</span>
                                                    </div>
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setRewardShopOpen(true);
                                                        }}
                                                        className="inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 transition-colors shadow-lg shadow-purple-500/20"
                                                        aria-label={`Abrir recompensas de ${selectedChild.name}`}
                                                        title="Recompensas"
                                                    >
                                                        <GiftIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                                            <h3 className="text-base sm:text-lg font-semibold">
                                                {isViewingToday ? "Rotinas de Hoje" : `Rotinas de ${getFormattedDateTitle(viewedDate)}`} ({getWeekdayName(viewedDate)})
                                            </h3>
                                            <div className="w-full sm:w-auto flex items-center gap-2 sm:gap-3">
                                                <input type="date" value={viewedDate} onChange={(e) => setViewedDate(e.target.value)} className="w-full sm:w-auto text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-10" />
                                                {canWriteHabits && (
                                                    <button onClick={() => setAddHabitModalOpen(true)} className="flex-shrink-0 flex items-center justify-center gap-2 h-10 w-10 sm:w-auto sm:px-4 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all active:scale-95" aria-label="Adicionar novo hábito">
                                                        <PlusIcon className="w-5 h-5" />
                                                        <span className="hidden sm:inline text-sm font-bold">Hábito</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
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
                                                                className={`grid grid-cols-[auto,1fr,auto] items-center gap-2.5 p-2.5 sm:p-2 rounded-xl border ${canSwipeToAction ? "min-h-[92px]" : ""} transition-transform ${canHandleSwipe ? "" : "transition-all"} ${bgColor} ${qrSaudeBorderClass}`}
                                                                style={canHandleSwipe ? { transform: `translateX(${swipeOffset}px)` } : undefined}
                                                                onTouchStart={canHandleSwipe ? (event) => beginHabitSwipe(habit.id, event) : undefined}
                                                                onTouchMove={canHandleSwipe ? moveHabitSwipe : undefined}
                                                                onTouchEnd={canHandleSwipe ? () => endHabitSwipe(habit.id) : undefined}
                                                                onTouchCancel={canHandleSwipe ? () => endHabitSwipe(habit.id) : undefined}
                                                            >
                                                                <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 ${iconClasses}`}>
                                                                    {habit.imageUrl ? (
                                                                        <img src={habit.imageUrl} alt={habit.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span className={`text-[13px] sm:text-sm font-bold block leading-tight break-words line-clamp-2 ${isCompleted ? 'text-green-800' : 'text-gray-800'}`}>{habit.name}</span>
                                                                    <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${scheduleMeta.className}`}>
                                                                        {scheduleMeta.label}
                                                                    </span>
                                                                    {isQrSaude && (
                                                                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-amber-700 font-semibold">
                                                                            {habit.prescribedByProfessionalPhotoUrl ? (
                                                                                <img src={habit.prescribedByProfessionalPhotoUrl} alt={habit.prescribedByProfessionalName || "Profissional"} className="w-4 h-4 rounded-full object-cover border border-amber-300" />
                                                                            ) : null}
                                                                            <span>QRSaude • {habit.prescribedByProfessionalName || "Profissional"}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="mt-0.5 flex items-start gap-1 text-[10px] sm:text-[11px] text-gray-500 min-w-0">
                                                                        <span className={`${rewardClass} font-bold flex items-center gap-0.5 shrink-0`}>
                                                                            {habit.reward.type === 'STARS' ? `+${habit.reward.value}` : habit.reward.activityName}
                                                                            {habit.reward.type === 'STARS' && <StarIcon className="w-3.5 h-3.5" />}
                                                                        </span>
                                                                        {habit.sponsorNote && (
                                                                            <span className="text-[9px] sm:text-[10px] leading-tight text-gray-500 line-clamp-2 break-words min-w-0">
                                                                                {habit.sponsorNote}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="ml-1 sm:ml-2 w-[72px] sm:w-[84px] flex flex-col items-end gap-1 flex-shrink-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        {isFutureDate ? (
                                                                            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">Agendado</span>
                                                                        ) : isPending ? (
                                                                            canMarkHabits ? (
                                                                                <>
                                                                                    <button onClick={() => rejectHabitCompletion(selectedChild.id, habit.id, viewedDate)} className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-red-500 hover:bg-red-100 rounded-xl transition-colors active:scale-95"><XCircleIcon className="w-5 h-5" /></button>
                                                                                    <button onClick={() => toggleHabitCompletion(selectedChild.id, habit.id, viewedDate)} className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-green-500 hover:bg-green-100 rounded-xl transition-colors active:scale-95"><CheckCircleIcon className="w-5 h-5" /></button>
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
                                                                                            className="h-9 px-2 sm:h-8 rounded-lg transition-all font-bold text-[10px] flex items-center justify-center bg-emerald-500 text-white active:scale-95"
                                                                                        >
                                                                                            WhatsApp
                                                                                        </a>
                                                                                    ) : (
                                                                                        <button onClick={() => toggleHabitCompletion(selectedChild.id, habit.id, viewedDate)} className={`h-10 w-10 sm:h-9 sm:w-9 rounded-lg transition-all font-bold text-[10px] flex items-center justify-center active:scale-95 ${isCompleted ? 'bg-green-500 text-white' : 'bg-white text-gray-400 hover:text-purple-600 border border-gray-200 shadow-sm'}`}>{isCompleted ? <CheckCircleIcon className="w-4 h-4 text-white" /> : 'OK'}</button>
                                                                                    )
                                                                                )}
                                                                                {canWriteHabits && (
                                                                                    <button onClick={() => setConfirmingDelete({ childId: selectedChild.id, habitId: habit.id, habitName: habit.name, date: viewedDate })} className="h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"><TrashIcon className="w-4 h-4" /></button>
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
                                            {habitsForDate.length === 0 && (
                                                <div className="text-center py-10">
                                                    <p className="text-gray-500 text-sm">Nenhum hábito para esta data.</p>
                                                    {canWriteHabits && (
                                                        <button onClick={() => setAddHabitModalOpen(true)} className="mt-2 text-purple-600 font-bold text-sm">+ Adicionar um hábito</button>
                                                    )}
                                                </div>
                                            )}
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
                                                            onClick={() => setAddChildModalOpen(true)}
                                                            className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors"
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
                        {selectedChild && (
                            <div className="md:hidden fixed bottom-0 inset-x-0 p-3 bg-white/90 backdrop-blur-sm border-t border-gray-100 z-30">
                                {contextualFooterAd ? (
                                    <a
                                        href={contextualFooterAd.linkUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => trackAdEvent(`footer:${contextualFooterAd.id}`, "click", { slot: "contextual_footer_mobile" })}
                                        className="relative flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5"
                                    >
                                        {contextualFooterAd.imageUrl ? (
                                            <img src={contextualFooterAd.imageUrl} alt={contextualFooterAd.title} className="w-10 h-10 rounded-lg object-cover border border-purple-200" />
                                        ) : (
                                            <GiftIcon className="w-5 h-5 text-purple-600" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                {contextualFooterAd.category ? (
                                                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${getRecommendationCategoryClassName(contextualFooterAd.category)}`}>
                                                        {contextualFooterAd.category}
                                                    </span>
                                                ) : <span />}
                                                {contextualFooterAd.badgeActive && contextualFooterAd.badgeText && (
                                                    <span className={`shrink-0 max-w-[112px] px-2 py-0.5 rounded-md text-[8px] leading-tight font-black uppercase tracking-tight whitespace-normal break-words text-center line-clamp-1 ${getRecommendationBadgeClassName(contextualFooterAd.badgeType)}`}>
                                                        {contextualFooterAd.badgeText}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[12px] font-bold text-purple-800 line-clamp-1 leading-tight">{contextualFooterAd.title}</p>
                                            <p className="text-[11px] text-purple-600 line-clamp-2 leading-snug">{contextualFooterAd.description || "Oferta contextual para você"}</p>
                                        </div>
                                    </a>
                                ) : (
                                    <AdSlot placement="MOBILE_BANNER" />
                                )}
                            </div>
                        )}
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
                onHabitAdded={handleHabitAdded}
                onHabitExists={() => showToast('Este hábito já existe para as pessoas selecionadas.', 'warning')}
                onNoChildSelected={() => showToast('Selecione pelo menos 1 pessoa.', 'error')}
            />}
            {isManageRewardsModalOpen && <ManageRewardsModal onClose={() => setManageRewardsModalOpen(false)} />}
            {isProgressModalOpen && <ProgressDashboardModal onClose={() => setProgressModalOpen(false)} />}
            {isRewardShopOpen && selectedChild && <ParentRewardShopModal child={selectedChild} onClose={() => setRewardShopOpen(false)} />}
            {isProfileModalOpen && <UserProfileModal onClose={() => setProfileModalOpen(false)} />}
            {isManageMembersModalOpen && <ManageFamilyMembersModal onClose={() => setManageMembersModalOpen(false)} />}
            {isManageManagersModalOpen && <ManageManagersModal onClose={() => setManageManagersModalOpen(false)} />}
            
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
                                    </button>

                                    {canWriteChildren && (
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
                            onClick={() => setAddChildModalOpen(true)}
                            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 text-sm font-semibold transition-colors"
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
               {children.length > 0 && currentView !== "dashboard" && !isAdminPanelView && (
                   <div className="md:hidden border-b border-gray-100 px-4 py-2">
                       <div className="relative">
                           <div className="pointer-events-none absolute left-0 top-0 z-20 h-full w-8 bg-gradient-to-r from-white to-transparent" />
                           <div className="flex items-center gap-2 overflow-x-auto pb-1">
                           {canWriteChildren && !isAdmin && (
                               <button
                                   type="button"
                                   onClick={() => setAddChildModalOpen(true)}
                                   className="sticky left-0 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[11px] font-bold whitespace-nowrap shadow-sm"
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
                               </button>
                           ))}
                           </div>
                       </div>
                   </div>
               )}
               {renderCurrentView()}
            </main>
        </div>
    );
};

export default ParentDashboard;







