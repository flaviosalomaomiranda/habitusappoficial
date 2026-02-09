
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Child, ShopReward } from '../types';
import { HABIT_ICONS } from '../constants';
import { StarIcon } from './icons/HabitIcons';

interface RewardShopViewProps {
    child: Child;
    onClose: () => void;
}

const RewardShopView: React.FC<RewardShopViewProps> = ({ child, onClose }) => {
    const { shopRewards, redeemReward, checkRewardAvailability } = useAppContext();
    const [confirmingReward, setConfirmingReward] = useState<ShopReward | null>(null);
    const [redeemSuccess, setRedeemSuccess] = useState(false);
    
    const handleRedeem = (reward: ShopReward) => {
        const availability = checkRewardAvailability(child.id, reward);
        if(child.stars >= reward.cost && availability.isAvailable) {
            setConfirmingReward(reward);
        }
    }
    
    const confirmRedemption = () => {
        if(confirmingReward) {
            const success = redeemReward(child.id, confirmingReward);
            if(success) {
                setRedeemSuccess(true);
            }
            setConfirmingReward(null);
            setTimeout(() => setRedeemSuccess(false), 2000); // Reset success message
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            
            {/* Confirmation Modal */}
            {confirmingReward && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                    <div className="bg-white rounded-2xl p-8 text-center text-gray-800 shadow-lg">
                        <h3 className="text-3xl font-bold">Trocar Recompensa?</h3>
                        <p className="text-xl mt-4">Você quer trocar <span className="font-bold text-yellow-500">{confirmingReward.cost} estrelas</span> por</p>
                        <p className="text-2xl font-bold text-purple-600 mt-2">{confirmingReward.name}?</p>
                        <div className="flex justify-center gap-4 mt-8">
                            <button onClick={() => setConfirmingReward(null)} className="px-8 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold text-xl">Não</button>
                            <button onClick={confirmRedemption} className="px-8 py-3 bg-green-500 text-white rounded-lg font-bold text-xl">Sim!</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Success Animation */}
            {redeemSuccess && (
                 <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <div className="text-center text-white">
                        <div className="text-8xl animate-bounce">🎉</div>
                        <p className="text-4xl font-bold mt-4">Recompensa Resgatada!</p>
                    </div>
                </div>
            )}

            <div className="bg-white/10 border border-white/20 rounded-3xl p-8 w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-5xl font-bold text-white">Loja de Recompensas</h2>
                    <button onClick={onClose} className="text-white text-5xl font-bold">&times;</button>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {shopRewards.map(reward => {
                        const Icon = HABIT_ICONS[reward.icon];
                        const availability = checkRewardAvailability(child.id, reward);
                        const canAfford = child.stars >= reward.cost;
                        const isAvailable = availability.isAvailable;

                        return (
                            <button key={reward.id}
                                disabled={!canAfford || !isAvailable}
                                onClick={() => handleRedeem(reward)}
                                className={`relative rounded-2xl p-6 text-center transition-transform transform hover:scale-105 flex flex-col justify-between ${
                                    isAvailable && canAfford ? 'bg-white/20 hover:bg-white/30 cursor-pointer' : 'bg-black/30 opacity-60'
                                }`}
                            >
                                <div>
                                    {reward.imageUrl ? (
                                        <img src={reward.imageUrl} alt={reward.name} className="w-full h-40 object-cover rounded-lg mb-4" />
                                    ) : (
                                        <Icon className="w-28 h-28 mx-auto text-white" />
                                    )}
                                    <h3 className={`text-3xl font-bold text-white ${!isAvailable ? 'line-through opacity-50' : ''}`}>{reward.name}</h3>
                                    
                                    {reward.limit && reward.limit.period !== 'NONE' && (
                                        <div className={`mt-2 text-lg font-bold ${isAvailable ? 'text-white/60' : 'text-red-400'}`}>
                                            {availability.count} / {availability.max} resgates
                                            {!isAvailable && availability.availableAgainText && <p className="text-sm mt-1">Disponivel {availability.availableAgainText}</p>}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 inline-flex items-center gap-2 px-4 py-1 bg-yellow-400 text-yellow-900 rounded-full font-bold text-2xl self-center">
                                    <StarIcon className="w-6 h-6"/>
                                    <span>{reward.cost}</span>
                                </div>
                                {!canAfford && isAvailable && <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center text-5xl">🔒</div>}
                                {!isAvailable && <div className="absolute inset-0 bg-red-900/40 rounded-2xl flex items-center justify-center text-3xl font-bold text-white">Limite Atingido</div>}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default RewardShopView;
