
import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { RewardType, RedeemedReward } from '../types';
import { HABIT_ICONS } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { CheckCircleIcon } from './icons/MiscIcons';

interface ProgressDashboardModalProps {
    onClose: () => void;
}

const ProgressDashboardModal: React.FC<ProgressDashboardModalProps> = ({ onClose }) => {
    const { children, redeemedRewards, toggleRewardDelivery, getStarStats } = useAppContext();

    const progressData = useMemo(() => {
        const data = children.map(child => {
            const stats = getStarStats(child.id);
            
            const childRedeemedRewards = redeemedRewards
                .filter(r => r.childId === child.id)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return {
                id: child.id,
                name: child.name,
                avatar: child.avatar,
                weeklyStars: stats.week,
                monthlyStars: stats.month,
                redeemedRewards: childRedeemedRewards
            };
        });
        
        return data.sort((a, b) => b.monthlyStars - a.monthlyStars);
    }, [children, redeemedRewards, getStarStats]);

    const maxWeeklyStars = Math.max(10, ...progressData.map(d => d.weeklyStars));
    const maxMonthlyStars = Math.max(10, ...progressData.map(d => d.monthlyStars));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 md:p-8 w-full max-w-4xl m-4 flex flex-col" style={{ maxHeight: '90vh' }}>
                <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h2 className="text-2xl font-bold">Quadro de Progresso</h2>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 sm:pr-4 -mr-2 sm:-mr-4 space-y-4 sm:space-y-6">
                    {progressData.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum dado para exibir. Comece a completar hábitos!</p>}
                    {progressData.map((data) => (
                        <div key={data.id} className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-4xl">{data.avatar}</span>
                                <h3 className="font-bold text-lg sm:text-2xl text-gray-800">{data.name}</h3>
                            </div>
                            
                            {/* Progress Bars */}
                            <div className="space-y-2 sm:space-y-3">
                                <div>
                                    <label className="font-semibold text-gray-600 text-sm sm:text-base">Progresso Semanal</label>
                                    <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                                        <div
                                            className="bg-green-500 h-4 sm:h-6 rounded-full flex items-center justify-end pr-2 text-white font-bold text-xs sm:text-sm"
                                            style={{ width: `${(data.weeklyStars / maxWeeklyStars) * 100}%` }}
                                        >
                                            {data.weeklyStars}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="font-semibold text-gray-600 text-sm sm:text-base">Progresso Mensal</label>
                                    <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                                        <div
                                            className="bg-purple-500 h-4 sm:h-6 rounded-full flex items-center justify-end pr-2 text-white font-bold text-xs sm:text-sm"
                                            style={{ width: `${(data.monthlyStars / maxMonthlyStars) * 100}%` }}
                                        >
                                            {data.monthlyStars}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Redeemed Rewards */}
                            <div className="mt-3 sm:mt-4">
                                <h4 className="font-semibold text-gray-700 mb-2 text-sm sm:text-base">Recompensas Resgatadas</h4>
                                <div className="space-y-1.5 sm:space-y-2">
                                    {data.redeemedRewards.length > 0 ? data.redeemedRewards.map(item => {
                                        const Icon = HABIT_ICONS[item.reward.icon];
                                        return (
                                            <div key={item.id} className="flex items-center justify-between p-2 sm:p-2.5 bg-white rounded-lg border">
                                                <div className="flex items-center gap-3">
                                                    {item.reward.imageUrl ? (
                                                        <img src={item.reward.imageUrl} alt={item.reward.name} className="w-10 h-10 object-cover rounded-md" />
                                                    ) : (
                                                        <Icon className="w-8 h-8 text-cyan-500" />
                                                    )}
                                                    <div>
                                                        <span className="font-medium">{item.reward.name}</span>
                                                        <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-2">
                                                            <span>Resgatado: {new Date(item.date + 'T00:00:00').toLocaleDateString()}</span>
                                                            {item.isDelivered && item.deliveryDate && (
                                                                <span className="text-green-600 font-bold uppercase">ENTREGUE: {new Date(item.deliveryDate + 'T00:00:00').toLocaleDateString()}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-1 text-yellow-500 font-bold text-sm">
                                                        <span>{item.reward.cost}</span>
                                                        <StarIcon />
                                                    </div>
                                                    {item.isDelivered ? (
                                                        <span className="flex items-center gap-1.5 text-green-600 font-semibold text-xs sm:text-sm py-1 px-2 bg-green-100 rounded-full">
                                                            <CheckCircleIcon className="w-4 h-4"/>
                                                            Entregue
                                                        </span>
                                                    ) : (
                                                        <button 
                                                            onClick={() => toggleRewardDelivery(item.id)}
                                                            className="bg-blue-500 text-white font-semibold py-1 px-2 rounded-lg hover:bg-blue-600 transition-colors text-xs sm:text-sm"
                                                        >
                                                            Marcar como Entregue
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <p className="text-sm text-gray-500">Nenhuma recompensa resgatada ainda.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-4 pt-6">
                    <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProgressDashboardModal;



