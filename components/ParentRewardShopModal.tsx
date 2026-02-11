
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Child, ShopReward } from '../types';
import { HABIT_ICONS } from '../constants';
import { StarIcon } from './icons/HabitIcons';

interface ParentRewardShopModalProps {
    child: Child;
    onClose: () => void;
}

const ParentRewardShopModal: React.FC<ParentRewardShopModalProps> = ({ child, onClose }) => {
    const { shopRewards, redeemReward, checkRewardAvailability } = useAppContext();
    const [showSuccess, setShowSuccess] = useState(false);
    const [confirmingReward, setConfirmingReward] = useState<ShopReward | null>(null);

    const handleRedeemClick = (reward: ShopReward) => {
        const availability = checkRewardAvailability(child.id, reward);
        if (child.stars >= reward.cost && availability.isAvailable) {
            setConfirmingReward(reward);
        }
    };

    const handleConfirmRedemption = () => {
        if (!confirmingReward) return;

        const success = redeemReward(child.id, confirmingReward);
        if (success) {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        }
        setConfirmingReward(null);
    };

    const handleCancelRedemption = () => {
        setConfirmingReward(null);
    };

    return (
    <>
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl m-4 flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Resgatar Recompensa para {child.name}</h2>
                <div className="flex items-center gap-2 text-xl font-bold text-gray-700">
                    <StarIcon className="w-6 h-6 text-yellow-500"/>
                    <span>{child.stars}</span>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto pr-4 -mr-4 space-y-3">
               {shopRewards.map(reward => {
                    const Icon = HABIT_ICONS[reward.icon];
                    const availability = checkRewardAvailability(child.id, reward);
                    const canAfford = child.stars >= reward.cost;
                    const isAvailable = availability.isAvailable;
                    
                    return (
                        <div key={reward.id} className={`flex items-center justify-between p-4 rounded-lg border transition-all ${isAvailable && canAfford ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 opacity-75 border-dashed'}`}>
                            <div className="flex items-center gap-4">
                                {reward.imageUrl ? (
                                    <img src={reward.imageUrl} alt={reward.name} className="w-10 h-10 object-cover rounded-md" />
                                ) : (
                                    <Icon className="w-8 h-8 text-purple-500" />
                                )}
                                <div>
                                    <span className={`text-lg font-medium ${!isAvailable ? 'line-through text-gray-400' : ''}`}>{reward.name}</span>
                                    {reward.limit && reward.limit.period !== 'NONE' && (
                                        <p className={`text-xs ${isAvailable ? 'text-gray-500' : 'text-red-500 font-bold'}`}>
                                            Limite: {availability.count}/{availability.max} no período
                                            {!isAvailable && availability.availableAgainText ? ` (Disponivel ${availability.availableAgainText})` : ""}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1 font-bold text-yellow-500">
                                    <span>{reward.cost}</span>
                                    <StarIcon />
                                </div>
                                <button 
                                    onClick={() => handleRedeemClick(reward)} 
                                    disabled={!canAfford || !isAvailable}
                                    className="bg-purple-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {!isAvailable ? 'Limite Atingido' : 'Resgatar'}
                                </button>
                            </div>
                        </div>
                    )
               })}
               {shopRewards.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma recompensa disponível na loja.</p>}
            </div>
            
            <div className="flex justify-end gap-4 pt-6">
              <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Fechar
              </button>
            </div>

            {showSuccess && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-green-500 text-white font-bold py-2 px-4 rounded-lg shadow-lg animate-bounce">
                    Recompensa resgatada! 🎉
                </div>
            )}
          </div>
        </div>

        {/* Confirmation Modal */}
        {confirmingReward && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[51]">
                <div className="bg-white rounded-2xl p-8 text-center text-gray-800 shadow-lg mx-4">
                    <h3 className="text-2xl font-bold">Confirmar Resgate?</h3>
                    <p className="text-lg mt-4">
                        Resgatar <span className="font-bold text-purple-600">{confirmingReward.name}</span> por <span className="font-bold text-yellow-500">{confirmingReward.cost} estrelas</span>?
                    </p>
                    <div className="flex justify-center gap-4 mt-8">
                        <button onClick={handleCancelRedemption} className="px-8 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold text-lg hover:bg-gray-300">Cancelar</button>
                        <button onClick={handleConfirmRedemption} className="px-8 py-3 bg-green-500 text-white rounded-lg font-bold text-lg hover:bg-green-600">Confirmar</button>
                    </div>
                </div>
            </div>
        )}
    </>
    )
};

export default ParentRewardShopModal;
