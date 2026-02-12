import React, { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { ProfessionalTier, SupportNetworkPricing } from "../types";

interface ManageSupportNetworkPricingModalProps {
  onClose: () => void;
  embedded?: boolean;
}

const tierLabels: Record<ProfessionalTier, string> = {
  verified: "Lista Vip",
  top: "Pro (Rodízio)",
  exclusive: "Premium (1 por Especialidade)",
  master: "Master (1 por Cidade)",
};

const emptyPlans: SupportNetworkPricing["plans"] = {
  verified: { monthly: 0, annual: 0 },
  top: { monthly: 0, annual: 0 },
  exclusive: { monthly: 0, annual: 0 },
  master: { monthly: 0, annual: 0 },
};

const ManageSupportNetworkPricingModal: React.FC<ManageSupportNetworkPricingModalProps> = ({ onClose, embedded = false }) => {
  const {
    supportNetworkPricing,
    supportNetworkDefaultMasters,
    updateSupportNetworkPricing,
    updateSupportNetworkDefaultMasters,
    supportNetworkProfessionals,
    settings,
    setDefaultMasterProfessionalId,
  } = useAppContext();
  const [plans, setPlans] = useState<SupportNetworkPricing["plans"]>(supportNetworkPricing?.plans || emptyPlans);
  const [defaultMasterProfessionalId, setDefaultMasterProfessionalIdState] = useState<string>(
    settings.defaultMasterProfessionalId ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [globalDefaultMasterId, setGlobalDefaultMasterId] = useState<string>(
    supportNetworkDefaultMasters.globalProfessionalId ?? ""
  );
  const [byUfDefaults, setByUfDefaults] = useState<Record<string, string>>(supportNetworkDefaultMasters.byUf || {});
  const [selectedUfForDefault, setSelectedUfForDefault] = useState<string>("");
  const [selectedMasterForUf, setSelectedMasterForUf] = useState<string>("");

  useEffect(() => {
    setPlans(supportNetworkPricing?.plans || emptyPlans);
  }, [supportNetworkPricing]);

  useEffect(() => {
    setDefaultMasterProfessionalIdState(settings.defaultMasterProfessionalId ?? "");
  }, [settings.defaultMasterProfessionalId]);

  useEffect(() => {
    setGlobalDefaultMasterId(supportNetworkDefaultMasters.globalProfessionalId ?? "");
    setByUfDefaults(supportNetworkDefaultMasters.byUf || {});
  }, [supportNetworkDefaultMasters]);

  const defaultMasterOptions = useMemo(() => {
    return supportNetworkProfessionals
      .filter((p) => p.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [supportNetworkProfessionals]);
  const availableUfs = useMemo(
    () => Array.from(new Set(defaultMasterOptions.map((p) => p.uf).filter(Boolean))).sort(),
    [defaultMasterOptions]
  );
  const ufMasterOptions = useMemo(
    () => defaultMasterOptions.filter((p) => p.uf === selectedUfForDefault),
    [defaultMasterOptions, selectedUfForDefault]
  );

  const handleChange = (tier: ProfessionalTier, field: "monthly" | "annual", value: string) => {
    const numeric = value === "" ? 0 : Number(value);
    setPlans((prev) => ({
      ...prev,
      [tier]: { ...prev[tier], [field]: Number.isNaN(numeric) ? 0 : numeric },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSupportNetworkPricing(plans);
      await setDefaultMasterProfessionalId(defaultMasterProfessionalId || null);
      await updateSupportNetworkDefaultMasters({
        globalProfessionalId: globalDefaultMasterId || null,
        byUf: byUfDefaults,
      });
      alert("Precificação atualizada.");
      onClose();
    } catch (err) {
      alert("Falha ao salvar precificação.");
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
          <h2 className="text-2xl font-bold">Admin: Precificação dos Planos</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          Esses valores ficam disponíveis apenas para Admin e são usados para preencher automaticamente as fichas de profissionais.
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">MASTER default da família (legado)</label>
          <select
            value={defaultMasterProfessionalId}
            onChange={(e) => setDefaultMasterProfessionalIdState(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Sem MASTER default</option>
            {defaultMasterOptions.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.name} - {prof.city}/{prof.uf}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          <label className="block text-sm font-semibold text-gray-700 mb-2">MASTER default global (todos estados/cidades)</label>
          <select
            value={globalDefaultMasterId}
            onChange={(e) => setGlobalDefaultMasterId(e.target.value)}
            className="w-full p-2 border rounded bg-white"
          >
            <option value="">Sem MASTER default global</option>
            {defaultMasterOptions.map((prof) => (
              <option key={`global-${prof.id}`} value={prof.id}>
                {prof.name} - {prof.city}/{prof.uf}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">UF</label>
              <select value={selectedUfForDefault} onChange={(e) => setSelectedUfForDefault(e.target.value)} className="w-full p-2 border rounded bg-white">
                <option value="">Selecione UF</option>
                {availableUfs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">MASTER default da UF</label>
              <select value={selectedMasterForUf} onChange={(e) => setSelectedMasterForUf(e.target.value)} disabled={!selectedUfForDefault} className="w-full p-2 border rounded bg-white disabled:bg-gray-100">
                <option value="">{selectedUfForDefault ? "Selecione profissional" : "Escolha UF"}</option>
                {ufMasterOptions.map((prof) => (
                  <option key={`uf-${prof.id}`} value={prof.id}>
                    {prof.name} - {prof.city}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!selectedUfForDefault}
              onClick={() => {
                if (!selectedUfForDefault) return;
                setByUfDefaults((prev) => {
                  const next = { ...prev };
                  if (!selectedMasterForUf) delete next[selectedUfForDefault];
                  else next[selectedUfForDefault] = selectedMasterForUf;
                  return next;
                });
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60"
            >
              Aplicar UF
            </button>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-600 mb-1">Defaults por estado</div>
            {Object.keys(byUfDefaults).length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum estado configurado.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {Object.entries(byUfDefaults).map(([uf, profId]) => {
                  const prof = defaultMasterOptions.find((p) => p.id === profId);
                  return (
                    <li key={`map-${uf}`} className="flex items-center justify-between gap-2 border rounded px-2 py-1 bg-white">
                      <span><strong>{uf}</strong>: {prof ? `${prof.name} (${prof.city})` : profId}</span>
                      <button
                        type="button"
                        onClick={() => setByUfDefaults((prev) => {
                          const next = { ...prev };
                          delete next[uf];
                          return next;
                        })}
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
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Observação: o plano Master é válido por 14 dias. O valor informado é referente a 14 dias. No pacote anual, o total corresponde a 20x o valor praticado.
        </div>

        <div className="overflow-y-auto pr-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2">Plano</th>
                <th className="p-2">Mensal (R$) - pode ser recorrente ou não</th>
                <th className="p-2">Anual (R$) - pagamento à vista com desconto</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(tierLabels) as ProfessionalTier[]).map((tier) => (
                <tr key={tier} className="border-b">
                  <td className="p-2 font-semibold">{tierLabels[tier]}</td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={plans[tier]?.monthly ?? 0}
                      onChange={(e) => handleChange(tier, "monthly", e.target.value)}
                      className="p-2 border rounded w-full"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={plans[tier]?.annual ?? 0}
                      onChange={(e) => handleChange(tier, "annual", e.target.value)}
                      className="p-2 border rounded w-full"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default ManageSupportNetworkPricingModal;
