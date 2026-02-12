import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { RoutineTemplate } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';
import { getCitiesByState, getStates, Municipio, UF } from '../services/ibgeService';

interface AddOrEditTemplateModalProps {
  template: RoutineTemplate | null;
  onClose: () => void;
}

const TEMPLATE_IMAGE_MAX_BYTES = 1_500_000;
const TEMPLATE_IMAGE_WIDTH = 400;
const TEMPLATE_IMAGE_HEIGHT = 400;

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
  const { addRoutineTemplate, updateRoutineTemplate, deleteRoutineTemplate, settings } = useAppContext();
  const isEditing = template !== null;

  const [name, setName] = useState(template?.name || '');
  const [imageUrl, setImageUrl] = useState(template?.imageUrl || '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [uf, setUf] = useState(template?.uf || settings.familyLocation?.uf || '');
  const [cityId, setCityId] = useState(template?.cityId || settings.familyLocation?.cityId || '');
  const [cityName, setCityName] = useState(template?.cityName || settings.familyLocation?.cityName || '');
  const [isGlobal, setIsGlobal] = useState(!template?.uf && !template?.cityId);
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const saveTemplate = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Informe o nome da rotina.');
      return;
    }
    if (!imageUrl.trim()) {
      setFormError('Envie uma imagem 400x400.');
      return;
    }
    let resolvedUf: string | undefined = undefined;
    let resolvedCityId: string | undefined = undefined;
    let resolvedCityName: string | undefined = undefined;

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

    const templateData: Omit<RoutineTemplate, 'id'> = {
      name: trimmedName,
      imageUrl: imageUrl.trim(),
      isActive,
      uf: resolvedUf,
      cityId: resolvedCityId,
      cityName: resolvedCityName,
    };

    if (isEditing && template) {
      updateRoutineTemplate({ ...template, ...templateData });
    } else {
      addRoutineTemplate(templateData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (template && window.confirm(`Tem certeza que deseja excluir "${template.name}"?`)) {
      deleteRoutineTemplate(template.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[51]">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg m-4" style={{ maxHeight: '95vh', overflowY: 'auto' }}>
        <h2 className="text-2xl font-bold mb-6">{isEditing ? 'Editar rotina' : 'Criar rotina'}</h2>
        <div className="space-y-4">
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
              <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                Excluir
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Cancelar
              </button>
              <button type="button" disabled={isUploading} onClick={saveTemplate} className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
                {isEditing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddOrEditTemplateModal;
