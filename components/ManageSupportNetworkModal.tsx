
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { ExclusiveRoutineTemplate, Manager, Professional } from '../types';
import { getStates, getCitiesByState, UF, Municipio } from '../services/ibgeService';
import { SPECIALTIES } from '../data/supportNetworkData';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../src/lib/firebase';

interface ManageSupportNetworkModalProps {
    onClose: () => void;
    embedded?: boolean;
}

const PROFILE_IMAGE_MAX_BYTES = 1_500_000;
const PROFILE_IMAGE_ALLOWED_SIZES = [
    { width: 400, height: 400 },
    { width: 600, height: 600 },
];

const GALLERY_IMAGE_MAX_BYTES = 2_000_000;
const GALLERY_MIN_WIDTH = 800;
const GALLERY_MIN_HEIGHT = 600;

const MASTER_VIDEO_MAX_BYTES = 20_000_000;
const MASTER_VIDEO_MAX_SECONDS = 16;
const MASTER_VIDEO_WIDTH = 1920;
const MASTER_VIDEO_HEIGHT = 1080;

const MAX_SPECIALTIES = 5;
const MAX_OTHER_SPECIALTIES = 3;
const BIO_MAX_CHARS = 180;

const formatBytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)}MB`;
const countChars = (text: string) => text.length;
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

const addMonthsToIsoDate = (dateStr: string, months: number) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const base = new Date(y, (m || 1) - 1, d || 1);
    base.setMonth(base.getMonth() + months);
    const yy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
};

const getTierLabel = (tier?: string) => {
    if (tier === "master") return "MASTER";
    if (tier === "exclusive") return "EXCLUSIVO";
    if (tier === "top") return "PRO";
    return "LISTADO";
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
        settings, 
        setAdminPin,
        checkAdminPin,
        deleteProfessional,
        managerProfile,
        isManager
    } = useAppContext();
    
    const [isAuthenticated, setIsAuthenticated] = useState(!settings.adminPin || isManager);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const todayStr = new Date().toISOString().slice(0, 10);
    const [restProfessionals, setRestProfessionals] = useState<Professional[]>([]);
    const [filterUf, setFilterUf] = useState("");
    const [filterTier, setFilterTier] = useState<"" | "master" | "top" | "exclusive" | "verified">("");
    const [reportProfessional, setReportProfessional] = useState<Professional | null>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchSupportNetwork = async () => {
            try {
                const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
                const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
                if (!projectId || !apiKey) return;
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
                if (!response.ok) return;
                const raw = await response.json();
                if (!Array.isArray(raw)) return;
                const docs = raw
                    .map(parseFirestoreDocToProfessional)
                    .filter((item): item is Professional => Boolean(item));
                if (cancelled || docs.length === 0) return;
                setRestProfessionals(docs);
            } catch {
                // fallback silencioso: mantém a lista atual do contexto
            }
        };
        fetchSupportNetwork();
        return () => {
            cancelled = true;
        };
    }, []);

    const professionalsForAdmin = supportNetworkProfessionals.length > 0 ? supportNetworkProfessionals : restProfessionals;
    const availableUfs = Array.from(new Set(professionalsForAdmin.map((p) => p.uf).filter(Boolean))).sort();

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
                className={`bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl m-4 flex flex-col ${embedded ? "mx-auto my-0" : ""}`}
                style={{ maxHeight: embedded ? 'calc(100vh - 140px)' : '90vh' }}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Admin: Rede de Serviços Profissionais</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                
                <div className="flex flex-wrap gap-2 border-b pb-4 mb-4">
                    <button onClick={() => { setEditingProfessional(null); setIsFormOpen(true); }} className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold">Adicionar Profissional</button>
                    <button onClick={handleBackup} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700">Backup</button>
                    {!isManager && (
                        <button onClick={handlePublishToCloud} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold">Publicar na nuvem</button>
                    )}
                    {!isManager && (
                        <>
                            <button onClick={handleUploadClick} className="px-4 py-2 bg-orange-500 text-white rounded-lg font-semibold">Upload de arquivo</button>
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
                        <option value="master">MASTER</option>
                        <option value="top">PRO</option>
                        <option value="exclusive">EXCLUSIVO</option>
                        <option value="verified">LISTADO</option>
                    </select>
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
                
                <div className="flex-grow overflow-y-auto pr-2">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr><th className="p-2">Nome</th><th>Cidade/UF</th><th>Especialidades</th><th>Categoria</th><th>Status</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                            {professionalsForAdmin
                                .filter((prof) => {
                                    if (!isManager || !managerProfile) return true;
                                    return prof.uf === managerProfile.uf && managerProfile.cityIds.includes(String(prof.cityId));
                                })
                                .filter((prof) => !filterUf || prof.uf === filterUf)
                                .filter((prof) => !filterTier || prof.tier === filterTier)
                                .map(prof => (
                                <tr key={prof.id} className="border-b hover:bg-gray-50">
                                    <td className="p-2 font-medium">{prof.name}</td>
                                    <td>{prof.city}/{prof.uf}</td>
                                    <td>{(prof.specialties || []).join(", ") || prof.specialty}</td>
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
        if (type === "routine_import") return "Clique em Rotinas Personalizadas";
        return type;
    };

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
                            <div className="bg-purple-50 rounded-lg p-3"><div className="text-[11px] text-gray-500">Rotinas</div><div className="text-lg font-bold">{stats.routineImportClicks || 0}</div></div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2">Últimos eventos</h4>
                            {events.length === 0 ? (
                                <p className="text-sm text-gray-500">Sem eventos ainda.</p>
                            ) : (
                                <ul className="space-y-1 text-sm">
                                    {events.slice(0, 20).map((evt, idx) => {
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

    const [formState, setFormState] = useState<Partial<Professional>>(
        professional
            ? { ...professional, specialties: professional.specialties || (professional.specialty ? [professional.specialty] : []) }
            : emptyState
    );
    const [keywordText, setKeywordText] = useState("");
    const [highlightsText, setHighlightsText] = useState("");
    const [exclusiveRoutinesText, setExclusiveRoutinesText] = useState("");
    const [otherSpecialtiesText, setOtherSpecialtiesText] = useState("");
    const [otherLinksText, setOtherLinksText] = useState("");
    const [states, setStates] = useState<UF[]>([]);
    const [cities, setCities] = useState<Municipio[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [masterMonth, setMasterMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const todayStr = new Date().toISOString().slice(0, 10);

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
            setFormState({ ...professional, specialties: baseSpecialties });
            setKeywordText((professional.spotlightKeywords || []).join(", "));
            setHighlightsText((professional.highlights || []).join(", "));
            setExclusiveRoutinesText(
                (professional.exclusiveRoutines || [])
                    .map((routine) => `${routine.name} | ${routine.diamonds}`)
                    .join("\n")
            );
            const other = baseSpecialties.filter((s) => !SPECIALTIES.includes(s));
            setOtherSpecialtiesText(other.join(", "));
            setOtherLinksText((professional.contacts?.otherLinks || []).join("\n"));
        } else {
            setFormState({
                ...emptyState,
                uf: managerProfile?.uf || "",
            });
            setKeywordText("");
            setHighlightsText("");
            setExclusiveRoutinesText("");
            setOtherSpecialtiesText("");
            setOtherLinksText("");
        }
    }, [professional, managerProfile?.uf]);

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

    const uploadImage = async (file: File, path: string) => {
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file, { contentType: file.type });
        return getDownloadURL(fileRef);
    };

    const handleProfileUpload = async (file: File) => {
        setUploadError(null);
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            setUploadError('Formato inválido. Use JPG, PNG ou WebP.');
            return;
        }
        if (file.size > PROFILE_IMAGE_MAX_BYTES) {
            setUploadError(`Arquivo grande demais. Máximo ${formatBytes(PROFILE_IMAGE_MAX_BYTES)}.`);
            return;
        }
        try {
            setIsUploading(true);
            const { width, height } = await getImageDimensions(file);
            const isAllowedSize = PROFILE_IMAGE_ALLOWED_SIZES.some(
                (size) => width === size.width && height === size.height
            );
            if (!isAllowedSize) {
                setUploadError("A foto de perfil precisa ter 400x400px ou 600x600px.");
                return;
            }
            const id = professional?.id || crypto.randomUUID();
            const url = await uploadImage(file, `support-network/profiles/${id}-${Date.now()}`);
            setFormState(p => ({ ...p, photoUrl: url }));
        } catch (err) {
            setUploadError('Falha ao enviar a foto.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleGalleryUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploadError(null);
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        try {
            setIsUploading(true);
            const uploadedUrls: string[] = [];
            const id = professional?.id || crypto.randomUUID();
            for (const file of Array.from(files)) {
                if (!allowed.includes(file.type)) {
                    setUploadError('Formato inválido. Use JPG, PNG ou WebP.');
                    return;
                }
                if (file.size > GALLERY_IMAGE_MAX_BYTES) {
                    setUploadError(`Arquivo grande demais. Máximo ${formatBytes(GALLERY_IMAGE_MAX_BYTES)}.`);
                    return;
                }
                const { width, height } = await getImageDimensions(file);
                if (width < GALLERY_MIN_WIDTH || height < GALLERY_MIN_HEIGHT) {
                    setUploadError(`A galeria precisa ter no mínimo ${GALLERY_MIN_WIDTH}x${GALLERY_MIN_HEIGHT}px.`);
                    return;
                }
                const url = await uploadImage(file, `support-network/gallery/${id}-${Date.now()}-${file.name}`);
                uploadedUrls.push(url);
            }
            setFormState(p => ({ ...p, galleryUrls: [...(p.galleryUrls || []), ...uploadedUrls] }));
        } catch (err) {
            setUploadError('Falha ao enviar imagens da galeria.');
        } finally {
            setIsUploading(false);
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
            const url = await uploadImage(file, `support-network/videos/${id}-${Date.now()}.mp4`);
            setFormState(p => ({ ...p, videoUrl: url }));
        } catch (err) {
            setUploadError("Falha ao enviar o vídeo.");
        } finally {
            setIsUploading(false);
        }
    };

    const removeGalleryImage = (url: string) => {
        setFormState(p => ({ ...p, galleryUrls: (p.galleryUrls || []).filter(u => u !== url) }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cityObj = cities.find(c => String(c.id) === formState.cityId);
        if (!cityObj) return alert('Cidade inválida!');
        if (isManager && managerProfile) {
            if (formState.uf !== managerProfile.uf) return alert("UF fora da sua área.");
            if (!managerProfile.cityIds.includes(String(formState.cityId))) return alert("Cidade fora da sua área.");
        }
        
        if (isUploading) return alert("Aguarde o upload terminar.");
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
        if (!formState.contacts?.email?.trim()) return alert("Informe o e-mail principal.");

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
        const otherSpecialties = otherSpecialtiesText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (otherSpecialties.length > MAX_OTHER_SPECIALTIES) {
            return alert(`Você pode adicionar no máximo ${MAX_OTHER_SPECIALTIES} especialidades em "Outras".`);
        }
        const specialties = Array.from(new Set([...baseSpecialties, ...otherSpecialties]));
        if (specialties.length === 0) return alert("Selecione pelo menos 1 especialidade.");

        const galleryUrls = formState.galleryUrls || [];
        if (galleryUrls.length > 0 && galleryUrls.length < 3) {
            const proceed = window.confirm("Recomendamos pelo menos 3 fotos na galeria. Deseja continuar mesmo assim?");
            if (!proceed) return;
        }

        const spotlightKeywords = keywordText
            .split(",")
            .map((kw) => kw.trim().toLowerCase())
            .filter(Boolean);

        const highlights = highlightsText
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean);

        const exclusiveRoutines: ExclusiveRoutineTemplate[] = exclusiveRoutinesText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
                const [nameRaw, diamondsRaw] = line.split("|").map((item) => item?.trim() || "");
                const diamonds = Number(diamondsRaw || "0");
                return {
                    id: `routine-${idx + 1}`,
                    name: nameRaw,
                    diamonds: Number.isNaN(diamonds) ? 0 : diamonds,
                };
            })
            .filter((item) => item.name.length > 0);

        if (formState.tier === "exclusive") {
            if (exclusiveRoutines.length === 0) {
                return alert("Informe pelo menos 1 rotina personalizada para o Exclusivo.");
            }
            if (exclusiveRoutines.length > 10) {
                return alert("O Exclusivo pode ter no máximo 10 rotinas personalizadas.");
            }
            if (exclusiveRoutines.some((item) => item.diamonds <= 0)) {
                return alert("Cada rotina personalizada deve ter diamantes maiores que zero.");
            }
        }

        if (formState.tier === "exclusive" && spotlightKeywords.length === 0) {
            return alert("Informe palavras-chave para o Exclusivo.");
        }

        const data = {
            ...formState,
            city: cityObj.nome,
            galleryUrls,
            specialties,
            specialty: specialties[0],
            highlights,
            spotlightKeywords,
            spotlightDailyLimit: formState.spotlightDailyLimit || 2,
            paymentPrice: formState.paymentPrice ? Number(formState.paymentPrice) : undefined,
            exclusiveRoutines: formState.tier === "exclusive" ? exclusiveRoutines : [],
        } as Professional;
        
        // Regras de Unicidade
        if (data.tier === 'master') {
            const existing = supportNetworkProfessionals.find(p => p.tier === 'master' && p.cityId === data.cityId && p.id !== data.id && p.isActive);
            if (existing && !window.confirm(`Já existe um Master em ${data.city} (${existing.name}). Deseja rebaixar o atual para Listado e assumir como Master?`)) return;
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
                if (!window.confirm(`Já existe Exclusivo para esta(s) especialidade(s) em ${data.city}:\n${names}\n\nDeseja substituir?`)) return;
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
                                placeholder="CPF"
                                inputMode="numeric"
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
                        <input name="addressStreet" value={formState.addressStreet || ''} onChange={handleChange} placeholder="Rua / Avenida" className="p-2 border rounded col-span-2" />
                        <input name="addressNumber" value={formState.addressNumber || ''} onChange={handleChange} placeholder="Número" className="p-2 border rounded" />
                        <input name="addressComplement" value={formState.addressComplement || ''} onChange={handleChange} placeholder="Complemento" className="p-2 border rounded" />
                        <input name="addressReference" value={formState.addressReference || ''} onChange={handleChange} placeholder="Referência" className="p-2 border rounded col-span-2" />
                        <input name="addressNeighborhood" value={formState.addressNeighborhood || ''} onChange={handleChange} placeholder="Bairro" className="p-2 border rounded" />
                        <input
                            name="addressCep"
                            value={formState.addressCep || ''}
                            onChange={(e) => setFormState(p => ({ ...p, addressCep: formatCep(e.target.value) }))}
                            placeholder="CEP"
                            inputMode="numeric"
                            className="p-2 border rounded"
                        />
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
                        <input name="contacts.email" value={formState.contacts?.email || ''} onChange={handleChange} placeholder="E-mail principal" className="p-2 border rounded" />

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
                            <div className="text-[11px] text-gray-500 mt-2">Outras especialidades (separe por vírgula, máx. {MAX_OTHER_SPECIALTIES})</div>
                            <input
                                value={otherSpecialtiesText}
                                onChange={(e) => setOtherSpecialtiesText(e.target.value)}
                                placeholder="Ex: Clínica geral, Hospital"
                                className="mt-1 p-2 border rounded w-full text-xs"
                            />
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
                            <option value="verified">Listado</option>
                            <option value="top">Pro (Rodízio)</option>
                            <option value="exclusive">Exclusivo (1 por Especialidade)</option>
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
                              <div className="text-xs font-semibold text-gray-500 mb-1">Foto de perfil (400x400px ou 600x600px, até {formatBytes(PROFILE_IMAGE_MAX_BYTES)})</div>
                              <div className="flex flex-wrap items-center gap-3">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleProfileUpload(file);
                                        if (e.target) e.target.value = '';
                                    }}
                                    className="text-xs"
                                />
                                {formState.photoUrl && (
                                    <div className="flex items-center gap-2">
                                        <img src={formState.photoUrl} alt="Foto de perfil" className="w-16 h-16 rounded-full object-cover border" />
                                        <button type="button" onClick={() => setFormState(p => ({ ...p, photoUrl: '' }))} className="text-xs text-red-600">Remover</button>
                                    </div>
                                )}
                              </div>
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
                                placeholder="Palavras-chave para aparecer (separe por virgula)"
                                className="p-2 border rounded col-span-2"
                            />
                            <input
                                name="spotlightDailyLimit"
                                type="number"
                                min={1}
                                max={5}
                                value={formState.spotlightDailyLimit ?? 2}
                                onChange={handleChange}
                                placeholder="Limite por dia"
                                className="p-2 border rounded"
                            />
                            <div className="col-span-2">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Rotinas personalizadas (máximo 10) - formato: Nome da rotina | Diamantes</div>
                                <textarea
                                    value={exclusiveRoutinesText}
                                    onChange={(e) => setExclusiveRoutinesText(e.target.value)}
                                    placeholder={"Rotina da manhã | 10\nRotina de estudos | 15"}
                                    className="p-2 border rounded w-full h-28"
                                />
                                <p className="text-[11px] text-gray-500 mt-1">Cada linha representa uma rotina personalizada do profissional EXCLUSIVO.</p>
                            </div>
                        </div>
                    )}


                    <input name="headline" value={formState.headline || ''} onChange={handleChange} placeholder="Headline / Assunto do Mês (Destaque)" className="p-2 border rounded w-full" />
                    <div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Bio curta</span>
                            <span>{countChars(formState.bio || "")}/{BIO_MAX_CHARS} caracteres</span>
                        </div>
                        <textarea name="bio" value={formState.bio || ''} onChange={handleChange} placeholder="Bio curta" className="p-2 border rounded w-full h-20"></textarea>
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

                    <div>
                        <div className="text-xs font-semibold text-gray-500 mb-1">Fotos da galeria (mín. 3, {GALLERY_MIN_WIDTH}x{GALLERY_MIN_HEIGHT}px, até {formatBytes(GALLERY_IMAGE_MAX_BYTES)})</div>
                        <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                                handleGalleryUpload(e.target.files);
                                if (e.target) e.target.value = '';
                            }}
                            className="text-xs"
                        />
                        {(formState.galleryUrls || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {(formState.galleryUrls || []).map((url) => (
                                    <div key={url} className="relative">
                                        <img src={url} alt="Galeria" className="w-20 h-14 object-cover rounded border" />
                                        <button
                                            type="button"
                                            onClick={() => removeGalleryImage(url)}
                                            className="absolute -top-2 -right-2 bg-white text-red-600 border rounded-full w-5 h-5 text-[10px] leading-4"
                                            aria-label="Remover foto"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
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



