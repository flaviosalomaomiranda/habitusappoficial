import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Child } from '../types';
import { StarIcon } from './icons/HabitIcons';

interface TvProgressModalProps {
    child: Child;
    onClose: () => void;
}

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className={`p-8 rounded-2xl text-white text-center ${color}`}>
        <p className="text-3xl font-semibold">{label}</p>
        <div className="flex items-center justify-center gap-3 mt-2">
            <StarIcon className="w-12 h-12" />
            <span className="text-6xl font-bold">{value}</span>
        </div>
    </div>
);


const TvProgressModal: React.FC<TvProgressModalProps> = ({ child, onClose }) => {
    const { getStarStats } = useAppContext();
    const stats = getStarStats(child.id);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
             <div className="bg-white/10 border border-white/20 rounded-3xl p-8 w-full max-w-4xl h-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-5xl font-bold text-white">Meu Progresso</h2>
                    <button onClick={onClose} className="text-white text-5xl font-bold">&times;</button>
                </div>

                <div className="flex-grow grid grid-cols-2 grid-rows-2 gap-6">
                    <StatCard label="Hoje" value={stats.today} color="bg-green-500/80" />
                    <StatCard label="Esta Semana" value={stats.week} color="bg-purple-500/80" />
                    <StatCard label="Este Mês" value={stats.month} color="bg-purple-500/80" />
                    <StatCard label="Total" value={child.stars} color="bg-yellow-500/80" />
                </div>
            </div>
        </div>
    );
};

export default TvProgressModal;
