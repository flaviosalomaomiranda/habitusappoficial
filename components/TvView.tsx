import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { getTodayDateString, calculateAge } from '../utils/dateUtils';
import { HABIT_ICONS, getHabitCategoryStyle } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { TrophyIcon, ChartBarIcon, CheckCircleIcon, UserIcon } from './icons/MiscIcons';
import RewardShopView from './RewardShopView';
import TvProgressModal from './TvProgressModal';

interface TvViewProps {
    onExitToParent: () => void;
}

const TvView: React.FC<TvViewProps> = ({ onExitToParent }) => {
    const { children, getHabitsForChildOnDate, getStarStats } = useAppContext();
    const [activeChildIndex, setActiveChildIndex] = useState(0);
    
    // UI states
    const [isShopOpen, setShopOpen] = useState(false);
    const [isProgressOpen, setProgressOpen] = useState(false);

    const activeChild = children[activeChildIndex];

    useEffect(() => {
        if (!activeChild && children.length > 0) {
            setActiveChildIndex(0);
        }
    }, [children, activeChild]);
    
    if (!activeChild) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-purple-900 text-white text-4xl font-bold text-center p-4">
                Adicione uma crianca no Modo dos Pais para comecar!
            </div>
        );
    }
    
    const today = getTodayDateString();
    const todaysHabits = getHabitsForChildOnDate(activeChild.id, today);
    const starStats = getStarStats(activeChild.id);

    const cycleChild = (direction: 'next' | 'prev') => {
        if (children.length <= 1) return;
        setActiveChildIndex(prev => {
            const next = direction === 'next' ? prev + 1 : prev - 1;
            if (next >= children.length) return 0;
            if (next < 0) return children.length - 1;
            return next;
        });
    }
    
    return (
        <>
        <div className="h-[100dvh] bg-gradient-to-br from-purple-800 to-violet-900 text-white p-3 sm:p-5 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <span className="text-4xl sm:text-5xl">{activeChild.avatar}</span>
                        <h1 className="text-2xl sm:text-4xl font-bold tracking-wide truncate">
                            Dia de {activeChild.name}
                            {activeChild.birthDate && (
                                <span className="ml-2 text-sm sm:text-base font-semibold text-white/80">
                                    {calculateAge(activeChild.birthDate)} anos
                                </span>
                            )}
                        </h1>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm sm:text-base font-semibold bg-black/20 px-3 py-1.5 rounded-lg">
                        <span>Hoje: <span className="font-bold text-yellow-300">{starStats.today}</span></span>
                        <span>Semana: <span className="font-bold text-yellow-300">{starStats.week}</span></span>
                        <span>Mes: <span className="font-bold text-yellow-300">{starStats.month}</span></span>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <button onClick={onExitToParent} className="bg-white/20 text-white font-bold text-sm sm:text-base flex items-center gap-2 px-3 py-2 rounded-full hover:bg-white/30 transition-colors">
                        <UserIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Modo dos Pais</span>
                    </button>
                    <div className="bg-yellow-400 text-yellow-900 font-bold text-xl sm:text-2xl flex items-center gap-2 px-3 py-2 rounded-full shadow-lg">
                        <StarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                        <span>{activeChild.stars}</span>
                    </div>
                    <button onClick={() => setProgressOpen(true)} className="bg-purple-300 text-purple-900 font-bold text-sm sm:text-base flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-transform transform hover:scale-105">
                        <ChartBarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Progresso</span>
                    </button>
                    <button onClick={() => setShopOpen(true)} className="bg-purple-200 text-purple-900 font-bold text-sm sm:text-base flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-transform transform hover:scale-105">
                        <TrophyIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Recompensas</span>
                    </button>
                    {children.length > 1 && (
                        <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1.5 rounded-full">
                            <button onClick={() => cycleChild('prev')} className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors" aria-label="Anterior">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">Trocar usuario</span>
                            <button onClick={() => cycleChild('next')} className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors" aria-label="Proximo">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content - Habits Grid */}
            <main className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 auto-rows-fr">
                {todaysHabits.map(habit => {
                    const Icon = HABIT_ICONS[habit.icon];
                    const isCompleted = habit.completions[today] === 'COMPLETED';
                    const rewardClass = isCompleted ? 'text-yellow-300' : 'text-yellow-300/40';
                    const categoryStyle = getHabitCategoryStyle(habit.category);
                    const iconClass = categoryStyle?.icon ?? 'text-purple-600';
                    const iconBgClass = categoryStyle?.iconBg ?? 'bg-white/10';
                    
                    return (
                        <div 
                            key={habit.id}
                            className={`relative rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all duration-300 shadow-2xl h-full border ${
                                isCompleted ? 'bg-green-500 border-green-400/60' : 'bg-gray-100/20 border-red-400/60'
                            }`}
                        >
                            {isCompleted && (
                                <div className="absolute top-4 right-4 text-white">
                                    <CheckCircleIcon className="w-6 h-6 sm:w-7 sm:h-7" />
                                </div>
                            )}
                            <div className={`transition-opacity duration-300 ${isCompleted ? 'opacity-50' : 'opacity-60'}`}>
                                <div className={`inline-flex items-center justify-center p-2 rounded-xl ${iconBgClass}`}>
                                    {habit.imageUrl ? (
                                        <img src={habit.imageUrl} alt={habit.name} className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg object-cover" />
                                    ) : (
                                        <Icon className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 ${iconClass}`} />
                                    )}
                                </div>
                            </div>
                            <h2 className="mt-2 text-sm sm:text-base font-semibold line-clamp-2">{habit.name}</h2>
                            <div className="mt-1 flex items-center gap-1.5 text-sm sm:text-base font-bold">
                                {habit.reward.type === 'STARS' ? (
                                    <>
                                        <span className={rewardClass}>+{habit.reward.value}</span>
                                        <StarIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${rewardClass}`} />
                                    </>
                                ) : (
                                    <span className="text-xs sm:text-sm px-2 py-0.5 bg-purple-500 rounded-full">Atividade</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </main>
        </div>
        {isShopOpen && <RewardShopView child={activeChild} onClose={() => setShopOpen(false)} />}
        {isProgressOpen && <TvProgressModal child={activeChild} onClose={() => setProgressOpen(false)} />}
        </>
    );
};

export default TvView;
