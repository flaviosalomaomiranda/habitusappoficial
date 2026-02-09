
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { HABIT_ICONS } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { PencilIcon, PlusIcon, TrashIcon, StarsIcon } from './icons/MiscIcons';
import { ShopReward, IconName, LimitPeriod } from '../types';

// --- Sub-componente para o formulário, contido dentro do modal ---
interface RewardFormProps {
  reward: ShopReward | null;
  onSave: () => void;
  onCancel: () => void;
}

const RewardForm: React.FC<RewardFormProps> = ({ reward, onSave, onCancel }) => {
  const { addShopReward, updateShopReward, deleteShopReward } = useAppContext();
  
  const isEditing = reward !== null;

  const [name, setName] = useState(reward?.name || '');
  const [cost, setCost] = useState(reward?.cost || 10);
  const [selectedIcon, setSelectedIcon] = useState<IconName>(reward?.icon || 'Gift');
  const [imageUrl, setImageUrl] = useState(reward?.imageUrl || '');
  const [limitPeriod, setLimitPeriod] = useState<LimitPeriod>(reward?.limit?.period || 'NONE');
  const [limitCount, setLimitCount] = useState<number>(reward?.limit?.count || 1);
  const [formError, setFormError] = useState<string | null>(null);

  const handleLimitPreset = (period: LimitPeriod, count: number) => {
      setLimitPeriod(period);
      setLimitCount(count);
  };

  const saveReward = () => {
    const trimmedName = name.trim();
    const normalizedCost = Number(cost);
    if (!trimmedName) {
      setFormError('Informe o nome da recompensa.');
      return;
    }
    if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) {
      setFormError('Informe um custo valido.');
      return;
    }

    setFormError(null);
    
    const limit = limitPeriod !== 'NONE' ? { period: limitPeriod, count: limitCount } : undefined;
    const rewardData = {
      name: trimmedName,
      icon: selectedIcon,
      cost: normalizedCost,
      imageUrl: imageUrl.trim(),
      limit,
    };

    try {
      if (isEditing && reward) {
        updateShopReward({ ...reward, ...rewardData });
      } else {
        addShopReward(rewardData);
      }
      onSave();
    } catch (error) {
      console.error('Falha ao salvar recompensa:', error);
      setFormError('Nao foi possivel salvar a recompensa.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveReward();
  };
  
  const handleDelete = () => {
    if(reward && window.confirm(`Tem certeza que deseja excluir a recompensa "${reward.name}"?`)){
        deleteShopReward(reward.id);
        onSave();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
        <div className="flex justify-between items-center mb-4 md:mb-6 flex-shrink-0">
            <h2 className="text-xl md:text-2xl font-black text-gray-800">
                {isEditing ? 'Editar Recompensa' : 'Nova Recompensa'}
            </h2>
            <button type="button" onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-4 pb-4">
          <div>
            <label htmlFor="reward-name" className="block text-gray-700 font-semibold mb-2">Nome da Recompensa</label>
            <input
              id="reward-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formError) setFormError(null);
              }}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: Passeio no parque"
            />
          </div>

          <div className="flex-1">
              <label htmlFor="star-cost" className="block text-gray-700 font-semibold mb-2">Custo em Estrelas</label>
              <div className="flex items-center gap-2">
                 <input
                   id="star-cost"
                   type="number"
                   value={cost}
                   onChange={(e) => {
                     const next = parseInt(e.target.value, 10);
                     setCost(Number.isFinite(next) ? next : 0);
                     if (formError) setFormError(null);
                   }}
                   className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                   min="1"
                 />
                  <StarIcon className="w-6 h-6 text-yellow-500 flex-shrink-0" />
              </div>
          </div>
            
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
             <label className="block text-gray-700 font-bold mb-3">Limites de Resgate (Frequência)</label>
             <div className="grid grid-cols-2 gap-2 mb-4">
                <button type="button" onClick={() => handleLimitPreset('NONE', 0)} className={`px-3 py-2 text-sm rounded-lg border transition-colors ${limitPeriod === 'NONE' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700'}`}>Sem limite</button>
                <button type="button" onClick={() => handleLimitPreset('DAY', 1)} className={`px-3 py-2 text-sm rounded-lg border transition-colors ${limitPeriod === 'DAY' && limitCount === 1 ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700'}`}>1x por dia</button>
                <button type="button" onClick={() => handleLimitPreset('WEEK', 2)} className={`px-3 py-2 text-sm rounded-lg border transition-colors ${limitPeriod === 'WEEK' && limitCount === 2 ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700'}`}>2x por semana</button>
                <button type="button" onClick={() => handleLimitPreset('MONTH', 4)} className={`px-3 py-2 text-sm rounded-lg border transition-colors ${limitPeriod === 'MONTH' && limitCount === 4 ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700'}`}>4x por mês</button>
             </div>
             
             <div className="flex items-center gap-3">
                <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Qtd Máxima</label>
                    <input type="number" value={limitCount} onChange={(e) => setLimitCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 border rounded-lg bg-white" min="1" disabled={limitPeriod === 'NONE'} />
                </div>
                <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Período</label>
                    <select value={limitPeriod} onChange={(e) => setLimitPeriod(e.target.value as LimitPeriod)} className="w-full px-3 py-2 border rounded-lg bg-white" disabled={limitPeriod === 'NONE'}>
                        <option value="DAY">por dia</option>
                        <option value="WEEK">por semana</option>
                        <option value="MONTH">por mês</option>
                    </select>
                </div>
             </div>
          </div>

          <div>
            <label htmlFor="reward-image-url" className="block text-gray-700 font-semibold mb-2">URL da Imagem (Opcional)</label>
            <input
              id="reward-image-url"
              type="url"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                if (formError) setFormError(null);
              }}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="https://exemplo.com/imagem.png"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Ícone</label>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-3">
              {(Object.keys(HABIT_ICONS) as IconName[]).map((iconName) => {
                const Icon = HABIT_ICONS[iconName];
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => {
                      setSelectedIcon(iconName);
                      if (formError) setFormError(null);
                    }}
                    className={`p-3 rounded-lg flex items-center justify-center transition-colors ${selectedIcon === iconName ? 'bg-purple-200 ring-2 ring-purple-500' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    <Icon className="w-8 h-8 text-gray-700" />
                  </button>
              );
            })}
          </div>
          </div>
        </div>
        {formError && <p className="text-sm font-semibold text-red-600 mt-2">{formError}</p>}
        <div className="flex justify-between items-center pt-4 mt-auto flex-shrink-0">
             {isEditing ? (
                 <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-semibold">Excluir</button>
             ) : <div />}
            <div className="flex justify-end gap-4">
                <button type="button" onClick={onCancel} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Cancelar</button>
                <button
                  type="button"
                  onClick={saveReward}
                  onTouchStart={saveReward}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold"
                >
                  {isEditing ? 'Salvar' : 'Criar'}
                </button>
            </div>
        </div>
    </form>
  );
};

// --- Componente Principal do Modal ---
interface ManageRewardsModalProps {
  onClose: () => void;
}

const ManageRewardsModal: React.FC<ManageRewardsModalProps> = ({ onClose }) => {
  const { shopRewards, resetRedemptionLogs } = useAppContext();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingReward, setEditingReward] = useState<ShopReward | null>(null);

  const handleEdit = (reward: ShopReward) => {
    setEditingReward(reward);
    setView('form');
  };

  const handleAddNew = () => {
    setEditingReward(null);
    setView('form');
  };
  
  const handleBackToList = () => {
    setView('list');
    setEditingReward(null);
  };

  const handleSaveAndClose = () => {
    handleBackToList();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-[94vw] max-w-md mx-auto md:w-full flex flex-col max-h-[85vh] pointer-events-auto transform transition-transform animate-in slide-in-from-bottom duration-300 overflow-x-hidden">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1 md:hidden" />
          <div className="p-5 md:p-8 flex flex-col h-full overflow-hidden">
            {view === 'list' ? (
              <>
                <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h2 className="text-xl md:text-2xl font-black text-gray-800">Recompensas</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex flex-col md:flex-row gap-2 mb-6">
                    <button onClick={handleAddNew} className="w-full md:flex-1 bg-green-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-green-600 transition-all shadow-lg shadow-green-500/20 order-1">
                        <PlusIcon className="w-5 h-5" /><span>Nova Recompensa</span>
                    </button>
                    <button onClick={resetRedemptionLogs} className="w-full md:w-auto text-red-500 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 transition-colors text-sm md:text-base order-2">
                        <TrashIcon className="w-4 h-4 md:w-5 md:h-5" /><span>Resetar Limites</span>
                    </button>
                </div>
                <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {shopRewards.length > 0 ? shopRewards.map(reward => {
                        const Icon = HABIT_ICONS[reward.icon];
                        return (
                            <div key={reward.id} className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-2xl border border-gray-100 transition-all hover:border-purple-200">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="bg-white p-2 rounded-xl shadow-sm">
                                        {reward.imageUrl ? <img src={reward.imageUrl} alt={reward.name} className="w-10 h-10 object-cover rounded-lg" /> : <Icon className="w-8 h-8 text-purple-500" />}
                                    </div>
                                    <div>
                                        <span className="text-base md:text-lg font-bold text-gray-800 block">{reward.name}</span>
                                        {reward.limit && reward.limit.period !== 'NONE' && (
                                            <p className="text-[10px] md:text-xs text-gray-400 font-medium">{reward.limit.count}x por {reward.limit.period === 'DAY' ? 'dia' : reward.limit.period === 'WEEK' ? 'semana' : 'mês'}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 md:gap-4">
                                    <div className="flex items-center gap-1 text-yellow-500 font-black bg-yellow-50 px-3 py-1 rounded-full text-sm md:text-base">
                                        <span>{reward.cost}</span>
                                        <StarIcon className="w-4 h-4 md:w-5 md:h-5" />
                                    </div>
                                    <button onClick={() => handleEdit(reward)} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded-xl transition-all">
                                        <PencilIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                            </div>
                        )
                  }) : (
                    <div className="text-center py-12 flex flex-col items-center">
                        <StarsIcon className="w-16 h-16 text-gray-100 mb-2" />
                        <p className="text-gray-400 text-sm font-medium">Nenhuma recompensa criada ainda.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <RewardForm reward={editingReward} onSave={handleSaveAndClose} onCancel={handleBackToList} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ManageRewardsModal;

