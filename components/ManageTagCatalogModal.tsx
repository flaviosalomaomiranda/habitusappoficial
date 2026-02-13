import React, { useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { normalizeTag } from "../utils/tagTaxonomy";

interface ManageTagCatalogModalProps {
  onClose: () => void;
  embedded?: boolean;
}

const ManageTagCatalogModal: React.FC<ManageTagCatalogModalProps> = ({ onClose, embedded = false }) => {
  const { tagTaxonomy, suggestedTagCandidates, updateTagTaxonomy } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [newTag, setNewTag] = useState("");

  const officialTags = useMemo(
    () => [...tagTaxonomy.officialTags].sort((a, b) => a.localeCompare(b)),
    [tagTaxonomy.officialTags]
  );

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
        className={`bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl flex flex-col ${embedded ? "mx-auto my-0" : ""}`}
        style={{ maxHeight: embedded ? "calc(100vh - 140px)" : "90vh" }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Admin: Catálogo de Tags</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1">
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
            <p className="text-xs text-amber-700 mb-3">
              Lista automática baseada em frequência de uso nas rotinas, recompensas, produtos e perfis.
            </p>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {suggestedTagCandidates.map((item) => (
                <div key={`suggested-${item.tag}`} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-2">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{item.tag}</span>
                    <span className="ml-2 text-xs text-gray-500">freq: {item.count}</span>
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
        </div>
      </div>
    </div>
  );
};

export default ManageTagCatalogModal;
