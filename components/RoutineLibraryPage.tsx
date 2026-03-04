import React, { useEffect, useMemo, useState } from "react";
import type { FamilyLocation, RoutineTemplate } from "../types";
import { ROUTINE_LIBRARY_AREAS } from "../data/routineLibraryData";

interface RoutineLibraryPageProps {
  onClose: () => void;
  templates: RoutineTemplate[];
  familyLocation?: FamilyLocation;
  importedTemplateIds: string[];
  onToggleImport: (templateId: string) => void;
  initialAreaKey?: string;
}

const normalizeText = (value?: string) => String(value || "").trim().toLowerCase();

const matchesLocation = (template: RoutineTemplate, familyLocation?: FamilyLocation) => {
  const isGlobal = !template.uf && !template.cityId;
  if (isGlobal) return true;
  // Sem localização definida: só enxerga rotinas globais.
  if (!familyLocation) return false;
  if (template.uf && template.uf !== familyLocation.uf) return false;
  if (template.cityId && template.cityId !== familyLocation.cityId) return false;
  return true;
};

const RoutineLibraryPage: React.FC<RoutineLibraryPageProps> = ({
  onClose,
  templates,
  familyLocation,
  importedTemplateIds,
  onToggleImport,
  initialAreaKey,
}) => {
  const [selectedArea, setSelectedArea] = useState(initialAreaKey || "all");
  const [searchQuery, setSearchQuery] = useState("");

  const activeTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (template.isActive === false) return false;
        return matchesLocation(template, familyLocation);
      }),
    [templates, familyLocation]
  );

  const areaOptions = useMemo(() => {
    const fallback = [{ key: "all", label: "Todas" }, ...ROUTINE_LIBRARY_AREAS].map((item) => ({
      key: item.key,
      label: item.label,
    }));
    const byKey = new Map<string, string>();
    fallback.forEach((item) => byKey.set(item.key, item.label));
    activeTemplates.forEach((template) => {
      const key = String(template.areaKey || "").trim();
      const label = String(template.areaLabel || "").trim();
      if (!key || !label || byKey.has(key)) return;
      byKey.set(key, label);
    });
    return Array.from(byKey.entries()).map(([key, label]) => ({ key, label }));
  }, [activeTemplates]);

  useEffect(() => {
    if (areaOptions.some((item) => item.key === selectedArea)) return;
    setSelectedArea("all");
  }, [areaOptions, selectedArea]);

  const filteredTemplates = useMemo(() => {
    const byArea = selectedArea === "all"
      ? activeTemplates
      : activeTemplates.filter((template) => String(template.areaKey || "").trim() === selectedArea);
    const query = normalizeText(searchQuery);
    const bySearch = !query
      ? byArea
      : byArea.filter((template) => normalizeText(template.name).includes(query) || normalizeText(template.sponsorNote).includes(query));
    return [...bySearch].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  }, [activeTemplates, selectedArea, searchQuery]);

  return (
    <div className="flex-1 overflow-y-auto w-full max-w-6xl mx-auto animate-in fade-in pb-32">
      <header className="sticky top-0 z-20 bg-gradient-to-b from-purple-700 via-purple-700 to-purple-600 border-b border-purple-500 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-white text-2xl leading-none" aria-label="Voltar">←</button>
        <h1 className="text-lg font-bold text-white">Biblioteca de rotinas</h1>
      </header>

      <div className="px-2 py-3">
        <div className="mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar rotina da biblioteca"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="grid grid-cols-[72px_1fr] gap-1.5 min-h-[68vh]">
          <aside className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {areaOptions.map((area) => (
              <button
                key={area.key}
                type="button"
                onClick={() => setSelectedArea(area.key)}
                className={`w-full text-left px-1.5 py-2.5 text-[11px] border-b border-gray-100 last:border-b-0 ${
                  selectedArea === area.key ? "bg-purple-50 text-purple-700 font-bold" : "text-gray-700"
                }`}
              >
                {area.label}
              </button>
            ))}
          </aside>

          <section className="space-y-2">
            <div className="border border-gray-200 rounded-xl bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-600">Rotinas</p>
                <span className="text-[11px] text-gray-500">{filteredTemplates.length} encontrada(s)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTemplates.map((template) => {
                  const isImported = importedTemplateIds.includes(template.id);
                  return (
                    <article key={template.id} className="rounded-lg border border-gray-200 bg-white p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
                          {template.imageUrl ? (
                            <img src={template.imageUrl} alt={template.name} className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-gray-800 line-clamp-2">{template.name}</p>
                          <p className="text-[10px] text-gray-500">
                            {template.libraryType === "sponsored" ? "Patrocinada" : "Global"}
                          </p>
                        </div>
                      </div>
                      {template.sponsorNote && (
                        <p className="mt-1.5 text-[10px] text-gray-600 line-clamp-2">{template.sponsorNote}</p>
                      )}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => onToggleImport(template.id)}
                          className={`w-full rounded-md py-1.5 text-[11px] font-bold ${
                            isImported
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                              : "bg-purple-600 text-white"
                          }`}
                        >
                          {isImported ? "Importada" : "Importar para minhas rotinas"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {filteredTemplates.length === 0 && (
                  <p className="col-span-full text-xs text-gray-500">Nenhuma rotina disponível para esta área.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RoutineLibraryPage;
