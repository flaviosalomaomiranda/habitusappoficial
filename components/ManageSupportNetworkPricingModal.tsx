import React, { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { ProfessionalTier, SupportNetworkPricing } from "../types";

interface ManageSupportNetworkPricingModalProps {
  onClose: () => void;
  embedded?: boolean;
}

const tierLabels: Record<ProfessionalTier, string> = {
  verified: "Listado",
  top: "Pro (Rodízio)",
  exclusive: "Exclusivo (1 por Especialidade)",
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
    updateSupportNetworkPricing,
    supportNetworkProfessionals,
    settings,
    setDefaultMasterProfessionalId,
  } = useAppContext();
  const [plans, setPlans] = useState<SupportNetworkPricing["plans"]>(supportNetworkPricing?.plans || emptyPlans);
  const [defaultMasterProfessionalId, setDefaultMasterProfessionalIdState] = useState<string>(
    settings.defaultMasterProfessionalId ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPlans(supportNetworkPricing?.plans || emptyPlans);
  }, [supportNetworkPricing]);

  useEffect(() => {
    setDefaultMasterProfessionalIdState(settings.defaultMasterProfessionalId ?? "");
  }, [settings.defaultMasterProfessionalId]);

  const defaultMasterOptions = useMemo(() => {
    return supportNetworkProfessionals
      .filter((p) => p.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [supportNetworkProfessionals]);

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
          <label className="block text-sm font-semibold text-gray-700 mb-2">MASTER default (quando não houver MASTER ativo)</label>
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
