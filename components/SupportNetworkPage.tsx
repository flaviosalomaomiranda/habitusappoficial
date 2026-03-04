import React, { useEffect, useMemo, useState } from 'react';
import { getStates, getCitiesByState, type UF, type Municipio } from '../services/ibgeService';
import type { Professional } from '../types';
import { MapPinIcon } from './icons/MiscIcons';
import { useAppContext } from '../context/AppContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { SUPPORT_NETWORK_AREAS, SUPPORT_NETWORK_SPECIALTIES_BY_AREA } from '../data/supportNetworkData';

interface SupportNetworkPageProps {
    onClose: () => void;
    linkedProfessionalIds?: string[];
}

type AreaOption = {
    key: string;
    label: string;
    keywords: string[];
};

type PageMode = 'catalog' | 'results';

const GOOGLE_FORMS_URL = '';

const DEFAULT_AREAS: AreaOption[] = SUPPORT_NETWORK_AREAS;

const normalizeText = (value?: string) => String(value || '').trim().toLowerCase();

const getSpecialties = (professional: Professional) => {
    if (Array.isArray(professional.specialties) && professional.specialties.length > 0) {
        return professional.specialties.map((item) => String(item || '').trim()).filter(Boolean);
    }
    const single = String(professional.specialty || '').trim();
    return single ? [single] : [];
};

const resolveUfSigla = (value: string, states: UF[]) => {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    const bySigla = states.find((s) => normalizeText(s.sigla) === normalized);
    if (bySigla) return bySigla.sigla;
    const byNome = states.find((s) => normalizeText(s.nome) === normalized);
    return byNome?.sigla || value;
};

const matchesSelectedCity = (professional: Professional, selectedCityId: string, selectedCityName?: string) => {
    const profCityId = String(professional.cityId || '').trim();
    if (selectedCityId && profCityId && profCityId === selectedCityId) return true;
    if (!selectedCityName) return false;
    return normalizeText(professional.city) === normalizeText(selectedCityName);
};

const getTierBucket = (tier?: string) => {
    const normalized = normalizeText(tier);
    if (normalized === 'exclusive' || normalized === 'premium') return 0;
    if (normalized === 'top' || normalized === 'pro') return 1;
    if (normalized === 'verified' || normalized === 'listed' || normalized === 'vip') return 2;
    return 3;
};

const getProfessionalMatchScore = (professional: Professional, query: string) => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return 0;
    const name = normalizeText(professional.name);
    const specialtiesText = getSpecialties(professional).map((item) => normalizeText(item)).join(' ');
    if (name === normalizedQuery) return 4;
    if (name.includes(normalizedQuery)) return 3;
    if (specialtiesText.includes(normalizedQuery)) return 2;
    return 0;
};

const buildWhatsAppLink = (phone: string, message: string) => {
    const cleaned = phone.replace(/\D/g, '');
    const text = encodeURIComponent(message);
    return `https://wa.me/55${cleaned}?text=${text}`;
};

const buildBookingMessage = (professional: Professional) => {
    if ((professional as any).bookingMessage) return String((professional as any).bookingMessage);
    return `Olá ${professional.name}, encontrei seu perfil no Habitus e gostaria de mais informações.`;
};

const getAreaLabelForSidebar = (area: AreaOption) => {
    if (area.key === 'fisio_terapias') {
        return (
            <span className="leading-tight">
                Fisio
                <br />
                Terapia
            </span>
        );
    }
    if (area.key === 'enfermagem') {
        return 'Enfermag.';
    }
    return area.label;
};

