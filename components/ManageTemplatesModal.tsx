
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { PencilIcon, PlusIcon } from './icons/MiscIcons';
import { RoutineTemplate } from '../types';
import AddOrEditTemplateModal from './AddOrEditTemplateModal';

interface ManageTemplatesModalProps {
  onClose: () => void;
  embedded?: boolean;
}

const ManageTemplatesModal: React.FC<ManageTemplatesModalProps> = ({ onClose, embedded = false }) => {
  const { routineTemplates } = useAppContext();
  const [editingTemplate, setEditingTemplate] = useState<RoutineTemplate | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleEdit = (template: RoutineTemplate) => {
    setEditingTemplate(template);
    setIsAdding(true);
  };

  const handleAddNew = () => {
    setEditingTemplate(null);
    setIsAdding(true);
  };
  
  const handleCloseAddEdit = () => {
    setIsAdding(false);
    setEditingTemplate(null);
  };

  return (
    <>
    <div className={embedded ? "w-full" : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"}>
      <div className={`bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl m-4 flex flex-col ${embedded ? "mx-auto my-0" : ""}`} style={{ maxHeight: embedded ? 'calc(100vh - 140px)' : '90vh' }}>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Gerenciar Rotinas</h2>
            <button onClick={handleAddNew} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 hover:bg-green-600 transition-colors">
                <PlusIcon />
                Novo Modelo
            </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-4 -mr-4 space-y-3">
           {routineTemplates.length > 0 ? routineTemplates.map(template => {
                return (
                    <div key={template.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg border bg-white overflow-hidden flex items-center justify-center">
                                {template.imageUrl ? (
                                  <img src={template.imageUrl} alt={template.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs text-gray-400">Sem imagem</span>
                                )}
                            </div>
                            <div>
                                <span className="text-lg font-medium">{template.name}</span>
                                <p className="text-sm text-gray-500">{template.isActive === false ? 'Inativo' : 'Ativo'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => handleEdit(template)} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-100 rounded-md">
                                <PencilIcon className="w-5 h-5"/>
                            </button>
                        </div>
                    </div>
                )
           }) : (
            <p className="text-center text-gray-500 py-8">Nenhum modelo de rotina criado ainda. Clique em "Novo Modelo" para começar!</p>
           )}
        </div>
        
        <div className="flex justify-end gap-4 pt-6">
          <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
            Fechar
          </button>
        </div>
      </div>
    </div>
    {isAdding && <AddOrEditTemplateModal template={editingTemplate} onClose={handleCloseAddEdit} />}
    </>
  );
};

export default ManageTemplatesModal;
