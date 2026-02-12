import React, { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { getCitiesByState, getStates, Municipio, UF } from "../services/ibgeService";

interface ManageMasterDefaultsModalProps {
  onClose: () => void;
  embedded?: boolean;
}

const ManageMasterDefaultsModal: React.FC<ManageMasterDefaultsModalProps> = ({ onClose, embedded = false }) => {
  const {
    supportNetworkProfessionals,
    supportNetworkDefaultMasters,
    updateSupportNetworkDefaultMasters,
  } = useAppContext();

  const [isSaving, setIsSaving] = useState(false);
  const [globalDefaultMasterId, setGlobalDefaultMasterId] = useState<string>(
    supportNetworkDefaultMasters.globalProfessionalId ?? ""
  );
  const [byCityDefaults, setByCityDefaults] = useState<Record<string, string>>(
    supportNetworkDefaultMasters.byCityId || {}
  );
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [selectedUf, setSelectedUf] = useState("");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedMasterId, setSelectedMasterId] = useState("");

  useEffect(() => {
    setGlobalDefaultMasterId(supportNetworkDefaultMasters.globalProfessionalId ?? "");
    setByCityDefaults(supportNetworkDefaultMasters.byCityId || {});
  }, [supportNetworkDefaultMasters]);

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
    if (!selectedCityId) {
      setSelectedMasterId("");
      return;
    }
    setSelectedMasterId(byCityDefaults[selectedCityId] || "");
  }, [selectedCityId, byCityDefaults]);

  const masterOptions = useMemo(() => {
    return supportNetworkProfessionals
      .filter((p) => p.tier === "master" && p.isActive !== false && Boolean((p.videoUrl || "").trim()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [supportNetworkProfessionals]);

  const cityMasterOptions = useMemo(() => {
    if (!selectedUf || !selectedCityId) return [];
    return masterOptions.filter((p) => p.uf === selectedUf && String(p.cityId) === String(selectedCityId));
  }, [masterOptions, selectedUf, selectedCityId]);

  const cityLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    masterOptions.forEach((prof) => {
      if (!prof.cityId) return;
      map[String(prof.cityId)] = `${prof.city || "Cidade"} - ${prof.uf || "UF"}`;
    });
    return map;
  }, [masterOptions]);

  const handleApplyCity = () => {
    if (!selectedCityId) return;
    setByCityDefaults((prev) => {
      const next = { ...prev };
      if (!selectedMasterId) {
        delete next[selectedCityId];
      } else {
        next[selectedCityId] = selectedMasterId;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSupportNetworkDefaultMasters({
        globalProfessionalId: globalDefaultMasterId || null,
        byCityId: byCityDefaults,
      });
      alert("MASTER default atualizado.");
      onClose();
    } catch (err) {
      alert("Falha ao salvar MASTER default.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={embedded ? "w-full" : "fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4"}>
      <div
        className={`bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl flex flex-col ${embedded ? "mx-auto my-0" : ""}`}
        style={{ maxHeight: embedded ? "calc(100vh - 140px)" : "90vh" }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Admin: MASTER Default</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          Configure fallback de MASTER com vídeo: global (todos) e por cidade.
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          <label className="block text-sm font-semibold text-gray-700 mb-2">MASTER default global</label>
          <select
            value={globalDefaultMasterId}
            onChange={(e) => setGlobalDefaultMasterId(e.target.value)}
            className="w-full p-2 border rounded bg-white"
          >
            <option value="">Sem MASTER default global</option>
            {masterOptions.map((prof) => (
              <option key={`global-${prof.id}`} value={prof.id}>
                {prof.name} - {prof.city}/{prof.uf}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-purple-200 bg-purple-50/30 p-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">MASTER default por cidade</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">UF</label>
              <select
                value={selectedUf}
                onChange={(e) => {
                  setSelectedUf(e.target.value);
                  setSelectedCityId("");
                  setSelectedMasterId("");
                }}
                className="w-full p-2 border rounded bg-white"
              >
                <option value="">Selecione UF</option>
                {states.map((uf) => (
                  <option key={uf.sigla} value={uf.sigla}>
                    {uf.sigla} - {uf.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cidade</label>
              <select
                value={selectedCityId}
                onChange={(e) => setSelectedCityId(e.target.value)}
                disabled={!selectedUf}
                className="w-full p-2 border rounded bg-white disabled:bg-gray-100"
              >
                <option value="">{selectedUf ? "Selecione cidade" : "Escolha UF"}</option>
                {cities.map((city) => (
                  <option key={city.id} value={String(city.id)}>
                    {city.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">MASTER com vídeo</label>
              <select
                value={selectedMasterId}
                onChange={(e) => setSelectedMasterId(e.target.value)}
                disabled={!selectedCityId}
                className="w-full p-2 border rounded bg-white disabled:bg-gray-100"
              >
                <option value="">{selectedCityId ? "Sem default para cidade" : "Escolha cidade"}</option>
                {cityMasterOptions.map((prof) => (
                  <option key={`city-${prof.id}`} value={prof.id}>
                    {prof.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleApplyCity}
              disabled={!selectedCityId}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-60"
            >
              Aplicar Cidade
            </button>
          </div>

          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-600 mb-1">Defaults por cidade</div>
            {Object.keys(byCityDefaults).length === 0 ? (
              <p className="text-xs text-gray-500">Nenhuma cidade configurada.</p>
            ) : (
              <ul className="space-y-1 text-xs max-h-40 overflow-y-auto pr-1">
                {Object.entries(byCityDefaults).map(([cityId, profId]) => {
                  const prof = masterOptions.find((p) => p.id === profId);
                  return (
                    <li key={`city-map-${cityId}`} className="flex items-center justify-between gap-2 border rounded px-2 py-1 bg-white">
                      <span>
                        <strong>{cityLabelMap[cityId] || `Cidade ${cityId}`}</strong>: {prof ? prof.name : profId}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setByCityDefaults((prev) => {
                            const next = { ...prev };
                            delete next[cityId];
                            return next;
                          })
                        }
                        className="text-red-600 font-semibold"
                      >
                        remover
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Fechar</button>
          <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold disabled:opacity-60">
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageMasterDefaultsModal;
