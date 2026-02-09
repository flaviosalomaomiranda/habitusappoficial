
import React from 'react';
import type { HabitCategory, IconName } from './types';
import { BookIcon, ToothbrushIcon, BedIcon, BroomIcon, BackpackIcon, AppleIcon, PaintbrushIcon, SoccerIcon, DogIcon, CatIcon, HeartIcon, GameControllerIcon, StarIcon } from './components/icons/HabitIcons';
// Import SparklesIcon from MiscIcons
import { GiftIcon, TrophyIcon, TvIcon, SparklesIcon } from './components/icons/MiscIcons';


export const HABIT_ICONS: Record<IconName, React.FC<React.SVGProps<SVGSVGElement>>> = {
    Book: BookIcon,
    Toothbrush: ToothbrushIcon,
    Bed: BedIcon,
    Broom: BroomIcon,
    Backpack: BackpackIcon,
    Apple: AppleIcon,
    Paintbrush: PaintbrushIcon,
    Soccer: SoccerIcon,
    Dog: DogIcon,
    Cat: CatIcon,
    Heart: HeartIcon,
    GameController: GameControllerIcon,
    Gift: GiftIcon,
    Trophy: TrophyIcon,
    Tv: TvIcon,
    Star: StarIcon,
    // Added missing icon Sparkles
    Sparkles: SparklesIcon,
};

export const HABIT_CATEGORIES: HabitCategory[] = [
    'Saude e bem-estar',
    'Sono',
    'Estudos e leitura',
    'Rotina e organizacao',
    'Alimentacao',
    'Exercicios',
    'Higiene',
    'Emocoes e convivencia',
];

export const HABIT_CATEGORY_STYLES: Record<HabitCategory, { icon: string; iconBg: string; badge: string }> = {
    'Saude e bem-estar': { icon: 'text-green-600', iconBg: 'bg-green-50', badge: 'bg-green-100 text-green-700' },
    'Sono': { icon: 'text-indigo-600', iconBg: 'bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
    'Estudos e leitura': { icon: 'text-blue-600', iconBg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
    'Rotina e organizacao': { icon: 'text-purple-600', iconBg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700' },
    'Alimentacao': { icon: 'text-orange-600', iconBg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
    'Exercicios': { icon: 'text-teal-600', iconBg: 'bg-teal-50', badge: 'bg-teal-100 text-teal-700' },
    'Higiene': { icon: 'text-cyan-600', iconBg: 'bg-cyan-50', badge: 'bg-cyan-100 text-cyan-700' },
    'Emocoes e convivencia': { icon: 'text-pink-600', iconBg: 'bg-pink-50', badge: 'bg-pink-100 text-pink-700' },
};

export const getHabitCategoryStyle = (category?: HabitCategory) => {
    if (!category) return null;
    return HABIT_CATEGORY_STYLES[category];
};

export const ANIMAL_EMOJIS: string[] = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦉', '🐤', '🐠', '🐳', '🦄', '🐝', '🦋', '🐢', '🦖', '🐙', '🦀', '🦒'];
