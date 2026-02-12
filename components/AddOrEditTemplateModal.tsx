import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { RoutineTemplate } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';

interface AddOrEditTemplateModalProps {
  template: RoutineTemplate | null;
  onClose: () => void;
}

const TEMPLATE_IMAGE_MAX_BYTES = 1_500_000;
const TEMPLATE_IMAGE_WIDTH = 400;
const TEMPLATE_IMAGE_HEIGHT = 400;

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

const AddOrEditTemplateModal: React.FC<AddOrEditTemplateModalProps> = ({ template, onClose }) => {
  const { addRoutineTemplate, updateRoutineTemplate, deleteRoutineTemplate } = useAppContext();
  const isEditing = template !== null;

  const [name, setName] = useState(template?.name || '');
  const [imageUrl, setImageUrl] = useState(template?.imageUrl || '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      const { width, height } = await getImageDimensions(file);
      if (width !== TEMPLATE_IMAGE_WIDTH || height !== TEMPLATE_IMAGE_HEIGHT) {
        setFormError(`A imagem do modelo precisa ter ${TEMPLATE_IMAGE_WIDTH}x${TEMPLATE_IMAGE_HEIGHT}px.`);
        return;
      }
      const id = template?.id || crypto.randomUUID();
      const fileRef = ref(storage, `routine-templates/${id}-${Date.now()}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
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

    const templateData: Omit<RoutineTemplate, 'id'> = {
      name: trimmedName,
      imageUrl: imageUrl.trim(),
      isActive,
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
            <label className="block text-gray-700 font-semibold mb-2">Imagem (400x400)</label>
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
