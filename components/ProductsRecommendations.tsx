
import React, { useState, useMemo } from 'react';
import { GiftIcon } from './icons/MiscIcons';
import { useAppContext } from '../context/AppContext';
import { RECOMMENDATION_CATEGORIES } from '../data/products';
import { Recommendation } from '../types';

interface ProductsRecommendationsProps {
    onClose: () => void;
}

const ProductsRecommendations: React.FC<ProductsRecommendationsProps> = ({ onClose }) => {
    const { productRecommendations, userProfile, settings } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | 'Todos'>('Todos');
    const profileTags = useMemo(() => {
        const tags = new Set<string>();
        const addTags = (items?: string[]) => {
            items?.forEach((item) => {
                if (item) tags.add(item.toLowerCase());
            });
        };
        addTags(userProfile?.mainGoals);
        addTags(userProfile?.habitsToBuild);
        addTags(userProfile?.habitsToReduce);
        addTags(userProfile?.interests);
        addTags(userProfile?.shoppingPreferences);
        addTags(userProfile?.timeGoals);
        addTags(userProfile?.semanticTags);
        Object.entries(settings.semanticTagScores || {})
            .filter(([, score]) => Number(score) > 0)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 8)
            .forEach(([tag]) => tags.add(tag.toLowerCase()));
        return Array.from(tags);
    }, [userProfile, settings.semanticTagScores]);

    const getTagMatchScore = (product: Recommendation) => {
        if (!Array.isArray(product.tags) || product.tags.length === 0) return 0;
        const profileSet = new Set(profileTags.map((tag) => tag.toLowerCase()));
        return product.tags.reduce((acc, tag) => {
            if (!profileSet.has(tag.toLowerCase())) return acc;
            const semanticWeight = Number(settings.semanticTagScores?.[tag] || 0);
            return acc + 1 + Math.max(0, semanticWeight);
        }, 0);
    };

    const filteredProducts = useMemo(() => {
        let products = productRecommendations
            .filter(p => p.isActive)
            .sort((a, b) => {
                const scoreDiff = getTagMatchScore(b) - getTagMatchScore(a);
                if (scoreDiff !== 0) return scoreDiff;
                return (b.priority || 0) - (a.priority || 0) || a.title.localeCompare(b.title);
            });

        if (profileTags.length > 0) {
            const taggedProducts = products.filter(p =>
                Array.isArray(p.tags) && p.tags.some(tag => profileTags.includes(tag.toLowerCase()))
            );
            products = taggedProducts.length > 0 ? taggedProducts : products;
        }

        if (selectedCategory !== 'Todos') {
            products = products.filter(p => p.category === selectedCategory);
        }

        if (searchQuery.trim() !== '') {
            const lowercasedQuery = searchQuery.toLowerCase();
            products = products.filter(p =>
                p.title.toLowerCase().includes(lowercasedQuery) ||
                (p.description && p.description.toLowerCase().includes(lowercasedQuery)) ||
                p.tags?.some(tag => tag.toLowerCase().includes(lowercasedQuery))
            );
        }

        return products;
    }, [searchQuery, selectedCategory, productRecommendations, profileTags, settings.semanticTagScores]);

    const isRecommendedForProfile = (product: Recommendation) => {
        if (profileTags.length === 0) return false;
        if (!Array.isArray(product.tags)) return false;
        return getTagMatchScore(product) > 0;
    };
    
    const allCategories: string[] = ['Todos', ...RECOMMENDATION_CATEGORIES];

    return (
        <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-4 md:px-6 animate-in fade-in">
            <header className="py-4">
                 <button onClick={onClose} className="text-purple-600 font-semibold mb-2">&larr; Voltar</button>
                <h1 className="text-3xl font-bold">Recomendações</h1>
                <p className="text-gray-500">Produtos e livros que amamos</p>
            </header>

            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-lg p-3 my-4">
                <strong>Aviso:</strong> Alguns links podem ser de afiliado. Podemos receber uma comissão sem custo extra para você.
            </div>

            <div className="sticky top-0 bg-gray-50/80 backdrop-blur-sm py-3 z-10">
                <input
                    type="text"
                    placeholder="Buscar por nome ou palavra-chave..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                <div className="flex overflow-x-auto whitespace-nowrap gap-2 pt-3 no-scrollbar">
                    {allCategories.map(category => (
                        <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            className={`px-3 py-1 rounded-full text-sm font-semibold border transition-colors ${
                                selectedCategory === category 
                                ? 'bg-purple-600 text-white border-purple-600' 
                                : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>

            <main className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 pb-12">
                {filteredProducts.map(product => (
                    <div key={product.id} className="bg-white rounded-xl p-3 flex gap-3 items-start border border-gray-100 shadow-sm">
                        <img 
                            src={product.imageUrl || 'https://via.placeholder.com/160'} 
                            alt={product.title}
                            className="w-24 h-24 object-cover rounded-lg flex-shrink-0 bg-gray-100"
                        />
                        <div className="flex-1">
                            <h3 className="font-bold text-gray-800 leading-tight">{product.title}</h3>
                            {isRecommendedForProfile(product) && (
                                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 mt-1">
                                    Recomendado para voce
                                </span>
                            )}
                            {product.isAffiliate && <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-1.5 py-0.5 rounded">Link de afiliado</span>}
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                            <button 
                                onClick={() => window.open(product.linkUrl, '_blank', 'noopener,noreferrer')}
                                className="mt-2 bg-purple-100 text-purple-700 font-bold text-xs py-1.5 px-3 rounded-lg hover:bg-purple-200 transition-colors"
                            >
                                {product.ctaLabel || 'Ver'}
                            </button>
                        </div>
                    </div>
                ))}

                {filteredProducts.length === 0 && (
                    <div className="text-center py-16">
                        <GiftIcon className="w-16 h-16 text-gray-300 mx-auto" />
                        <p className="text-gray-500 mt-2">Nenhum produto encontrado.</p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default ProductsRecommendations;
