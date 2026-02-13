import React, { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { normalizeTag } from "../utils/tagTaxonomy";
import { getCitiesByState, getStates, Municipio, UF } from "../services/ibgeService";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../src/lib/firebase";

interface ManageTagCatalogModalProps {
  onClose: () => void;
  embedded?: boolean;
}

interface ProfileRow {
  uf?: string;
  cityId?: string;
  semanticTags: string[];
}

const ManageTagCatalogModal: React.FC<ManageTagCatalogModalProps> = ({ onClose, embedded = false }) => {
  const { tagTaxonomy, suggestedTagCandidates, tagSuggestionThreshold, updateTagTaxonomy } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [selectedUf, setSelectedUf] = useState("");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  useEffect(() => {
    getStates().then(setStates).catch(() => setStates([]));
  }, []);

  useEffect(() => {
    if (!selectedUf) {
      setCities([]);
      setSelectedCityId("");
      return;
    }
    getCitiesByState(selectedUf).then(setCities).catch(() => setCities([]));
  }, [selectedUf]);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsub = onSnapshot(usersRef, (snap) => {
      const rows: ProfileRow[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uf: data?.profile?.city?.uf,
          cityId: data?.profile?.city?.cityId ? String(data.profile.city.cityId) : undefined,
          semanticTags: Array.isArray(data?.profile?.semanticTags) ? data.profile.semanticTags : [],
        };
      });
      setProfiles(rows);
    });
    return () => unsub();
  }, []);

  const officialTags = useMemo(
    () => [...tagTaxonomy.officialTags].sort((a, b) => a.localeCompare(b)),
    [tagTaxonomy.officialTags]
  );

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (selectedUf && p.uf !== selectedUf) return false;
      if (selectedCityId && p.cityId !== selectedCityId) return false;
      return true;
    });
  }, [profiles, selectedUf, selectedCityId]);

  const topLocalTags = useMemo(() => {
    const counter = new Map<string, number>();
    filteredProfiles.forEach((p) => {
      const unique = new Set((p.semanticTags || []).map((t) => normalizeTag(t)).filter(Boolean));
      unique.forEach((tag) => counter.set(tag, (counter.get(tag) || 0) + 1));
    });
    return Array.from(counter.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 10);
  }, [filteredProfiles]);

  const promoteTag = async (tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    if (tagTaxonomy.officialTags.includes(normalized)) return;
    setIsSaving(true);
    try {
      await updateTagTaxonomy({
        officialTags: Array.from(new Set([...tagTaxonomy.officialTags, normalized])),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const removeOfficialTag = async (tag: string) => {
    setIsSaving(true);
    try {
      await updateTagTaxonomy({
        officialTags: tagTaxonomy.officialTags.filter((t) => t !== tag),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addOfficialTag = async () => {
    const normalized = normalizeTag(newTag);
    if (!normalized) return;
    setNewTag("");
    await promoteTag(normalized);
  };

  return (
    <div className={embedded ? "w-full" : "fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4"}>
      <div
        className={`bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl flex flex-col ${embedded ? "mx-auto my-0" : ""}`}
        style={{ maxHeight: embedded ? "calc(100vh - 140px)" : "90vh" }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Admin: Catálogo de Tags</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_0.9fr] gap-4 overflow-y-auto pr-1">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Tags oficiais</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="#nova_tag"
                className="flex-1 p-2 border rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={addOfficialTag}
                disabled={isSaving}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold disabled:opacity-60"
              >
                Adicionar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {officialTags.map((tag) => (
                <button
                  key={`official-${tag}`}
                  type="button"
                  onClick={() => removeOfficialTag(tag)}
                  disabled={isSaving}
                  className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-60"
                  title="Remover da lista oficial"
                >
                  {tag} ×
                </button>
              ))}
              {officialTags.length === 0 && <p className="text-xs text-gray-500">Nenhuma tag oficial.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <h3 className="text-sm font-bold text-amber-800 mb-1">Tags altamente sugeridas</h3>
            <p className="text-xs text-amber-700 mb-2">
              Regra dinâmica: mínimo <strong>{tagSuggestionThreshold.minUsers}</strong> usuários distintos e{" "}
              <strong>{tagSuggestionThreshold.minOccurrences}</strong> ocorrências.
            </p>
            <p className="text-[11px] text-amber-700 mb-3">Base atual: {tagSuggestionThreshold.totalUsers} usuários.</p>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {suggestedTagCandidates.map((item) => (
                <div key={`suggested-${item.tag}`} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-2">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{item.tag}</span>
                    <span className="ml-2 text-xs text-gray-500">freq: {item.count}</span>
                    <span className="ml-2 text-xs text-gray-500">usuários: {item.distinctUsers || 0}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => promoteTag(item.tag)}
                    disabled={isSaving}
                    className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                  >
                    Tornar oficial
                  </button>
                </div>
              ))}
              {suggestedTagCandidates.length === 0 && (
                <p className="text-xs text-gray-500">Sem sugestões no momento.</p>
              )}
            </div>
          </section>

          <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Painel de uso (tempo real)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Usuários totais</span>
                <span className="font-bold text-gray-800">{profiles.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Usuários filtrados</span>
                <span className="font-bold text-gray-800">{filteredProfiles.length}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-gray-600">UF</label>
              <select
                value={selectedUf}
                onChange={(e) => {
                  setSelectedUf(e.target.value);
                  setSelectedCityId("");
                }}
                className="w-full p-2 border rounded bg-white text-sm"
              >
                <option value="">Todas</option>
                {states.map((uf) => (
                  <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>
                ))}
              </select>

              <label className="block text-xs font-semibold text-gray-600">Cidade</label>
              <select
                value={selectedCityId}
                onChange={(e) => setSelectedCityId(e.target.value)}
                disabled={!selectedUf}
                className="w-full p-2 border rounded bg-white text-sm disabled:bg-gray-100"
              >
                <option value="">{selectedUf ? "Todas" : "Escolha UF"}</option>
                {cities.map((city) => (
                  <option key={city.id} value={String(city.id)}>{city.nome}</option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-600 mb-2">Top tags no filtro</div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {topLocalTags.map((item) => (
                  <div key={`local-tag-${item.tag}`} className="flex items-center justify-between text-xs rounded-md bg-white border border-gray-200 px-2 py-1">
                    <span className="font-medium text-gray-700">{item.tag}</span>
                    <span className="text-gray-500">{item.count}</span>
                  </div>
                ))}
                {topLocalTags.length === 0 && <p className="text-xs text-gray-500">Sem dados no filtro.</p>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ManageTagCatalogModal;
