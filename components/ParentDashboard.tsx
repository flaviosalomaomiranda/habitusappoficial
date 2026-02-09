import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { isAdminUser } from "../src/lib/admin";

import { signOut } from "firebase/auth";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';


import { Child, Professional } from '../types';
import { PlusIcon, UserCircleIcon, PencilIcon, ClipboardListIcon, StarsIcon, ChartBarIcon, ShoppingBagIcon, TrashIcon, XCircleIcon, CheckCircleIcon, MenuIcon, UserIcon, GiftIcon, UsersIcon, MapPinIcon, HeartIcon } from './icons/MiscIcons';
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
import ManageRecommendationsModal from './ManageRecommendationsModal';
import UserProfileModal from './UserProfileModal';
import ManageFamilyMembersModal from './ManageFamilyMembersModal';
import ManageManagersModal from './ManageManagersModal';
import { HABIT_ICONS, getHabitCategoryStyle } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { getTodayDateString, formatSchedule, calculateAge, daysUntilNextBirthday } from '../utils/dateUtils';

type DeletionInfo = {
    childId: string;
    habitId: string;
    habitName: string;
    date: string;
}

type ParentView = 'dashboard' | 'recommendations' | 'supportNetwork' | 'adminSupportNetwork' | 'adminRecommendations' | 'adminSupportNetworkPricing';

interface ParentDashboardProps {
    onEnterChildMode: (child: Child) => void;
}

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
    const text = encodeURIComponent(message);
    return `https://wa.me/55${cleaned}?text=${text}`;
};

// Card para profissionais Master ou Exclusivo na Home (Versão Fixa e Compacta)
const SupportSpotlightCard: React.FC<{ 
    prof: Professional, 
    type: 'master' | 'exclusive', 
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
                                className="flex-1 min-w-[120px] text-center font-bold text-xs sm:text-sm py-2 rounded-lg bg-pink-500/80 text-white hover:bg-pink-500"
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
                type === 'master' ? 'bg-gradient-to-r from-purple-600 to-indigo-700 text-white border-indigo-400' : 'bg-white border-amber-200'
            }`}
        >
            {/* Badge de Nível */}
            <div className={`absolute top-0 right-0 px-2 py-0.5 text-[8px] font-black uppercase tracking-tight rounded-bl-lg ${
                type === 'master' ? 'bg-yellow-400 text-purple-900' : 'bg-amber-100 text-amber-800'
            }`}>
                {type === 'master' ? 'MASTER' : 'EXCLUSIVO'}
            </div>
            
            <div className="flex gap-3 items-center">
                <img 
                    src={prof.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.name)}&background=random`}
                    alt={prof.name}
                    className={`object-cover rounded-full border border-white/20 shadow-sm transition-all ${isCollapsed ? 'w-10 h-10' : 'w-14 h-14'}`}
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h4 className={`font-bold truncate ${isCollapsed ? 'text-sm' : 'text-base'} ${type === 'master' ? 'text-white' : 'text-gray-800'}`}>
                            {prof.name}
                        </h4>
                        <span className={`text-[10px] opacity-70 truncate`}>• {getSpecialtiesLabel(prof)}</span>
                    </div>
                    <p className={`text-[9px] flex items-center gap-1 ${type === 'master' ? 'text-purple-200' : 'text-gray-400'}`}>
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
                        <p className={`text-xs italic mb-3 px-2 py-1.5 rounded-lg ${type === 'master' ? 'bg-white/10 text-purple-50' : 'bg-gray-50 text-gray-600'}`}>
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
                                    type === 'master' ? 'bg-yellow-400 text-purple-900 hover:bg-yellow-300' : 'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                            >
                                Agendar consulta
                            </a>
                        )}
                        
                        {prof.videoUrl && (
                            <a href={prof.videoUrl} target="_blank" rel="noopener noreferrer" className={`px-3 flex items-center justify-center rounded-lg border ${
                                type === 'master' ? 'border-white/30 text-white hover:bg-white/10' : 'border-red-100 bg-red-50 text-red-600'
                            }`}>
                               <span className="text-[9px] font-bold uppercase">Vídeos</span>
                            </a>
                        )}
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
                            Agendar consulta
                        </a>
                    )}
                    <button onClick={onOpenNetwork} className={`px-2 py-1 text-[10px] font-bold rounded-md border ${type === 'master' ? 'border-white/30 text-white' : 'border-gray-200 text-gray-500'}`}>
                        Ver Rede
                    </button>
                </div>
            )}
        </div>
    );
};

