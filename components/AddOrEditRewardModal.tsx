
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { HABIT_ICONS } from '../constants';
import { IconName, ShopReward, LimitPeriod } from '../types';
import { StarIcon } from './icons/HabitIcons';

interface AddOrEditRewardModalProps {
  reward: ShopReward | null;
  onClose: () => void;
}

const AddOrEditRewardModal: React.FC<AddOrEditRewardModalProps> = ({ reward, onClose }) => {
  const { addShopReward, updateShopReward, deleteShopReward } = useAppContext();
  
  const isEditing = reward !== null;

  const [name, setName] = useState(reward?.name || '');
  const [cost, setCost] = useState(reward?.cost || 10);
  const [selectedIcon, setSelectedIcon] = useState<IconName>(reward?.icon || 'Gift');
  const [imageUrl, setImageUrl] = useState(reward?.imageUrl || '');
  
  // Limites
  const [limitPeriod, setLimitPeriod] = useState<LimitPeriod>(reward?.limit?.period || 'NONE');
  const [limitCount, setLimitCount] = useState<number>(reward?.limit?.count || 1);

  const handleLimitPreset = (period: LimitPeriod, count: number) => {
      setLimitPeriod(period);
      setLimitCount(count);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || cost <= 0) return;
    
    const limit = limitPeriod !== 'NONE' ? { period: limitPeriod, count: limitCount } : undefined;
    const rewardData = { name: name.trim(), icon: selectedIcon, cost, imageUrl: imageUrl.trim(), limit };

    if (isEditing && reward) {
      updateShopReward({ ...reward, ...rewardData });
    } else {
      addShopReward(rewardData);
    }
    onClose();
  };
  
  const handleDelete = () => {
    if(reward && window.confirm(`Tem certeza que deseja excluir a recompensa "${reward.name}"?`)){
        deleteShopReward(reward.id);
        onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg m-4" style={{ maxHeight: '95vh', overflowY: 'auto' }}>
        <h2 className="text-2xl font-bold mb-6">{isEditing ? 'Editar Recompensa' : 'Criar Nova Recompensa'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reward-name" className="block text-gray-700 font-semibold mb-2">Nome da Recompensa</label>
            <input
              id="reward-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: Passeio no parque"
              required
            />
          </div>

          <div className="flex gap-4">
              <div className="flex-1">
                  <label htmlFor="star-cost" className="block text-gray-700 font-semibold mb-2">Custo em Estrelas</label>
                  <div className="flex items-center gap-2">
                     <input
                        id="star-cost"
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(Math.max(1, parseInt(e.target.value, 10)))}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        min="1"
                      />
                      <StarIcon className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                  </div>
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
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="https://exemplo.com/imagem.png"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Ícone</label>
            <div className="grid grid-cols-6 gap-3">
              {(Object.keys(HABIT_ICONS) as IconName[]).map((iconName) => {
                const Icon = HABIT_ICONS[iconName];
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-3 rounded-lg flex items-center justify-center transition-colors ${selectedIcon === iconName ? 'bg-purple-200 ring-2 ring-purple-500' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    <Icon className="w-8 h-8 text-gray-700" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
             {isEditing ? (
                 <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                    Excluir
                </button>
             ) : <div />}
            <div className="flex justify-end gap-4">
                <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Cancelar
                </button>
                <button type="submit" className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                {isEditing ? 'Salvar' : 'Criar'}
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddOrEditRewardModal;
