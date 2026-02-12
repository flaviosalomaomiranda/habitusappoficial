
import React from 'react';
import { useAppContext } from '../context/AppContext';
import { getTodayDateString } from '../utils/dateUtils';
import { HABIT_ICONS, getHabitCategoryStyle } from '../constants';
import { StarIcon } from './icons/HabitIcons';
import { CheckCircleIcon, UserIcon } from './icons/MiscIcons';
import { Child } from '../types';

interface ChildViewProps {
    child: Child;
    onSwitchToParent: () => void;
}

const ChildView: React.FC<ChildViewProps> = ({ child, onSwitchToParent }) => {
    const { getHabitsForChildOnDate, requestHabitCompletion } = useAppContext();
    const today = getTodayDateString();
    const todaysHabits = getHabitsForChildOnDate(child.id, today);

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-500 to-violet-600 text-white p-4 sm:p-8 flex flex-col">
            <header className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <span className="text-6xl">{child.avatar}</span>
                    <div>
                        <h1 className="text-4xl sm:text-5xl font-bold tracking-wide">Olá, {child.name}!</h1>
                        <p className="text-xl text-white/80">Estas são suas missões de hoje:</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-yellow-400 text-yellow-900 font-bold text-4xl shadow-lg">
                    <StarIcon className="w-10 h-10" />
                    <span>{child.stars}</span>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {todaysHabits.map(habit => {
                    const Icon = HABIT_ICONS[habit.icon];
                    const status = habit.completions[today];
                    const categoryStyle = getHabitCategoryStyle(habit.category);
                    const iconClass = categoryStyle?.icon ?? 'text-white';
                    const iconBgClass = categoryStyle?.iconBg ?? 'bg-white/10';

                    return (
                        <div key={habit.id} className={`rounded-3xl p-6 flex flex-col items-center justify-between text-center transition-all duration-300 shadow-2xl ${
                            status === 'COMPLETED' ? 'bg-green-500' : (status === 'PENDING' ? 'bg-orange-400' : 'bg-white/20')
                        }`}>
                            <div>
                                <div className={`inline-flex items-center justify-center p-4 rounded-3xl ${iconBgClass}`}>
                                    {habit.imageUrl ? (
                                        <img src={habit.imageUrl} alt={habit.name} className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover" />
                                    ) : (
                                        <Icon className={`w-24 h-24 sm:w-28 sm:h-28 ${iconClass}`} />
                                    )}
                                </div>
                                <h2 className="mt-4 text-3xl font-semibold">{habit.name}</h2>
                            </div>
                            <div className="mt-4">
                                {status === 'COMPLETED' ? (
                                    <div className="flex items-center gap-2 text-xl font-bold">
                                        <CheckCircleIcon className="w-8 h-8" />
                                        <span>Feito!</span>
                                    </div>
                                ) : status === 'PENDING' ? (
                                    <div className="text-xl font-bold px-4 py-2 bg-black/20 rounded-full">Aguardando...</div>
                                ) : (
                                    <button
                                        onClick={() => requestHabitCompletion(child.id, habit.id, today)}
                                        className="px-8 py-3 bg-white text-purple-700 font-bold text-2xl rounded-full shadow-lg transition-transform transform hover:scale-105"
                                    >
                                        Feito!
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                 {todaysHabits.length === 0 && (
                    <div className="col-span-full flex items-center justify-center">
                        <div className="text-center p-8 bg-black/10 rounded-2xl">
                            <h2 className="text-3xl font-bold">Parabéns!</h2>
                            <p className="text-xl mt-2">Você completou todas as suas missões de hoje!</p>
                        </div>
                    </div>
                )}
            </main>

            <footer className="mt-8 flex justify-center">
                <button
                    onClick={onSwitchToParent}
                    className="px-6 py-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors font-semibold flex items-center gap-2"
                >
                    <UserIcon className="w-5 h-5" />
                    Modo dos Pais
                </button>
            </footer>
        </div>
    );
};

export default ChildView;