// Card compacto para profissionais favoritados
const SupportFavoriteTopCard: React.FC<{ prof: Professional; onToggleFavorite: (id: string) => void }> = ({ prof, onToggleFavorite }) => (
    <div className="bg-gradient-to-br from-amber-50 to-white p-3 rounded-xl border border-amber-300 shadow-sm space-y-2 relative h-full flex flex-col min-h-[200px] sm:min-h-[220px]">
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
            <p className="text-xs text-gray-700 bg-amber-100/60 rounded-md px-2 py-1 line-clamp-2">
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
                            className="w-12 h-9 sm:w-14 sm:h-10 rounded-lg object-cover border border-amber-200 flex-shrink-0"
                        />
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    {prof.galleryUrls.slice(0, 4).map((_, idx) => (
                        <span
                            key={`${prof.id}-top-dot-${idx}`}
                            className={`h-1.5 w-1.5 rounded-full ${idx === 0 ? 'bg-amber-500' : 'bg-amber-200'}`}
                        />
                    ))}
                </div>
            </div>
        )}

        {prof.highlights && prof.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
                {prof.highlights.slice(0, 3).map((item, idx) => (
                    <span key={`${prof.id}-top-h-${idx}`} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {item}
                    </span>
                ))}
            </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                <a
                    href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-purple-600 text-white font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                >
                    Agendar consulta
                </a>
            )}
            {prof.contacts.phone && (
                <a
                    href={`tel:${prof.contacts.phone}`}
                    className="flex-1 text-center bg-blue-100 text-blue-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-blue-200 transition-colors whitespace-nowrap"
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

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {(prof.contacts.bookingUrl || prof.contacts.whatsapp) && (
                <a
                    href={prof.contacts.bookingUrl || buildWhatsAppLink(prof.contacts.whatsapp || "", buildBookingMessage(prof))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-green-100 text-green-800 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-green-200 whitespace-nowrap"
                >
                    Agendar consulta
                </a>
            )}
            {prof.contacts.phone && (
                <a
                    href={`tel:${prof.contacts.phone}`}
                    className="flex-1 text-center bg-blue-100 text-blue-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-blue-200 transition-colors whitespace-nowrap"
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


const ParentDashboard: React.FC<ParentDashboardProps> = ({ onEnterChildMode }) => {
  const { settings, children, deleteHabit, skipHabitForDate, getHabitsForChildOnDate, toggleHabitCompletion, rejectHabitCompletion, redeemedRewards, toggleRewardDelivery, getFavoriteProfessionals, toggleFavoriteProfessional, supportNetworkProfessionals, activeSupportNetworkProfessionals, isFamilyOwner, canManageMembers, canEditChildren, canEditHabits, canMarkHabits, isManager } = useAppContext();

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUserEmail(user?.email ?? null);
    });
    return () => unsub();
  }, []);

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


    // Estado de Colapso do Spotlight Premium
    const [isPremiumCollapsed, setIsPremiumCollapsed] = useState(() => {
        const saved = localStorage.getItem('premiumSpotlightCollapsed');
        return saved === null ? true : JSON.parse(saved);
    });

    useEffect(() => {
        localStorage.setItem('premiumSpotlightCollapsed', JSON.stringify(isPremiumCollapsed));
    }, [isPremiumCollapsed]);

    const todayStr = getTodayDateString();

    // Filtros de Cidade Atual da Família (REATIVO)
    const familyLocation = settings.familyLocation;

    const completedHabitNamesToday = useMemo(() => {
        if (children.length === 0) return [];
        const names: string[] = [];
        children.forEach((child) => {
            const habits = getHabitsForChildOnDate(child.id, todayStr);
            habits.forEach((habit) => {
                if (habit.completions[todayStr] === "COMPLETED") {
                    names.push(habit.name.toLowerCase());
                }
            });
        });
        return names;
    }, [children, getHabitsForChildOnDate, todayStr]);
    
    const masterProfessional = useMemo(() => {
        if (!familyLocation?.cityId) return null;
        return activeSupportNetworkProfessionals.find(p => p.tier === 'master' && p.cityId === familyLocation.cityId);
    }, [activeSupportNetworkProfessionals, familyLocation]);

    const spotlightStorageKey = familyLocation?.cityId
        ? `exclusiveSpotlight:${familyLocation.cityId}`
        : "exclusiveSpotlight:global";

    const getExclusiveSpotlightCounts = () => {
        if (typeof window === "undefined") return { date: todayStr, counts: {} as Record<string, number> };
        try {
            const raw = localStorage.getItem(spotlightStorageKey);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || parsed.date !== todayStr) {
                return { date: todayStr, counts: {} as Record<string, number> };
            }
            return parsed as { date: string; counts: Record<string, number> };
        } catch {
            return { date: todayStr, counts: {} as Record<string, number> };
        }
    };

    const getExclusiveSpotlightCount = (professionalId: string) => {
        const data = getExclusiveSpotlightCounts();
        return data.counts[professionalId] || 0;
    };

    const incrementExclusiveSpotlightCount = (professionalId: string) => {
        if (typeof window === "undefined") return;
        const data = getExclusiveSpotlightCounts();
        data.counts[professionalId] = (data.counts[professionalId] || 0) + 1;
        localStorage.setItem(spotlightStorageKey, JSON.stringify({ date: todayStr, counts: data.counts }));
    };

    const rotatingPremiumSpotlight = useMemo(() => {
        if (!familyLocation?.cityId) return null;
        const exclusives = activeSupportNetworkProfessionals
            .filter(p => p.tier === 'exclusive' && p.cityId === familyLocation.cityId)
            .sort((a, b) => (a.tierJoinedAt || '').localeCompare(b.tierJoinedAt || ''));

        const eligibleExclusives = exclusives.filter((professional) => {
            const keywords = professional.spotlightKeywords || [];
            if (keywords.length === 0) return false;
            const hasMatch = completedHabitNamesToday.some((name) =>
                keywords.some((kw) => name.includes(kw.toLowerCase()))
            );
            if (!hasMatch) return false;
            const limit = professional.spotlightDailyLimit ?? 2;
            return getExclusiveSpotlightCount(professional.id) < limit;
        });
        
        if (eligibleExclusives.length === 0) return null;
        if (eligibleExclusives.length === 1) return eligibleExclusives[0];

        const today = new Date();
        const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        const anchorDateStr = eligibleExclusives[0].tierJoinedAt || '2024-01-01T00:00:00Z';
        const anchorDate = new Date(anchorDateStr);
        const anchorUTC = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate());
        
        const diffDays = Math.floor((todayUTC - anchorUTC) / 86400000);
        const index = Math.max(0, diffDays) % eligibleExclusives.length;
        
        return eligibleExclusives[index];
    }, [activeSupportNetworkProfessionals, completedHabitNamesToday, familyLocation, todayStr, spotlightStorageKey]);

    useEffect(() => {
        if (!rotatingPremiumSpotlight) return;
        const key = `${todayStr}:${rotatingPremiumSpotlight.id}`;
        if (exclusiveSpotlightRef.current === key) return;
        exclusiveSpotlightRef.current = key;
        incrementExclusiveSpotlightCount(rotatingPremiumSpotlight.id);
    }, [rotatingPremiumSpotlight, todayStr]);

    const favoriteProfessionals = getFavoriteProfessionals();

    const topFavorites = useMemo(() =>
        favoriteProfessionals
            .filter(p => p.tier === 'top')
            .sort((a, b) => a.name.localeCompare(b.name)),
        [favoriteProfessionals]
    );

    const verifiedFavorites = useMemo(() =>
        favoriteProfessionals
            .filter(p => p.tier === 'verified' && p.verified)
            .sort((a, b) => a.name.localeCompare(b.name)),
        [favoriteProfessionals]
    );
    
    const [currentView, setCurrentView] = useState<ParentView>('dashboard');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAddChildModalOpen, setAddChildModalOpen] = useState(false);
    const [editingChild, setEditingChild] = useState<Child | null>(null);
    const [isAddHabitModalOpen, setAddHabitModalOpen] = useState(false);
    const [isManageTemplatesModalOpen, setManageTemplatesModalOpen] = useState(false);
    const [isManageRewardsModalOpen, setManageRewardsModalOpen] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState<DeletionInfo | null>(null);
    
    const [isProgressModalOpen, setProgressModalOpen] = useState(false);
    const [isRewardShopOpen, setRewardShopOpen] = useState(false);
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    const [isManageMembersModalOpen, setManageMembersModalOpen] = useState(false);
    const [isManageManagersModalOpen, setManageManagersModalOpen] = useState(false);
    
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);
    
    const [viewedDate, setViewedDate] = useState(getTodayDateString());
    const exclusiveSpotlightRef = useRef<string | null>(null);
    
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
            return <div className="text-xs mt-1 px-2.5 py-1 bg-pink-100 text-pink-700 rounded-full font-bold">🎉 Aniversário Hoje! ({age+1} anos)</div>
        }
        return <div className="text-[10px] mt-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">🎂 {daysUntil} dias para {age+1} anos</div>
    }

    const getFormattedDateTitle = (dateStr: string) => {
        const todayStr = getTodayDateString();
        if (dateStr === todayStr) return "Hoje";
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    const habitsForDate = selectedChild ? getHabitsForChildOnDate(selectedChild.id, viewedDate) : [];
    const isFutureDate = viewedDate > getTodayDateString();
    
    const childRedeemedRewards = useMemo(() => {
        if (!selectedChildId) return [];
        return redeemedRewards
            .filter(r => r.childId === selectedChildId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 3);
    }, [redeemedRewards, selectedChildId]);

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

    const renderSpotlightSection = () => {
        if (!rotatingPremiumSpotlight) return null;
        return (
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <div className="grid grid-cols-1 gap-4">
                    <SupportSpotlightCard
                        prof={rotatingPremiumSpotlight}
                        type="exclusive"
                        onOpenNetwork={() => setCurrentView('supportNetwork')}
                        isCollapsed={isPremiumCollapsed}
                        onToggle={() => setIsPremiumCollapsed((prev) => !prev)}
                    />
                </div>
            </div>
        );
    };

    const renderFavoritesSection = () => (
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Rede de Apoio - Favoritos</h3>
                <button onClick={() => setCurrentView('supportNetwork')} className="text-purple-600 font-bold text-xs">Ver Rede de Apoio &rarr;</button>
            </div>
            {favoriteProfessionals.length > 0 ? (
                <div className="space-y-4">
                    {topFavorites.length > 0 && (
                        <section>
                            <h4 className="font-bold text-amber-600 text-sm mb-2">⭐ TOP Favoritos</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {topFavorites.slice(0, 2).map(prof => (
                                                                <SupportFavoriteTopCard key={prof.id} prof={prof} onToggleFavorite={toggleFavoriteProfessional} />
                                                            ))}
                            </div>
                        </section>
                    )}
                    {verifiedFavorites.length > 0 && (
                        <section>
                            <h4 className="font-bold text-green-700 text-sm mb-2">✅ Registro verificado</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {verifiedFavorites.slice(0, 2).map(prof => (
                                                                <SupportFavoriteVerifiedCard key={prof.id} prof={prof} onToggleFavorite={toggleFavoriteProfessional} />
                                                            ))}
                            </div>
                        </section>
                    )}
                </div>
            ) : (
                <div className="text-center py-6">
                    <p className="text-gray-500 text-sm">Nenhum profissional favorito ainda.</p>
                    <button onClick={() => setCurrentView('supportNetwork')} className="mt-2 text-purple-600 font-bold text-xs">Encontre e favorite profissionais &rarr;</button>
                </div>
            )}
        </div>
    );

    const SidebarActions = () => (
        <div className="flex flex-col h-full">
            <div className="p-4">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Acoes Gerais</h2>
                <p className="text-sm text-gray-500">Gerencie pessoas, habitos e Rede de Apoio.</p>
            </div>
                <div className="flex-grow overflow-y-auto px-4 space-y-2 pb-4">
                    {isAdmin && (
                        <div className="mb-2">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Administração</div>
                            <button
                                onClick={() => { setCurrentView('adminSupportNetwork'); setIsMenuOpen(false); }}
                                className="w-full flex items-center gap-4 p-3 bg-amber-50 text-amber-800 rounded-xl hover:bg-amber-100 transition-colors font-semibold text-sm"
                            >
                                <UsersIcon className="w-5 h-5 text-amber-500" />
                                Adicionar Profissional
                            </button>
                            <button
                                onClick={() => { setManageManagersModalOpen(true); setIsMenuOpen(false); }}
                                className="mt-2 w-full flex items-center gap-4 p-3 bg-amber-50 text-amber-800 rounded-xl hover:bg-amber-100 transition-colors font-semibold text-sm"
                            >
                                <UsersIcon className="w-5 h-5 text-amber-500" />
                                Adicionar Gerente
                            </button>
                            <button
                                onClick={() => { setCurrentView('adminSupportNetworkPricing'); setIsMenuOpen(false); }}
                                className="mt-2 w-full flex items-center gap-4 p-3 bg-amber-50 text-amber-800 rounded-xl hover:bg-amber-100 transition-colors font-semibold text-sm"
                            >
                                <ClipboardListIcon className="w-5 h-5 text-amber-500" />
                                Precificação de Planos
                            </button>
                            <button
                                onClick={() => { setCurrentView('adminRecommendations'); setIsMenuOpen(false); }}
                                className="mt-2 w-full flex items-center gap-4 p-3 bg-amber-50 text-amber-800 rounded-xl hover:bg-amber-100 transition-colors font-semibold text-sm"
                            >
                                <GiftIcon className="w-5 h-5 text-amber-500" />
                                Gerenciar Shopping
                            </button>
                            <hr className="my-3" />
                        </div>
                    )}
                {canWriteChildren && !isAdmin && (
                    <button onClick={() => { setAddChildModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all font-semibold text-sm">
                        <PlusIcon className="w-5 h-5" /> Adicionar pessoa
                    </button>
                )}
                <button onClick={() => { setManageTemplatesModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><ClipboardListIcon className="w-5 h-5 text-gray-500" /> Modelos de Rotina</button>
                <button onClick={() => { setProgressModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><ChartBarIcon className="w-5 h-5 text-gray-500" /> Quadro de Progresso</button>
                <button onClick={() => { setManageRewardsModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><StarsIcon className="w-5 h-5 text-gray-500" /> Gerenciar Recompensas</button>
                {canManageMembers && (
                    <button onClick={() => { setManageMembersModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><UserIcon className="w-5 h-5 text-gray-500" /> Gerenciar Membros</button>
                )}
                <hr className="my-2"/>
                <button onClick={() => { setCurrentView('recommendations'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><GiftIcon className="w-5 h-5 text-gray-500" /> Shopping</button>
                <button onClick={() => { setCurrentView('supportNetwork'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"><UsersIcon className="w-5 h-5 text-gray-500" /> Rede de Apoio</button>
                {isManager && !isAdmin && (
                    <div className="pt-2 mt-2 border-t">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Gerente</div>
                        <button onClick={() => { setCurrentView('adminSupportNetwork'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 p-3 bg-amber-50 text-amber-800 rounded-xl hover:bg-amber-100 transition-colors font-semibold text-sm"><UsersIcon className="w-5 h-5 text-amber-500" /> Inserir Profissionais</button>
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
                <AdSlot placement="SIDEBAR" />
            </div>
        </div>
    );

    const renderCurrentView = () => {
        switch (currentView) {
            case 'recommendations':
                return <ProductsRecommendations onClose={() => setCurrentView('dashboard')} />;
            case 'supportNetwork':
                return <SupportNetworkPage onClose={() => setCurrentView('dashboard')} />;
            case "adminSupportNetwork":
                if (!isAdmin && !isManager) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageSupportNetworkModal onClose={() => setCurrentView("dashboard")} />;
            case "adminRecommendations":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageRecommendationsModal onClose={() => setCurrentView("dashboard")} />;
            case "adminSupportNetworkPricing":
                if (!isAdmin) return <div className="p-6 text-sm text-gray-500">Sem permissão.</div>;
                return <ManageSupportNetworkPricingModal onClose={() => setCurrentView("dashboard")} />;
            case 'dashboard':
            default:
                return (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
                            <button onClick={() => setIsMenuOpen(true)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">
                                <MenuIcon />
                            </button>
                            <h1 className="font-bold text-purple-700">Habitus App</h1>
                            <div className="w-8" />
                        </header>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 pb-28 custom-scrollbar">
                            {masterProfessional && (
                                <div className="mb-2">
                                    {renderMasterBanner()}
                                </div>
                            )}
                            {children.length > 0 && (
                                <div className="md:hidden -mt-2 mb-3">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                        {children.map((child) => (
                                            <button
                                                key={child.id}
                                                onClick={() => handleSelectChild(child)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap ${
                                                    selectedChildId === child.id
                                                        ? "bg-purple-600 text-white border-purple-600"
                                                        : "bg-white text-gray-600 border-gray-200"
                                                }`}
                                            >
                                                <span>{child.avatar}</span>
                                                <span className="max-w-[120px] truncate">{child.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedChild ? (
                                <div className="max-w-4xl mx-auto">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setCurrentView("dashboard")}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    setCurrentView("dashboard");
                                                }
                                            }}
                                            className="flex items-center gap-4 text-left cursor-pointer"
                                            aria-label="Voltar para o quadro de tarefas"
                                        >
                                            <div className="relative group">
                                                <span className="text-5xl sm:text-6xl">{selectedChild.avatar}</span>
                                                {canWriteChildren && (
                                                    <button onClick={(event) => { event.stopPropagation(); setEditingChild(selectedChild); }} className="absolute -bottom-1 -right-1 p-1.5 bg-white shadow-md rounded-full text-gray-400 hover:text-purple-600 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <div>
                                                <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                                                    <span className="flex items-center gap-2">
                                                        {selectedChild.name}
                                                        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7 7-7M3 12h18" />
                                                            </svg>
                                                            Quadro
                                                        </span>
                                                    </span>
                                                    {selectedChild.birthDate && selectedChild.showAgeInfo && (
                                                        <span className="text-gray-400 text-lg font-medium">{calculateAge(selectedChild.birthDate)} anos</span>
                                                    )}
                                                </h2>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-1.5 text-yellow-500 font-bold bg-yellow-50 px-3 py-1 rounded-full">
                                                        <StarIcon className="w-5 h-5" /> <span>{selectedChild.stars}</span>
                                                    </div>
                                                    {renderBirthdayInfo(selectedChild)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 w-full sm:w-auto gap-3">
                                            <button onClick={() => onEnterChildMode(selectedChild)} className="h-12 flex-1 sm:flex-none bg-blue-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-600 transition-all text-sm active:scale-95">
                                                <UserIcon className="w-5 h-5" /> Modo Foco
                                            </button>
                                            <button onClick={() => setRewardShopOpen(true)} className="h-12 flex-1 sm:flex-none bg-cyan-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/20 text-sm active:scale-95">
                                                <ShoppingBagIcon className="w-5 h-5" /> Recompensas
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                                        <div className="flex justify-between items-center mb-5">
                                            <h3 className="text-lg font-semibold">Hábitos de {getFormattedDateTitle(viewedDate)}</h3>
                                            <div className="flex items-center gap-3">
                                                <input type="date" value={viewedDate} onChange={(e) => setViewedDate(e.target.value)} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-9" />
                                                {canWriteHabits && (
                                                    <button onClick={() => setAddHabitModalOpen(true)} className="flex-shrink-0 flex items-center justify-center gap-2 h-9 w-9 sm:w-auto sm:px-4 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all active:scale-95" aria-label="Adicionar novo hábito">
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
                                                const bgColor = isCompleted ? 'bg-green-50/70 border-green-100' : isPending ? 'bg-yellow-50/70 border-yellow-200' : 'bg-gray-50/70 border-red-200';
                                                const rewardClass = isCompleted || isPending ? 'text-yellow-700' : 'text-yellow-700/35';
                                                const categoryStyle = getHabitCategoryStyle(habit.category);
                                                const iconClasses = isCompleted
                                                    ? 'bg-white text-green-500'
                                                    : isPending
                                                    ? 'bg-white text-yellow-500'
                                                    : `${categoryStyle?.iconBg ?? 'bg-white'} ${categoryStyle?.icon ?? 'text-purple-500'}`;
                                                const showSupportOnMobile = index === 3;
                                                return (
                                                    <React.Fragment key={habit.id}>
                                                        <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${bgColor}`}>
                                                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                                <div className={`p-2 rounded-lg ${iconClasses}`}>
                                                                    <Icon className="w-5 h-5" />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <span className={`text-[13px] font-bold block leading-tight ${isCompleted ? 'text-green-800' : 'text-gray-800'}`}>{habit.name}</span>
                                                                    <div className="flex items-center gap-x-2 text-[10px] text-gray-500">
                                                                        <span className="font-medium">{formatSchedule(habit.schedule)}</span>
                                                                        {habit.category && categoryStyle && (
                                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${categoryStyle.badge}`}>
                                                                                {habit.category}
                                                                            </span>
                                                                        )}
                                                                        <span className={`${rewardClass} font-bold flex items-center gap-0.5`}>
                                                                            {habit.reward.type === 'STARS' ? `+${habit.reward.value}` : habit.reward.activityName}
                                                                            {habit.reward.type === 'STARS' && <StarIcon className="w-3.5 h-3.5" />}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                                {isFutureDate ? (
                                                                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Agendado</span>
                                                                ) : isPending ? (
                                                                    canMarkHabits ? (
                                                                        <>
                                                                            <button onClick={() => rejectHabitCompletion(selectedChild.id, habit.id, viewedDate)} className="p-2 text-red-500 hover:bg-red-100 rounded-xl transition-colors active:scale-95"><XCircleIcon className="w-6 h-6" /></button>
                                                                            <button onClick={() => toggleHabitCompletion(selectedChild.id, habit.id, viewedDate)} className="p-2 text-green-500 hover:bg-green-100 rounded-xl transition-colors active:scale-95"><CheckCircleIcon className="w-6 h-6" /></button>
                                                                        </>
                                                                    ) : null
                                                                ) : (
                                                                    <>
                                                                        {canMarkHabits && (
                                                                            <button onClick={() => toggleHabitCompletion(selectedChild.id, habit.id, viewedDate)} className={`h-8 w-8 rounded-lg transition-all font-bold text-[10px] flex items-center justify-center active:scale-95 ${isCompleted ? 'bg-green-500 text-white' : 'bg-white text-gray-400 hover:text-purple-600 border border-gray-200 shadow-sm'}`}>{isCompleted ? <CheckCircleIcon className="w-4 h-4 text-white" /> : 'OK'}</button>
                                                                        )}
                                                                        {canWriteHabits && (
                                                                            <button onClick={() => setConfirmingDelete({ childId: selectedChild.id, habitId: habit.id, habitName: habit.name, date: viewedDate })} className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {showSupportOnMobile && (
                                                            <div className="md:hidden col-span-full">
                                                                {renderSpotlightSection()}
                                                                {renderFavoritesSection()}
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
                                        </div>
                                    </div>

                                    <div className="hidden md:block">
                                        {renderSpotlightSection()}
                                        {renderFavoritesSection()}
                                    </div>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto space-y-6">
                                    <div className="flex flex-col items-center justify-center text-center p-8">
                                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4"><UserCircleIcon className="w-12 h-12 text-gray-300" /></div>
                                        <h2 className="text-xl font-bold text-gray-700">Bem-vindo(a)!</h2>
                                        <p className="text-gray-500 text-sm mt-2 max-w-xs mx-auto">Comece adicionando uma pessoa para criar rotinas e hábitos personalizados.</p>
                                        {canWriteChildren && !isAdmin && (
                                            <button onClick={() => setAddChildModalOpen(true)} className="mt-6 bg-purple-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-purple-500/20 active:scale-95 transition-transform">Adicionar Pessoa</button>
                                        )}
                                    </div>
                                    {renderSpotlightSection()}
                                    {renderFavoritesSection()}
                                </div>
                            )}
                        </div>
                        {selectedChild && (<div className="md:hidden fixed bottom-0 inset-x-0 p-3 bg-white/90 backdrop-blur-sm border-t border-gray-100 z-30"><AdSlot placement="MOBILE_BANNER" /></div>)}
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
            {isManageTemplatesModalOpen && <ManageTemplatesModal onClose={() => setManageTemplatesModalOpen(false)} />}
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

                <div className="border-t border-gray-100 p-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                        Pessoas
                    </h3>

                    <div className={children.length > 3 ? "max-h-[210px] overflow-y-auto pr-1" : ""}>
                        <nav className="space-y-1">
                            {children.map(child => (
                                <div key={child.id} className="group relative flex items-center justify-between p-2 rounded-xl transition-colors hover:bg-gray-50">
                                    <button
                                        onClick={() => handleSelectChild(child)}
                                        className={`flex items-center gap-3 flex-1 text-left ${selectedChildId === child.id ? "font-bold text-purple-700" : "text-gray-600"}`}
                                    >
                                        <span className="text-3xl">{child.avatar}</span>
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

                <div className="border-t border-gray-100 flex-1 overflow-y-auto">
                    <SidebarActions />
                </div>
            </aside>



            <main className="flex-1 flex flex-col h-full overflow-hidden bg-white min-h-0 relative z-10 pointer-events-auto">
               {children.length > 0 && currentView !== "dashboard" && (
                   <div className="md:hidden border-b border-gray-100 px-4 py-2">
                       <div className="flex items-center gap-2 overflow-x-auto pb-1">
                           {children.map((child) => (
                               <button
                                   key={child.id}
                                   onClick={() => handleSelectChild(child)}
                                   className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap ${
                                       selectedChildId === child.id
                                           ? "bg-purple-600 text-white border-purple-600"
                                           : "bg-white text-gray-600 border-gray-200"
                                   }`}
                               >
                                   <span>{child.avatar}</span>
                                   <span className="max-w-[120px] truncate">{child.name}</span>
                               </button>
                           ))}
                       </div>
                   </div>
               )}
               {renderCurrentView()}
            </main>
        </div>
    );
};

export default ParentDashboard;






