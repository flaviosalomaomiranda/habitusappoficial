
import React, { useState, useEffect, useMemo } from 'react';
import { getStates, getCitiesByState, type UF, type Municipio } from '../services/ibgeService';
import { SPECIALTIES } from '../data/supportNetworkData';
import { Professional } from '../types';
import { UsersIcon, PhoneIcon, MapPinIcon, HeartIcon } from './icons/MiscIcons';
import { useAppContext } from '../context/AppContext';

interface SupportNetworkPageProps {
    onClose: () => void;
}

const GOOGLE_FORMS_URL = ""; 

const getSpecialtiesLabel = (professional: Professional) => {
    const list = professional.specialties && professional.specialties.length > 0
        ? professional.specialties
        : professional.specialty
            ? [professional.specialty]
            : [];
    return list.join(", ");
};

const truncateChars = (text: string, maxChars: number) => {
    const trimmed = text.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars).trim()}...`;
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

const isProTier = (tier?: string) => tier === "top" || tier === "pro";
const isListedTier = (tier?: string) => tier === "verified" || tier === "listed";
const isFavoritableTier = (tier?: string) => isProTier(tier) || tier === "exclusive";

const normalizeText = (value?: string) => (value || "").trim().toLowerCase();
const resolveUfSigla = (value: string, states: UF[]) => {
    const normalized = normalizeText(value);
    if (!normalized) return "";
    const bySigla = states.find((s) => normalizeText(s.sigla) === normalized);
    if (bySigla) return bySigla.sigla;
    const byNome = states.find((s) => normalizeText(s.nome) === normalized);
    return byNome?.sigla || value;
};

const ProfessionalCard: React.FC<{ professional: Professional, isFeatured?: boolean }> = ({ professional, isFeatured }) => {
    const { favoriteProfessionalIds, toggleFavoriteProfessional, trackProfessionalEvent } = useAppContext();
    const isFavorite = favoriteProfessionalIds.includes(professional.id);
    const { contacts } = professional;

    const isPremium = professional.tier === 'exclusive' || isProTier(professional.tier);
    const canFavorite = isFavoritableTier(professional.tier);

    const cardStyles = isPremium 
        ? 'bg-gradient-to-tr from-yellow-50 to-amber-100 border-amber-300 shadow-lg'
        : 'bg-white border-gray-200 shadow-sm';

    return (
        <div className={`rounded-2xl p-4 w-full transition-all relative ${cardStyles}`}>
             {!isListedTier(professional.tier) && (
                <div className={`absolute -top-3 -right-3 font-black text-[10px] px-3 py-1.5 rounded-full shadow-md transform rotate-6 ${
                    professional.tier === 'exclusive' ? 'bg-indigo-600 text-white' : 'bg-amber-400 text-amber-900'
                }`}>
                    {professional.tier === 'exclusive' ? '⭐ EXCLUSIVO' : '⭐ PRO'}
                </div>
            )}
            {isFeatured && (
                <div className="absolute -top-2 left-2 bg-purple-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-md">
                    Em destaque hoje
                </div>
            )}
            <div className="flex gap-4 items-start">
                <img 
                    src={professional.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(professional.name)}&background=random`}
                    alt={professional.name}
                    className="w-20 h-20 object-cover rounded-full flex-shrink-0 bg-gray-200 border-2 border-white shadow-md"
                />
                <div className="flex-1">
                    <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-lg text-gray-800 leading-tight">{professional.name}</h3>
                                {canFavorite && (
                                    <button
                                        onClick={() => {
                                            if (!isFavorite) {
                                                trackProfessionalEvent(professional.id, "favorite_add", { source: "support_network_page" });
                                            }
                                            toggleFavoriteProfessional(professional.id);
                                        }}
                                        className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                                            isFavorite ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                        }`}
                                        aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                    >
                                        <HeartIcon filled={isFavorite} className={`w-4 h-4 ${isFavorite ? 'text-red-500' : 'text-gray-400'}`} />
                                    </button>
                                )}
                                {professional.verified && (
                                    <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">✅ Registro verificado</span>
                                )}
                            </div>
                            <p className="text-xs text-gray-500">{getSpecialtiesLabel(professional)}</p>
                            {professional.registryLabel && (
                                <p className="text-xs text-gray-400 font-medium mt-0.5">{professional.registryLabel}</p>
                            )}
                        </div>
                    </div>
                    {professional.headline && (
                        <p className="mt-2 text-xs text-gray-600 font-semibold p-2 bg-black/5 rounded-md line-clamp-2">
                            <span className="font-normal">{truncateChars(professional.headline, 90)}</span>
                        </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><MapPinIcon className="w-3 h-3"/> {professional.city} / {professional.uf}</p>
                    
                </div>
            </div>
             {/* Conteúdo Premium */}
             {isPremium && (
                <div className="mt-3 pt-3 border-t border-amber-200/50 space-y-3">
                    {professional.highlights && professional.highlights.length > 0 && <div><h4 className="font-bold text-[10px] text-amber-800 uppercase">Destaques</h4><div className="flex flex-wrap gap-1.5 mt-1">{professional.highlights.slice(0, 3).map(s => <span key={s} className="bg-amber-200/50 text-amber-900 text-[11px] font-semibold px-2 py-0.5 rounded-full">{s}</span>)}</div></div>}
                </div>
            )}

            {/* Ações / Botões */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/80">
                 <div className="flex flex-wrap gap-2">
                    {(contacts.bookingUrl || contacts.whatsapp) && (
                        <a
                            href={contacts.bookingUrl || buildWhatsAppLink(contacts.whatsapp || "", buildBookingMessage(professional))}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                                trackProfessionalEvent(professional.id, "contact_click", { source: "support_network_page" });
                                if (!contacts.bookingUrl && contacts.whatsapp) {
                                    trackProfessionalEvent(professional.id, "whatsapp_click", { source: "support_network_page" });
                                }
                            }}
                            className="flex-1 text-center bg-cyan-500 text-white font-bold text-xs py-2 px-3 rounded-lg hover:bg-cyan-600 transition-colors whitespace-nowrap"
                        >
                            Entrar em contato
                        </a>
                    )}
                    {contacts.phone && <a href={`tel:+55${contacts.phone.replace(/\D/g, '')}`} className="flex-1 text-center bg-purple-100 text-purple-700 font-bold text-xs py-2 px-3 rounded-lg hover:bg-purple-200 transition-colors whitespace-nowrap">Ligar</a>}
                    {contacts.maps && <a href={contacts.maps} target="_blank" rel="noopener noreferrer" onClick={() => trackProfessionalEvent(professional.id, "location_click", { source: "support_network_page" })} className="flex-1 text-center bg-blue-100 text-blue-700 font-bold text-xs py-2 px-3 rounded-lg hover:bg-blue-200 transition-colors whitespace-nowrap">Localização</a>}
                    {professional.tier === "exclusive" && (
                        <button
                            type="button"
                            onClick={() => {
                                trackProfessionalEvent(professional.id, "routine_import", { source: "support_network_page" });
                                alert("Importação de rotinas personalizadas será liberada em breve.");
                            }}
                            className="flex-1 text-center bg-purple-600 text-white font-bold text-xs py-2 px-3 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                        >
                            Rotinas personalizadas
                        </button>
                    )}
                 </div>
            </div>
        </div>
    );
};


const SupportNetworkPage: React.FC<SupportNetworkPageProps> = ({ onClose }) => {
    const { settings, activeSupportNetworkProfessionals, setFamilyLocation } = useAppContext();

    const [states, setStates] = useState<UF[]>([]);
    const [cities, setCities] = useState<Municipio[]>([]);
    const [isLoadingStates, setIsLoadingStates] = useState(true);
    const [isLoadingCities, setIsLoadingCities] = useState(false);
    const [errorStates, setErrorStates] = useState<string | null>(null);
    const [errorCities, setErrorCities] = useState<string | null>(null);

    const [selectedState, setSelectedState] = useState(settings.familyLocation?.uf || '');
    const [selectedCity, setSelectedCity] = useState(settings.familyLocation?.cityId || '');
    const [selectedSpecialty, setSelectedSpecialty] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchStates = async () => {
        setIsLoadingStates(true);
        setErrorStates(null);
        try {
            const data = await getStates();
            setStates(data);
        } catch (error) {
            setErrorStates('Não foi possível carregar os estados.');
        } finally {
            setIsLoadingStates(false);
        }
    };

    useEffect(() => {
        fetchStates();
    }, []);

    useEffect(() => {
        if (activeSupportNetworkProfessionals.length === 0 || states.length === 0) return;
        if (selectedState && selectedCity) return;
        const first = activeSupportNetworkProfessionals.find((p) => p.tier !== "master");
        if (!first) return;
        const ufSigla = resolveUfSigla(first.uf, states);
        if (!selectedState && ufSigla) {
            setSelectedState(ufSigla);
        }
        if (!selectedCity && first.cityId) {
            setSelectedCity(String(first.cityId));
        }
    }, [activeSupportNetworkProfessionals, states, selectedState, selectedCity]);

    useEffect(() => {
        if (!selectedState) {
            setCities([]);
            setSelectedCity('');
            return;
        }
        const fetchCities = async () => {
            setIsLoadingCities(true);
            setErrorCities(null);
            try {
                const data = await getCitiesByState(selectedState);
                setCities(data);
            } catch (error) {
                setErrorCities('Não foi possível carregar as cidades.');
            } finally {
                setIsLoadingCities(false);
            }
        };
        fetchCities();
    }, [selectedState]);

    // Salvar última localização ao selecionar cidade
    useEffect(() => {
        if (selectedCity && cities.length > 0) {
            const cityObj = cities.find(c => String(c.id) === selectedCity);
            if (cityObj) {
                setFamilyLocation({
                    cityId: String(cityObj.id),
                    cityName: cityObj.nome,
                    uf: selectedState
                });
            }
        }
    }, [selectedCity, cities, selectedState, setFamilyLocation]);

    const handleListProfessionalClick = () => {
        if (GOOGLE_FORMS_URL) {
            window.open(GOOGLE_FORMS_URL, '_blank', 'noopener,noreferrer');
        } else {
            alert('Link do formulário ainda não configurado.');
        }
    };
    
    const ufSiglaSelecionada = useMemo(() => resolveUfSigla(selectedState, states), [selectedState, states]);

    const strictFilteredProfessionals = useMemo(() => {
        if (!selectedState || !selectedCity) {
            return activeSupportNetworkProfessionals.filter((p) => {
                if (p.tier === "master") return false;
                const matchesSpecialty = !selectedSpecialty || (p.specialties?.includes(selectedSpecialty) || p.specialty === selectedSpecialty);
                const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesSpecialty && matchesSearch;
            });
        }

        return activeSupportNetworkProfessionals.filter(p => {
            const matchesTier = p.tier !== 'master';
            const profUfNormalized = normalizeText(p.uf);
            const selectedUfNormalized = normalizeText(ufSiglaSelecionada || selectedState);
            const matchesUf =
                !selectedUfNormalized ||
                profUfNormalized === selectedUfNormalized ||
                profUfNormalized === normalizeText(states.find((s) => s.sigla === ufSiglaSelecionada)?.nome);
            const matchesLocation = matchesUf && String(p.cityId) === selectedCity;
            const matchesSpecialty = !selectedSpecialty || (p.specialties?.includes(selectedSpecialty) || p.specialty === selectedSpecialty);
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTier && matchesLocation && matchesSpecialty && matchesSearch;
        });
    }, [selectedState, selectedCity, selectedSpecialty, searchQuery, activeSupportNetworkProfessionals, ufSiglaSelecionada, states]);

    const filteredProfessionals = useMemo(() => {
        if (strictFilteredProfessionals.length > 0) return strictFilteredProfessionals;
        if (!selectedCity) return [];
        return activeSupportNetworkProfessionals.filter((p) => {
            if (p.tier === "master") return false;
            if (String(p.cityId) !== selectedCity) return false;
            return p.name.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [strictFilteredProfessionals, selectedCity, activeSupportNetworkProfessionals, searchQuery]);
    
    // Novo Agrupamento: Exclusive no topo
    const exclusiveProfessional = useMemo(() => 
        filteredProfessionals.find(p => p.tier === 'exclusive'),
    [filteredProfessionals]);

    const { topProfessionals, rotationPeriod } = useMemo(() => {
        if (!filteredProfessionals) return { topProfessionals: [], rotationPeriod: 0 };

        const topList = filteredProfessionals.filter(p => isProTier(p.tier));
        const n = topList.length;

        if (n <= 1) {
            return { topProfessionals: topList, rotationPeriod: 0 };
        }

        const periodDays = n === 2 ? 15 : 10;
        const baseOrder = [...topList].sort((a, b) => {
            const aTime = a.tierJoinedAt ? new Date(a.tierJoinedAt).getTime() : 0;
            const bTime = b.tierJoinedAt ? new Date(b.tierJoinedAt).getTime() : 0;
            if (aTime !== bTime) return aTime - bTime;
            return a.name.localeCompare(b.name);
        });
        const anchorDate = baseOrder[0].tierJoinedAt ? new Date(baseOrder[0].tierJoinedAt) : new Date("2024-01-01T00:00:00Z");
        
        const today = new Date();
        const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        const anchorUTC = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate());

        const diffDays = Math.floor((todayUTC - anchorUTC) / (1000 * 60 * 60 * 24));
        const shift = Math.max(0, Math.floor(diffDays / periodDays)) % n;
        const rotatedOrder = [...baseOrder.slice(shift), ...baseOrder.slice(0, shift)];
        
        return { topProfessionals: rotatedOrder.slice(0, 3), rotationPeriod: periodDays };
    }, [filteredProfessionals]);
    
    const listedProfessionals = useMemo(() => {
        if (!selectedState || !selectedCity) return [];
        const selectedUfNormalized = normalizeText(ufSiglaSelecionada || selectedState);
        return activeSupportNetworkProfessionals.filter((p) => {
            if (!isListedTier(p.tier)) return false;
            const profUfNormalized = normalizeText(p.uf);
            const matchesUf =
                !selectedUfNormalized ||
                profUfNormalized === selectedUfNormalized ||
                profUfNormalized === normalizeText(states.find((s) => s.sigla === ufSiglaSelecionada)?.nome);
            if (!matchesUf) return false;
            if (String(p.cityId) !== selectedCity) return false;
            if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [selectedState, selectedCity, ufSiglaSelecionada, activeSupportNetworkProfessionals, states, searchQuery]);

    return (
        <div className="flex-1 overflow-y-auto w-full max-w-lg mx-auto px-4 pb-12 animate-in fade-in">
            <header className="py-4">
                 <button onClick={onClose} className="text-purple-600 font-semibold mb-2">&larr; Voltar ao Painel</button>
                <h1 className="text-3xl font-bold">Rede de Serviços Profissionais</h1>
                <p className="text-gray-500">Encontre profissionais perto de você.</p>
            </header>
            
            <button onClick={handleListProfessionalClick} className="w-full bg-purple-600 text-white font-bold py-3 px-4 rounded-xl my-4 text-center hover:bg-purple-700 transition-colors">
                Sou profissional / Quero ser listado
            </button>

            <div className="space-y-4">
                {/* State Selector */}
                <div>
                    <label htmlFor="state-select" className="block text-sm font-bold text-gray-700 mb-1">1. Estado (UF)</label>
                    {isLoadingStates && <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />}
                    {!isLoadingStates && errorStates && <div className="text-red-500 text-sm">{errorStates} <button onClick={fetchStates} className="font-bold underline">Tentar novamente</button></div>}
                    {!isLoadingStates && !errorStates && (
                        <select id="state-select" value={selectedState} onChange={e => setSelectedState(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                            <option value="">Selecione um estado</option>
                            {states.map(s => <option key={s.id} value={s.sigla}>{s.nome}</option>)}
                        </select>
                    )}
                </div>

                {/* City Selector */}
                <div>
                    <label htmlFor="city-select" className="block text-sm font-bold text-gray-700 mb-1">2. Cidade</label>
                    {isLoadingCities && <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />}
                    {!isLoadingCities && errorCities && <div className="text-red-500 text-sm">{errorCities}</div>}
                    {!isLoadingCities && !errorCities && (
                        <select id="city-select" value={selectedCity} onChange={e => setSelectedCity(e.target.value)} disabled={!selectedState || cities.length === 0} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white disabled:bg-gray-100">
                            <option value="">{selectedState ? 'Selecione uma cidade' : 'Selecione um estado primeiro'}</option>
                            {cities.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
                        </select>
                    )}
                </div>

                {/* Specialty Selector */}
                <div>
                    <label htmlFor="specialty-select" className="block text-sm font-bold text-gray-700 mb-1">3. Especialidade (opcional)</label>
                    <select id="specialty-select" value={selectedSpecialty} onChange={e => setSelectedSpecialty(e.target.value)} disabled={!selectedCity} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white disabled:bg-gray-100">
                        <option value="">Selecione uma especialidade</option>
                        {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            {selectedState && selectedCity && (
                <div className="mt-6">
                    <p className="text-xs text-gray-500 font-medium">
                        Você está vendo: {selectedState} &gt; {cities.find(c => String(c.id) === selectedCity)?.nome}
                        {selectedSpecialty ? ` > ${selectedSpecialty}` : ''}
                    </p>
                    <input type="text" placeholder="Buscar por nome..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full px-3 py-2 mt-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"/>

                    <div className="mt-6 space-y-6">
                        {/* Seção Exclusiva */}
                        {exclusiveProfessional && (
                            <section>
                                <h2 className="text-xl font-bold text-indigo-700 border-b-2 border-indigo-200 pb-1 mb-3">💎 Especialista Exclusivo</h2>
                                <ProfessionalCard professional={exclusiveProfessional} />
                            </section>
                        )}

                        {/* Top Section */}
                        <section>
                            <h2 className="text-xl font-bold text-amber-600 border-b-2 border-amber-200 pb-1 mb-3">⭐ Destaques PRO</h2>
                            {rotationPeriod > 0 && <p className="text-[10px] text-gray-500 -mt-2 mb-3">A ordem dos destaques muda a cada {rotationPeriod} dias.</p>}
                            <div className="space-y-3">
                                {topProfessionals.length > 0 ? (
                                    topProfessionals.map((p, index) => <ProfessionalCard key={p.id} professional={p} isFeatured={index === 0 && topProfessionals.length > 1} />)
                                ) : (
                                    !exclusiveProfessional && <p className="text-sm text-gray-500 text-center py-4">Ainda não há profissionais em destaque nesta cidade.</p>
                                )}
                            </div>
                        </section>
                        
                        {/* LISTADO Section */}
                        <section>
                            <h2 className="text-xl font-bold text-green-700 border-b-2 border-green-200 pb-1 mb-3">✅ Listados</h2>
                             <div className="space-y-3">
                                {listedProfessionals.length > 0 ? (
                                    listedProfessionals.map(p => <ProfessionalCard key={p.id} professional={p} />)
                                ) : (
                                    <p className="text-sm text-gray-500 text-center py-4">Ainda não há profissionais listados nesta cidade.</p>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
            
            <footer className="mt-8 text-center text-xs text-gray-400 space-y-2">
                <p>Os níveis "PRO" e "EXCLUSIVO" são espaços patrocinados. O selo "Registro verificado" indica dados conferidos.</p>
                <p>A Rede de Serviços Profissionais é um diretório. Não oferecemos diagnóstico nem orientação médica.</p>
            </footer>
        </div>
    );
};

export default SupportNetworkPage;

