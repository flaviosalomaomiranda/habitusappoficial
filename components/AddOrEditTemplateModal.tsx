import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { HabitFlexPeriod, HabitScheduleMode, LeftSwipeActionType, RoutineTemplate } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';
import { getCitiesByState, getStates, Municipio, UF } from '../services/ibgeService';
import { ROUTINE_LIBRARY_AREAS } from '../data/routineLibraryData';

interface AddOrEditTemplateModalProps {
  template: RoutineTemplate | null;
  onClose: () => void;
}

const TEMPLATE_IMAGE_MAX_BYTES = 1_500_000;
const TEMPLATE_IMAGE_WIDTH = 400;
const TEMPLATE_IMAGE_HEIGHT = 400;
const LEFT_ACTION_LABEL_MAX = 40;
const LEFT_ACTION_URL_MAX = 240;
const normalizeAreaKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `area_${Date.now()}`;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao ler imagem.'));
    };
    img.src = url;
  });

const cropToSquareBlob = async (file: File): Promise<Blob> => {
  const source = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = TEMPLATE_IMAGE_WIDTH;
  canvas.height = TEMPLATE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Falha ao preparar imagem.');

  const sourceSize = Math.min(source.width, source.height);
  const sx = Math.max(0, Math.floor((source.width - sourceSize) / 2));
  const sy = Math.max(0, Math.floor((source.height - sourceSize) / 2));

  ctx.drawImage(
    source,
    sx,
    sy,
    sourceSize,
    sourceSize,
    0,
    0,
    TEMPLATE_IMAGE_WIDTH,
    TEMPLATE_IMAGE_HEIGHT
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.9)
  );
  if (!blob) throw new Error('Falha ao gerar imagem final.');
  return blob;
};