const SupportNetworkPage: React.FC<SupportNetworkPageProps> = ({ onClose, linkedProfessionalIds = [] }) => {
    const {
        settings,
        userProfile,
        activeSupportNetworkProfessionals,
        supportNetworkProfessionals,
        setFamilyLocation,
        trackProfessionalEvent,
    } = useAppContext();

    const professionalsPool = useMemo(
        () => (activeSupportNetworkProfessionals.length > 0 ? activeSupportNetworkProfessionals : supportNetworkProfessionals),
        [activeSupportNetworkProfessionals, supportNetworkProfessionals]
    );

    const [pageMode, setPageMode] = useState<PageMode>('catalog');
    const [states, setStates] = useState<UF[]>([]);
    const [cities, setCities] = useState<Municipio[]>([]);
    const [selectedState, setSelectedState] = useState(userProfile?.city?.uf || settings.familyLocation?.uf || '');
    const [selectedCity, setSelectedCity] = useState(String(userProfile?.city?.cityId || settings.familyLocation?.cityId || ''));

    const [selectedArea, setSelectedArea] = useState<string>(() => {
        try {
            const raw = window.localStorage.getItem('supportNetworkPrefilters');
            if (!raw) return 'all';
            const parsed = JSON.parse(raw) as { selectedArea?: string };
            return String(parsed?.selectedArea || 'all');
        } catch {
            return 'all';
        }
    });
    const [searchQuery, setSearchQuery] = useState<string>(() => {
        try {
            const raw = window.localStorage.getItem('supportNetworkPrefilters');
            if (!raw) return '';
            const parsed = JSON.parse(raw) as { searchQuery?: string };
            return String(parsed?.searchQuery || '');
        } catch {
            return '';
        }
    });
    const [selectedSpecialty, setSelectedSpecialty] = useState('');

    const [specialtyImageMap, setSpecialtyImageMap] = useState<Record<string, string>>({});
    const [adminAreas, setAdminAreas] = useState<AreaOption[]>([]);
    const [adminSpecialtiesByArea, setAdminSpecialtiesByArea] = useState<Record<string, string[]>>({});

    useEffect(() => {
        const ref = doc(db, 'supportNetworkSettings', 'specialtyCatalog');
        const unsub = onSnapshot(
            ref,
            (snap) => {
                if (!snap.exists()) {
                    setSpecialtyImageMap({});
                    setAdminAreas([]);
                    setAdminSpecialtiesByArea({});
                    return;
                }
                const data = snap.data() as any;

                const imageMapRaw = data?.imagesBySpecialty && typeof data.imagesBySpecialty === 'object' ? data.imagesBySpecialty : {};
                const nextImages: Record<string, string> = {};
                Object.entries(imageMapRaw).forEach(([rawName, rawUrl]) => {
                    const name = String(rawName || '').trim();
                    const url = String(rawUrl || '').trim();
                    if (!name || !url) return;
                    nextImages[name] = url;
                });

                const rawAreas = Array.isArray(data?.areas) ? data.areas : [];
                const nextAreas: AreaOption[] = rawAreas
                    .map((item: any) => ({
                        key: String(item?.key || '').trim(),
                        label: String(item?.label || '').trim(),
                        keywords: Array.isArray(item?.keywords)
                            ? item.keywords.map((kw: any) => String(kw || '').trim()).filter(Boolean)
                            : [],
                    }))
                    .filter((item: AreaOption) => item.key && item.label);

                const rawSpecialtiesByArea = data?.specialtiesByArea && typeof data.specialtiesByArea === 'object'
                    ? data.specialtiesByArea
                    : {};
                const nextSpecialtiesByArea: Record<string, string[]> = {};
                Object.entries(rawSpecialtiesByArea).forEach(([rawAreaKey, rawList]) => {
                    const areaKey = String(rawAreaKey || '').trim();
                    if (!areaKey || !Array.isArray(rawList)) return;
                    nextSpecialtiesByArea[areaKey] = rawList
                        .map((item: any) => String(item || '').trim())
                        .filter(Boolean);
                });

                setSpecialtyImageMap(nextImages);
                setAdminAreas(nextAreas);
                setAdminSpecialtiesByArea(nextSpecialtiesByArea);
            },
            () => {
                setSpecialtyImageMap({});
                setAdminAreas([]);
                setAdminSpecialtiesByArea({});
            }
        );
        return () => unsub();
    }, []);

    const areaOptions = useMemo(() => {
        const base = adminAreas.length > 0 ? adminAreas : DEFAULT_AREAS;
        const hasLinked = base.some((item) => item.key === 'linked');
        if (hasLinked) return base;
        return [...base, { key: 'linked', label: 'Vinc', keywords: ['vinculo', 'vinculado'] }];
    }, [adminAreas]);

    useEffect(() => {
        if (areaOptions.some((item) => item.key === selectedArea)) return;
        setSelectedArea(areaOptions[0]?.key || 'all');
    }, [areaOptions, selectedArea]);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                'supportNetworkPrefilters',
                JSON.stringify({ selectedArea, searchQuery })
            );
        } catch {
            // noop
        }
    }, [selectedArea, searchQuery]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const nextStates = await getStates();
            if (!cancelled) setStates(nextStates);
        };
        run().catch(() => null);
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedState) {
            setCities([]);
            setSelectedCity('');
            return;
        }
        let cancelled = false;
        const run = async () => {
            const nextCities = await getCitiesByState(selectedState);
            if (!cancelled) setCities(nextCities);
        };
        run().catch(() => null);
        return () => {
            cancelled = true;
        };
    }, [selectedState]);

    useEffect(() => {
        if (!selectedCity || cities.length === 0) return;
        const city = cities.find((item) => String(item.id) === selectedCity);
        if (!city) return;
        setFamilyLocation({
            cityId: String(city.id),
            cityName: city.nome,
            uf: selectedState,
        });
    }, [selectedCity, cities, selectedState, setFamilyLocation]);

    const ufSiglaSelecionada = useMemo(() => resolveUfSigla(selectedState, states), [selectedState, states]);
    const selectedCityName = useMemo(() => cities.find((c) => String(c.id) === selectedCity)?.nome || '', [cities, selectedCity]);

    const professionalsByLocation = useMemo(() => {
        if (!selectedState || !selectedCity) return [] as Professional[];
        const selectedUfNormalized = normalizeText(ufSiglaSelecionada || selectedState);
        return professionalsPool.filter((professional) => {
            if (normalizeText(professional.tier) === 'master') return false;
            const profUfNormalized = normalizeText(professional.uf);
            const matchesUf =
                !selectedUfNormalized ||
                profUfNormalized === selectedUfNormalized ||
                profUfNormalized === normalizeText(states.find((s) => s.sigla === ufSiglaSelecionada)?.nome);
            if (!matchesUf) return false;
            if (!matchesSelectedCity(professional, selectedCity, selectedCityName)) return false;
            return true;
        });
    }, [selectedState, selectedCity, ufSiglaSelecionada, professionalsPool, states, selectedCityName]);

    const specialtiesForArea = useMemo(() => {
        const fallbackSpecialtiesByArea: Record<string, string[]> =
            Object.keys(adminSpecialtiesByArea).length > 0
                ? adminSpecialtiesByArea
                : SUPPORT_NETWORK_SPECIALTIES_BY_AREA;
        const configuredForSelected: string[] = fallbackSpecialtiesByArea[selectedArea] || [];
        const configuredAll: string[] = Object.values(fallbackSpecialtiesByArea).flatMap((specialties: string[]) => specialties);

        let baseList: string[];
        if (selectedArea === 'all' && configuredAll.length > 0) {
            baseList = configuredAll;
        } else if (configuredForSelected.length > 0) {
            baseList = configuredForSelected;
        } else {
            const areaCfg = areaOptions.find((item) => item.key === selectedArea);
            const fallback = professionalsByLocation.filter((professional) => {
                if (selectedArea === 'all') return true;
                const specialtiesText = getSpecialties(professional).join(' ').toLowerCase();
                if (areaCfg?.keywords?.length) {
                    return areaCfg.keywords.some((keyword) => specialtiesText.includes(keyword.toLowerCase()));
                }
                return true;
            });
            baseList = fallback.flatMap((professional) => getSpecialties(professional));
        }

        const dedup = Array.from(new Set(baseList.map((item) => String(item || '').trim()).filter(Boolean)));
        if (!searchQuery.trim()) {
            return dedup.sort((a, b) => a.localeCompare(b, 'pt-BR'));
        }
        const query = normalizeText(searchQuery);
        return dedup
            .filter((item) => normalizeText(item).includes(query))
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [adminSpecialtiesByArea, selectedArea, searchQuery, professionalsByLocation, areaOptions]);

    const specialtyCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        professionalsByLocation.forEach((professional) => {
            getSpecialties(professional).forEach((specialty) => {
                counts[specialty] = (counts[specialty] || 0) + 1;
            });
        });
        return counts;
    }, [professionalsByLocation]);

    useEffect(() => {
        if (!selectedSpecialty) return;
        if (specialtiesForArea.includes(selectedSpecialty)) return;
        setSelectedSpecialty('');
        setPageMode('catalog');
    }, [specialtiesForArea, selectedSpecialty]);

    const professionalsForSelectedSpecialty = useMemo(() => {
        if (!selectedSpecialty) return [] as Professional[];
        const base = professionalsByLocation
            .filter((professional) => getSpecialties(professional).includes(selectedSpecialty))
            .sort((a, b) => {
                const rankDiff = getTierBucket(a.tier) - getTierBucket(b.tier);
                if (rankDiff !== 0) return rankDiff;
                const scoreDiff = getProfessionalMatchScore(b, searchQuery) - getProfessionalMatchScore(a, searchQuery);
                if (scoreDiff !== 0) return scoreDiff;
                return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
            });

        const premium = base.filter((item) => getTierBucket(item.tier) === 0).slice(0, 2);
        const top = base.filter((item) => getTierBucket(item.tier) === 1).slice(0, 2);
        const listed = base.filter((item) => getTierBucket(item.tier) === 2).slice(0, 2);

        return [...premium, ...top, ...listed];
    }, [selectedSpecialty, professionalsByLocation, searchQuery]);

    const linkedProfessionals = useMemo(() => {
        const linkedSet = new Set(linkedProfessionalIds.map((id) => String(id || '').trim()).filter(Boolean));
        if (linkedSet.size === 0) return [] as Professional[];
        return professionalsPool
            .filter((professional) => linkedSet.has(String(professional.id || '').trim()))
            .sort((a, b) => {
                const rankDiff = getTierBucket(a.tier) - getTierBucket(b.tier);
                if (rankDiff !== 0) return rankDiff;
                return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
            });
    }, [linkedProfessionalIds, professionalsPool]);

    const handleOpenSpecialtyResults = (specialty: string) => {
        setSelectedSpecialty(specialty);
        setPageMode('results');
    };

    const handleBack = () => {
        if (pageMode === 'results') {
            setPageMode('catalog');
            return;
        }
        onClose();
    };

    const handleListProfessionalClick = () => {
        if (GOOGLE_FORMS_URL) {
            window.open(GOOGLE_FORMS_URL, '_blank', 'noopener,noreferrer');
        } else {
            alert('Link do formulário ainda não configurado.');
        }
    };

    return (
        <div className="flex-1 overflow-y-auto w-full max-w-6xl mx-auto animate-in fade-in pb-32">
            <header className="sticky top-0 z-20 bg-gradient-to-b from-purple-700 via-purple-700 to-purple-600 border-b border-purple-500 px-4 py-3 flex items-center gap-3">
                <button onClick={handleBack} className="text-white text-2xl leading-none" aria-label="Voltar">←</button>
                <h1 className="text-lg font-bold text-white">Profissionais</h1>
            </header>

            <div className="px-2 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                        {selectedCityName ? `${selectedCityName} - ${ufSiglaSelecionada || selectedState}` : 'Defina sua cidade no perfil'}
                    </p>
                    <button onClick={handleListProfessionalClick} className="text-[11px] font-bold text-purple-700">Quero fazer parte desta lista!</button>
                </div>

                <div className="mb-3">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={pageMode === 'results' ? 'Buscar profissional nesta especialidade' : 'Buscar especialidade'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                </div>

                {pageMode === 'catalog' && (
                    <div className="grid grid-cols-[64px_1fr] gap-1.5 min-h-[68vh]">
                        <aside className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                            {areaOptions.map((area) => (
                                <button
                                    key={area.key}
                                    type="button"
                                    onClick={() => setSelectedArea(area.key)}
                                    className={`w-full text-left px-1.5 py-2.5 text-[11px] border-b border-gray-100 last:border-b-0 ${
                                        selectedArea === area.key ? 'bg-purple-50 text-purple-700 font-bold' : 'text-gray-700'
                                    }`}
                                >
                                    {getAreaLabelForSidebar(area)}
                                </button>
                            ))}
                        </aside>

                        <section className="space-y-2">
                            {selectedArea !== 'linked' ? (
                                <div className="border border-gray-200 rounded-xl bg-white p-3">
                                    <p className="text-xs font-bold text-gray-600 mb-2">Especialidades</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {specialtiesForArea.map((specialty) => (
                                            <button
                                                key={`specialty-${specialty}`}
                                                type="button"
                                                onClick={() => handleOpenSpecialtyResults(specialty)}
                                                className="p-2 rounded-lg border border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50 transition-colors"
                                            >
                                                <div className="w-full flex items-center justify-center mb-1">
                                                    {specialtyImageMap[specialty] ? (
                                                        <img
                                                            src={specialtyImageMap[specialty]}
                                                            alt={specialty}
                                                            className="w-12 h-12 rounded-full object-cover border border-gray-200"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-[11px] font-black flex items-center justify-center">
                                                            {specialty.slice(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[11px] font-semibold text-gray-700 line-clamp-2 text-center">{specialty}</p>
                                                <p className="text-[10px] text-gray-400 mt-1 text-center">
                                                    {(specialtyCounts[specialty] || 0)} profissional(is)
                                                </p>
                                            </button>
                                        ))}

                                        {specialtiesForArea.length === 0 && (
                                            <p className="col-span-full text-xs text-gray-500">Nenhuma especialidade configurada para esta área.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-xl bg-white p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-bold text-purple-700">Profissionais vinculados</p>
                                        <span className="text-[11px] text-gray-500">{linkedProfessionals.length} encontrado(s)</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {linkedProfessionals.map((professional) => {
                                            const bookingUrl = professional.contacts?.bookingUrl;
                                            const whatsapp = professional.contacts?.whatsapp;
                                            return (
                                                <article key={`linked-${professional.id}`} className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                                                    <img
                                                        src={professional.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(professional.name)}&background=random`}
                                                        alt={professional.name}
                                                        className="w-full aspect-[4/3] rounded-lg object-cover border border-gray-100 bg-gray-50"
                                                    />
                                                    <p className="mt-1.5 text-[13px] font-bold text-gray-800 leading-tight line-clamp-2">{professional.name}</p>
                                                    <p className="text-[10px] text-gray-500 line-clamp-1">{getSpecialties(professional).join(', ')}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                                                        <MapPinIcon className="w-3 h-3" /> {professional.city} / {professional.uf}
                                                    </p>
                                                    <div className="mt-1.5 flex gap-1">
                                                        {(bookingUrl || whatsapp) && (
                                                            <a
                                                                href={bookingUrl || buildWhatsAppLink(whatsapp || '', buildBookingMessage(professional))}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={() => trackProfessionalEvent(professional.id, 'contact_click', { source: 'support_network_linked' })}
                                                                className="flex-1 text-center rounded-md bg-emerald-500 text-white text-[10px] font-bold py-1.5"
                                                            >
                                                                Contato
                                                            </a>
                                                        )}
                                                        {professional.contacts?.maps && (
                                                            <a
                                                                href={professional.contacts.maps}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={() => trackProfessionalEvent(professional.id, 'location_click', { source: 'support_network_linked' })}
                                                                className="flex-1 text-center rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold py-1.5"
                                                            >
                                                                Perfil
                                                            </a>
                                                        )}
                                                    </div>
                                                </article>
                                            );
                                        })}
                                        {linkedProfessionals.length === 0 && (
                                            <p className="col-span-full text-xs text-gray-500">Você ainda não possui profissionais vinculados.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {pageMode === 'results' && (
                    <section className="border border-gray-200 rounded-xl bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-purple-700">{selectedSpecialty}</p>
                            <span className="text-[11px] text-gray-500">{professionalsForSelectedSpecialty.length} encontrado(s)</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {professionalsForSelectedSpecialty.map((professional) => {
                                const bookingUrl = professional.contacts?.bookingUrl;
                                const whatsapp = professional.contacts?.whatsapp;
                                return (
                                    <article key={`result-${professional.id}`} className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                                        <img
                                            src={professional.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(professional.name)}&background=random`}
                                            alt={professional.name}
                                            className="w-full aspect-[4/3] rounded-lg object-cover border border-gray-100 bg-gray-50"
                                        />
                                        <p className="mt-1.5 text-[13px] font-bold text-gray-800 leading-tight line-clamp-2">{professional.name}</p>
                                        <p className="text-[10px] text-gray-500 line-clamp-1">{selectedSpecialty}</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                                            <MapPinIcon className="w-3 h-3" /> {professional.city} / {professional.uf}
                                        </p>

                                        <div className="mt-1.5 flex gap-1">
                                            {(bookingUrl || whatsapp) && (
                                                <a
                                                    href={bookingUrl || buildWhatsAppLink(whatsapp || '', buildBookingMessage(professional))}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => trackProfessionalEvent(professional.id, 'contact_click', { source: 'support_network_specialty_results' })}
                                                    className="flex-1 text-center rounded-md bg-emerald-500 text-white text-[10px] font-bold py-1.5"
                                                >
                                                    Contato
                                                </a>
                                            )}
                                            {professional.contacts?.maps && (
                                                <a
                                                    href={professional.contacts.maps}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => trackProfessionalEvent(professional.id, 'location_click', { source: 'support_network_specialty_results' })}
                                                    className="flex-1 text-center rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold py-1.5"
                                                >
                                                    Perfil
                                                </a>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}

                            {professionalsForSelectedSpecialty.length === 0 && (
                                <p className="col-span-full text-xs text-gray-500">Nenhum profissional disponível para esta especialidade na sua cidade.</p>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default SupportNetworkPage;
