
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Recommendation } from '../types';
import { PRODUCTS_SEED, RECOMMENDATION_CATEGORIES } from '../data/products';
import { PlusIcon } from './icons/MiscIcons';

interface ManageRecommendationsModalProps {
    onClose: () => void;
}

const ManageRecommendationsModal: React.FC<ManageRecommendationsModalProps> = ({ onClose }) => {
    const {
        settings,
        checkAdminPin,
        setAdminPin,
        productRecommendations,
        setProductRecommendations,
        addRecommendation,
        updateRecommendation,
        deleteRecommendation
    } = useAppContext();

    const [isAuthenticated, setIsAuthenticated] = useState(!settings.adminPin);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const [editingRecommendation, setEditingRecommendation] = useState<Recommendation | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    
    const [importJson, setImportJson] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings.adminPin) {
            setAdminPin(pin);
            setIsAuthenticated(true);
        } else {
            if (checkAdminPin(pin)) {
                setIsAuthenticated(true);
            } else {
                setError('PIN incorreto.');
                setPin('');
            }
        }
    };

    const handleExport = () => {
        navigator.clipboard.writeText(JSON.stringify(productRecommendations, null, 2));
        alert('Dados de Recomendações copiados para a área de transferência!');
    };

    const handleImport = () => {
        try {
            const data = JSON.parse(importJson);
            if (Array.isArray(data)) {
                setProductRecommendations(data);
                setIsImporting(false);
                setImportJson('');
                alert('Dados importados com sucesso!');
            } else {
                alert('Erro: O JSON precisa ser um array de recomendações.');
            }
        } catch (e) {
            alert('Erro: JSON inválido.');
        }
    };
    
    const handleRestoreSeed = () => {
        if (window.confirm('Isso substituirá todas as recomendações atuais pelas iniciais. Deseja continuar?')) {
            setProductRecommendations(PRODUCTS_SEED);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[120]">
              <div className="bg-white rounded-2xl p-8 text-center text-gray-800 shadow-lg mx-4">
                <h3 className="text-2xl font-bold">{settings.adminPin ? 'Digite o PIN de Admin' : 'Crie um PIN de Admin'}</h3>
                <form onSubmit={handlePinSubmit}>
                  <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} className="w-40 text-center text-4xl tracking-[.5em] font-bold mt-6 p-2 border-b-2 focus:border-purple-500 outline-none" autoFocus />
                  {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                  <div className="flex justify-center gap-4 mt-8">
                    <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300">Cancelar</button>
                    <button type="submit" className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700">Confirmar</button>
                  </div>
                </form>
              </div>
            </div>
        );
    }

    // Main content of the modal once authenticated
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-5xl m-4 flex flex-col h-full max-h-[95vh]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Admin: Recomendações</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
                </div>

                <div className="flex flex-wrap gap-2 border-b pb-4 mb-4">
                    <button onClick={() => { setEditingRecommendation(null); setIsFormOpen(true); }} className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold flex items-center gap-2"><PlusIcon className="w-5 h-5"/> Nova</button>
                    <button onClick={handleExport} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700">Exportar JSON</button>
                    <button onClick={() => setIsImporting(!isImporting)} className="px-4 py-2 bg-orange-500 text-white rounded-lg font-semibold">Importar JSON</button>
                    <button onClick={handleRestoreSeed} className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold">Restaurar Padrão</button>
                </div>
                
                {isImporting && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                        <textarea value={importJson} onChange={e => setImportJson(e.target.value)} className="w-full h-24 p-2 border rounded-lg" placeholder="Cole o JSON aqui..."></textarea>
                        <div className="flex gap-2 mt-2">
                           <button onClick={handleImport} className="px-4 py-2 bg-green-500 text-white rounded-lg">Confirmar Importação</button>
                           <button onClick={() => setIsImporting(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Cancelar</button>
                        </div>
                    </div>
                )}
                
                {/* TODO: Add filters here */}
                
                <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {productRecommendations.map(rec => (
                            <div key={rec.id} className="bg-white border rounded-lg p-3 flex flex-col">
                                <p className="text-xs text-gray-400">{rec.category}</p>
                                <p className="font-bold flex-grow">{rec.title}</p>
                                <div className="flex items-center gap-2 mt-2 text-xs">
                                    <span className={`px-2 py-0.5 rounded-full font-semibold ${rec.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {rec.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                    {rec.isAffiliate && <span className="px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">Afiliado</span>}
                                </div>
                                <div className="mt-3 pt-3 border-t flex justify-end">
                                    <button onClick={() => { setEditingRecommendation(rec); setIsFormOpen(true); }} className="text-purple-600 font-semibold text-sm">Editar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {isFormOpen && <RecommendationForm recommendation={editingRecommendation} onClose={() => setIsFormOpen(false)} />}
            </div>
        </div>
    );
};


// Sub-component for the form
interface RecommendationFormProps {
    recommendation: Recommendation | null,
    onClose: () => void;
}
const RecommendationForm: React.FC<RecommendationFormProps> = ({ recommendation, onClose }) => {
    const { addRecommendation, updateRecommendation, deleteRecommendation } = useAppContext();
    const isEditing = !!recommendation;

    const [formState, setFormState] = useState<Partial<Omit<Recommendation, 'tags'>> & { tags: string }>({
        title: recommendation?.title || '',
        category: recommendation?.category || RECOMMENDATION_CATEGORIES[0],
        description: recommendation?.description || '',
        imageUrl: recommendation?.imageUrl || '',
        ctaLabel: recommendation?.ctaLabel || 'Ver oferta',
        linkUrl: recommendation?.linkUrl || '',
        isAffiliate: recommendation?.isAffiliate ?? true,
        isActive: recommendation?.isActive ?? true,
        tags: recommendation?.tags?.join(', ') || '',
        ageMin: recommendation?.ageMin ?? null,
        ageMax: recommendation?.ageMax ?? null,
        priority: recommendation?.priority ?? 0,
    });
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        
        if (type === 'checkbox') {
            setFormState(prev => ({ ...prev, [name]: checked }));
        } else if (type === 'number') {
            setFormState(prev => ({ ...prev, [name]: value ? Number(value) : null }));
        } else {
            setFormState(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const tagsArray = formState.tags.split(',').map(t => t.trim()).filter(Boolean);
        
        const finalData = {
            ...formState,
            tags: tagsArray,
        } as Omit<Recommendation, 'id' | 'createdAt' | 'updatedAt'>;

        if (isEditing && recommendation) {
            updateRecommendation({ ...recommendation, ...finalData });
        } else {
            addRecommendation(finalData);
        }
        onClose();
    };
    
    const handleDeleteClick = () => {
        if (recommendation && window.confirm(`Tem certeza que quer apagar "${recommendation.title}"?`)) {
            deleteRecommendation(recommendation.id);
            onClose();
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl flex flex-col max-h-[90vh]">
                <h3 className="text-xl font-bold mb-4 flex-shrink-0">{isEditing ? 'Editar' : 'Adicionar'} Recomendação</h3>
                <div className="overflow-y-auto pr-2 -mr-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="title" value={formState.title} onChange={handleChange} placeholder="Título" className="p-2 border rounded w-full" required />
                        <select name="category" value={formState.category} onChange={handleChange} className="p-2 border rounded bg-white w-full"><option value="">Categoria</option>{RECOMMENDATION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                    </div>
                    <textarea name="description" value={formState.description} onChange={handleChange} placeholder="Descrição" className="p-2 border rounded w-full h-20"></textarea>
                    <input name="imageUrl" value={formState.imageUrl} onChange={handleChange} placeholder="URL da Imagem" className="p-2 border rounded w-full" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="linkUrl" value={formState.linkUrl} onChange={handleChange} placeholder="URL do Link" className="p-2 border rounded w-full" required />
                        <input name="ctaLabel" value={formState.ctaLabel} onChange={handleChange} placeholder="Texto do Botão (Ex: Ver oferta)" className="p-2 border rounded w-full" />
                    </div>
                    <input name="tags" value={formState.tags} onChange={handleChange} placeholder="Tags (separadas por vírgula)" className="p-2 border rounded w-full" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <input name="ageMin" type="number" value={formState.ageMin || ''} onChange={handleChange} placeholder="Idade Mín." className="p-2 border rounded w-full" />
                        <input name="ageMax" type="number" value={formState.ageMax || ''} onChange={handleChange} placeholder="Idade Máx." className="p-2 border rounded w-full" />
                        <input name="priority" type="number" value={formState.priority || ''} onChange={handleChange} placeholder="Prioridade" className="p-2 border rounded w-full" />
                    </div>
                    <div className="flex gap-6"><label className="flex items-center gap-2"><input type="checkbox" name="isActive" checked={formState.isActive} onChange={handleChange}/> Ativo</label><label className="flex items-center gap-2"><input type="checkbox" name="isAffiliate" checked={formState.isAffiliate} onChange={handleChange} /> Afiliado</label></div>
                </div>
                <div className="flex justify-between mt-6 pt-4 border-t flex-shrink-0">
                    <div>{isEditing && <button type="button" onClick={handleDeleteClick} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg font-semibold">Excluir</button>}</div>
                    <div className="flex-1 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 rounded-lg font-semibold">Cancelar</button>
                        <button type="submit" className="px-5 py-2 bg-purple-600 text-white rounded-lg font-bold">{isEditing ? 'Salvar' : 'Adicionar'}</button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default ManageRecommendationsModal;