const AddOrEditTemplateModal: React.FC<AddOrEditTemplateModalProps> = ({ template, onClose }) => {
  const { addRoutineTemplate, updateRoutineTemplate, deleteRoutineTemplate, settings, routineTemplates } = useAppContext();
  const isEditing = template !== null;

  const [name, setName] = useState(template?.name || '');
  const [sponsorNote, setSponsorNote] = useState(template?.sponsorNote || '');
  const [imageUrl, setImageUrl] = useState(template?.imageUrl || '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [leftSwipeEnabled, setLeftSwipeEnabled] = useState(Boolean(template?.leftSwipeActionType));
  const [leftSwipeActionType, setLeftSwipeActionType] = useState<LeftSwipeActionType>(template?.leftSwipeActionType || 'donation');
  const [leftSwipeActionLabel, setLeftSwipeActionLabel] = useState(template?.leftSwipeActionLabel || '');
  const [leftSwipeActionUrl, setLeftSwipeActionUrl] = useState(template?.leftSwipeActionUrl || '');
  const [leftSwipeActionWhatsapp, setLeftSwipeActionWhatsapp] = useState(template?.leftSwipeActionWhatsapp || '');
  const [uf, setUf] = useState(template?.uf || settings.familyLocation?.uf || '');
  const [cityId, setCityId] = useState(template?.cityId || settings.familyLocation?.cityId || '');
  const [cityName, setCityName] = useState(template?.cityName || settings.familyLocation?.cityName || '');
  const [isGlobal, setIsGlobal] = useState(!template?.uf && !template?.cityId);
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<HabitScheduleMode>(
    template?.schedule?.mode || (template?.schedule?.time ? 'rigid' : 'flex')
  );
  const [scheduleTime, setScheduleTime] = useState(template?.schedule?.time || '07:30');
  const [schedulePeriod, setSchedulePeriod] = useState<HabitFlexPeriod>(template?.schedule?.period || 'morning');
  const [reminderEnabled, setReminderEnabled] = useState(Boolean(template?.schedule?.reminderEnabled));
  const [areaKey, setAreaKey] = useState(template?.areaKey || "");
  const [areaLabel, setAreaLabel] = useState(template?.areaLabel || "");
  const [isNewArea, setIsNewArea] = useState(false);
  const [newAreaLabel, setNewAreaLabel] = useState("");

  const areaOptions = React.useMemo(() => {
    const byKey = new Map<string, string>();
    ROUTINE_LIBRARY_AREAS.forEach((area) => {
      byKey.set(area.key, area.label);
    });
    routineTemplates.forEach((item) => {
      const key = String(item.areaKey || "").trim();
      const label = String(item.areaLabel || "").trim();
      if (!key || !label || byKey.has(key)) return;
      byKey.set(key, label);
    });
    return Array.from(byKey.entries()).map(([key, label]) => ({ key, label }));
  }, [routineTemplates]);

  useEffect(() => {
    let active = true;
    getStates()
      .then((data) => {
        if (!active) return;
        setStates(data);
      })
      .catch(() => {
        if (!active) return;
        setStates([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!uf) {
      setCities([]);
      return () => {
        active = false;
      };
    }
    getCitiesByState(uf)
      .then((data) => {
        if (!active) return;
        setCities(data);
      })
      .catch(() => {
        if (!active) return;
        setCities([]);
      });
    return () => {
      active = false;
    };
  }, [uf]);

  useEffect(() => {
    if (template) return;
    if (areaKey) return;
    const firstArea = areaOptions[0];
    if (!firstArea) return;
    setAreaKey(firstArea.key);
    setAreaLabel(firstArea.label);
  }, [template, areaOptions, areaKey]);

  const handleUpload = async (file: File) => {
    setFormError(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setFormError('Formato invalido. Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > TEMPLATE_IMAGE_MAX_BYTES) {
      setFormError('Arquivo muito grande. Maximo 1.5MB.');
      return;
    }
    try {
      setIsUploading(true);
      const processedImage = await cropToSquareBlob(file);
      const id = template?.id || crypto.randomUUID();
      const fileRef = ref(storage, `routine-templates/${id}-${Date.now()}.webp`);
      await uploadBytes(fileRef, processedImage, { contentType: 'image/webp' });
      const url = await getDownloadURL(fileRef);
      setImageUrl(url);
    } catch {
      setFormError('Falha ao enviar imagem.');
    } finally {
      setIsUploading(false);
    }
  };

  const saveTemplate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Informe o nome da rotina.');
      return;
    }
    if (!imageUrl.trim()) {
      setFormError('Envie uma imagem 400x400.');
      return;
    }
    if (scheduleMode === 'rigid' && !/^\d{2}:\d{2}$/.test(scheduleTime)) {
      setFormError('Informe um horário válido para rotina rígida.');
      return;
    }
    let resolvedAreaKey = areaKey;
    let resolvedAreaLabel = areaLabel;
    if (isNewArea) {
      const label = newAreaLabel.trim();
      if (!label) {
        setFormError('Informe o nome da nova grande área.');
        return;
      }
      resolvedAreaLabel = label;
      resolvedAreaKey = normalizeAreaKey(label);
    }
    if (!resolvedAreaKey || !resolvedAreaLabel) {
      setFormError('Selecione uma grande área para a rotina.');
      return;
    }
    let resolvedUf: string | undefined = undefined;
    let resolvedCityId: string | undefined = undefined;
    let resolvedCityName: string | undefined = undefined;
    let resolvedLeftSwipeActionType: LeftSwipeActionType | undefined = undefined;
    let resolvedLeftSwipeActionLabel: string | undefined = undefined;
    let resolvedLeftSwipeActionUrl: string | undefined = undefined;
    let resolvedLeftSwipeActionWhatsapp: string | undefined = undefined;

    if (!isGlobal) {
      if (!uf) {
        setFormError('Selecione o estado (UF) ou marque como Global.');
        return;
      }
      if (!cityId) {
        setFormError('Selecione a cidade ou marque como Global.');
        return;
      }
      const selectedCity = cities.find((c) => String(c.id) === cityId);
      const city = selectedCity?.nome || cityName || '';
      if (!city) {
        setFormError('Cidade invalida. Selecione novamente.');
        return;
      }
      resolvedUf = uf;
      resolvedCityId = cityId;
      resolvedCityName = city;
    }

    if (leftSwipeEnabled) {
      const trimmedLabel = leftSwipeActionLabel.trim();
      if (!trimmedLabel) {
        setFormError('Informe o texto da ação no swipe para esquerda.');
        return;
      }
      resolvedLeftSwipeActionType = leftSwipeActionType;
      resolvedLeftSwipeActionLabel = trimmedLabel;
      if (leftSwipeActionType === 'whatsapp') {
        const cleanedWhatsapp = leftSwipeActionWhatsapp.replace(/\D/g, '');
        if (cleanedWhatsapp.length < 10) {
          setFormError('WhatsApp inválido. Informe DDD e número.');
          return;
        }
        resolvedLeftSwipeActionWhatsapp = cleanedWhatsapp;
      } else {
        const url = leftSwipeActionUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
          setFormError('URL inválida. Use link iniciando com http:// ou https://.');
          return;
        }
        resolvedLeftSwipeActionUrl = url;
      }
    }

    const templateData: Omit<RoutineTemplate, 'id'> = {
      name: trimmedName,
      imageUrl: imageUrl.trim(),
      sponsorNote: sponsorNote.trim() || undefined,
      leftSwipeActionType: resolvedLeftSwipeActionType,
      leftSwipeActionLabel: resolvedLeftSwipeActionLabel,
      leftSwipeActionUrl: resolvedLeftSwipeActionUrl,
      leftSwipeActionWhatsapp: resolvedLeftSwipeActionWhatsapp,
      isActive,
      areaKey: resolvedAreaKey,
      areaLabel: resolvedAreaLabel,
      libraryType: template?.libraryType === "sponsored" ? "sponsored" : "global",
      schedule: scheduleMode === 'rigid'
        ? {
            type: 'DAILY',
            mode: 'rigid',
            time: scheduleTime,
            reminderEnabled,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
          }
        : {
            type: 'DAILY',
            mode: 'flex',
            period: schedulePeriod,
            reminderEnabled: false,
          },
      uf: resolvedUf,
      cityId: resolvedCityId,
      cityName: resolvedCityName,
    };

    try {
      setIsSaving(true);
      if (isEditing && template) {
        await updateRoutineTemplate({ ...template, ...templateData });
      } else {
        await addRoutineTemplate(templateData);
      }
      onClose();
    } catch {
      setFormError('Falha ao salvar na nuvem. Verifique internet e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (template && window.confirm(`Tem certeza que deseja excluir "${template.name}"?`)) {
      try {
        setIsSaving(true);
        await deleteRoutineTemplate(template.id);
        onClose();
      } catch {
        setFormError('Falha ao excluir na nuvem. Tente novamente.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[51]">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg m-4" style={{ maxHeight: '95vh', overflowY: 'auto' }}>
        <h2 className="text-2xl font-bold mb-6">{isEditing ? 'Editar rotina' : 'Criar rotina'}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Grande área</label>
            <select
              value={isNewArea ? "__new__" : areaKey}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "__new__") {
                  setIsNewArea(true);
                  setAreaKey("");
                  setAreaLabel("");
                  return;
                }
                const selected = areaOptions.find((option) => option.key === value);
                setIsNewArea(false);
                setAreaKey(value);
                setAreaLabel(selected?.label || "");
              }}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Selecione</option>
              {areaOptions.map((option) => (
                <option key={`area-${option.key}`} value={option.key}>
                  {option.label}
                </option>
              ))}
              <option value="__new__">+ Criar nova área</option>
            </select>
          </div>
          {isNewArea && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Nome da nova área</label>
              <input
                type="text"
                value={newAreaLabel}
                onChange={(e) => setNewAreaLabel(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Ex: Desenvolvimento Infantil"
              />
            </div>
          )}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: Escovar os dentes"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Imagem (corte automatico para 400x400)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                if (e.target) e.target.value = '';
              }}
              className="block w-full text-sm text-gray-600"
            />
            {imageUrl && (
              <img src={imageUrl} alt="Prévia do modelo" className="mt-2 w-20 h-20 object-cover rounded-lg border" />
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Texto complementar (opcional)</label>
            <textarea
              value={sponsorNote}
              onChange={(e) => setSponsorNote(e.target.value.slice(0, 60))}
              rows={2}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              placeholder="Ex: Indicação da Instituição [Nome]"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Texto livre curto para não poluir o card. {sponsorNote.length}/60
            </p>
          </div>

          <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
            <label className="block text-gray-700 font-semibold">Horários</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScheduleMode('rigid')}
                className={`p-2 rounded-lg border-2 text-sm font-semibold ${scheduleMode === 'rigid' ? 'border-purple-500 bg-purple-50' : 'bg-white'}`}
              >
                Rígida (horário)
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('flex')}
                className={`p-2 rounded-lg border-2 text-sm font-semibold ${scheduleMode === 'flex' ? 'border-purple-500 bg-purple-50' : 'bg-white'}`}
              >
                Flexível (período)
              </button>
            </div>
            {scheduleMode === 'rigid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Horário</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Ativar lembrete
                </label>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Período</label>
                <select
                  value={schedulePeriod}
                  onChange={(e) => setSchedulePeriod(e.target.value as HabitFlexPeriod)}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="all_day">Todo o dia</option>
                  <option value="morning">Manhã</option>
                  <option value="afternoon">Tarde</option>
                  <option value="night">Noite</option>
                </select>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={leftSwipeEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setLeftSwipeEnabled(checked);
                  if (!checked) {
                    setLeftSwipeActionLabel('');
                    setLeftSwipeActionUrl('');
                    setLeftSwipeActionWhatsapp('');
                    setLeftSwipeActionType('donation');
                  }
                  if (formError) setFormError(null);
                }}
                className="h-4 w-4"
              />
              Ativar ação no swipe para esquerda
            </label>
            {leftSwipeEnabled && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm">Tipo da ação</label>
                  <select
                    value={leftSwipeActionType}
                    onChange={(e) => {
                      setLeftSwipeActionType(e.target.value as LeftSwipeActionType);
                      setLeftSwipeActionUrl('');
                      setLeftSwipeActionWhatsapp('');
                      if (formError) setFormError(null);
                    }}
                    className="w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="donation">Doação</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="url">Link externo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm">Texto da ação</label>
                  <input
                    type="text"
                    value={leftSwipeActionLabel}
                    onChange={(e) => setLeftSwipeActionLabel(e.target.value.slice(0, LEFT_ACTION_LABEL_MAX))}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={leftSwipeActionType === 'donation' ? 'Ex: Ajude e faça sua doação' : leftSwipeActionType === 'whatsapp' ? 'Ex: Agendar consulta' : 'Ex: Saiba mais'}
                  />
                  <p className="mt-1 text-[11px] text-gray-500">{leftSwipeActionLabel.length}/{LEFT_ACTION_LABEL_MAX}</p>
                </div>
                {leftSwipeActionType === 'whatsapp' ? (
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2 text-sm">WhatsApp</label>
                    <input
                      type="text"
                      value={leftSwipeActionWhatsapp}
                      onChange={(e) => setLeftSwipeActionWhatsapp(e.target.value.replace(/[^\d+()\-\s]/g, ''))}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Ex: (69) 99999-9999"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2 text-sm">URL de destino</label>
                    <input
                      type="url"
                      value={leftSwipeActionUrl}
                      onChange={(e) => setLeftSwipeActionUrl(e.target.value.slice(0, LEFT_ACTION_URL_MAX))}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder={leftSwipeActionType === 'donation' ? 'https://checkout...' : 'https://...'}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 bg-gray-50">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsGlobal(checked);
                  if (checked) {
                    setUf('');
                    setCityId('');
                    setCityName('');
                  }
                  if (formError) setFormError(null);
                }}
                className="h-4 w-4"
              />
              Global (mostrar para todos os locais)
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Estado (UF)</label>
              <select
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value);
                  setIsGlobal(false);
                  setCityId('');
                  setCityName('');
                  if (formError) setFormError(null);
                }}
                disabled={isGlobal}
                className="w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Selecione</option>
                {states.map((state) => (
                  <option key={state.id} value={state.sigla}>
                    {state.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Cidade</label>
              <select
                value={cityId}
                onChange={(e) => {
                  const value = e.target.value;
                  setCityId(value);
                  setIsGlobal(false);
                  const selectedCity = cities.find((city) => String(city.id) === value);
                  setCityName(selectedCity?.nome || '');
                  if (formError) setFormError(null);
                }}
                disabled={!uf || isGlobal}
                className="w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
              >
                <option value="">{isGlobal ? 'Global ativo' : uf ? 'Selecione' : 'Escolha UF antes'}</option>
                {cities.map((city) => (
                  <option key={city.id} value={String(city.id)}>
                    {city.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">Status</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              {isActive ? 'Ativo' : 'Inativo'}
            </label>
          </div>

          {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}

          <div className="flex justify-between items-center pt-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => { void handleDelete(); }}
                disabled={isSaving}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-60"
              >
                {isSaving ? 'Processando...' : 'Excluir'}
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUploading || isSaving}
                onClick={() => { void saveTemplate(); }}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60"
              >
                {isSaving ? 'Salvando...' : isEditing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddOrEditTemplateModal;
