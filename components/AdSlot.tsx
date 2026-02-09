
import React, { useMemo } from 'react';
import { ADS } from '../data/ads';

interface AdSlotProps {
    placement: 'PARENT_DASHBOARD' | 'SIDEBAR' | 'MOBILE_BANNER';
}

const AdSlot: React.FC<AdSlotProps> = ({ placement }) => {
    // Escolhe um anúncio aleatório da lista
    const ad = useMemo(() => ADS[Math.floor(Math.random() * ADS.length)], [placement]);

    if (placement === 'SIDEBAR') {
        return (
            <div className="mt-auto pt-4 hidden md:block">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Patrocinado</span>
                    <h4 className="text-sm font-bold text-gray-700 mt-1">{ad.title}</h4>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-1">{ad.description}</p>
                    <a 
                        href={ad.href} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block text-center mt-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-200 transition-colors"
                    >
                        {ad.ctaText}
                    </a>
                </div>
            </div>
        );
    }
    
    if (placement === 'MOBILE_BANNER') {
        return (
            <a href={ad.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-left">
                {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />}
                <div className="flex-1 overflow-hidden">
                    <h4 className="text-xs font-bold text-gray-700 truncate">{ad.title}</h4>
                    <p className="text-[10px] text-gray-500 truncate">{ad.description}</p>
                </div>
                <div className={`px-3 py-2 rounded-lg text-white font-bold text-xs whitespace-nowrap ${ad.color || 'bg-purple-600'}`}>
                    {ad.ctaText}
                </div>
            </a>
        );
    }


    return (
        <div className="my-6 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm flex flex-col sm:flex-row">
            {ad.imageUrl && (
                <div className="sm:w-1/3 h-32 sm:h-auto overflow-hidden">
                    <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                </div>
            )}
            <div className={`p-5 sm:p-6 flex-1 flex flex-col justify-center ${!ad.imageUrl ? 'border-l-4 ' + ad.color : ''}`}>
                <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sugestão Kiddo</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mt-1">{ad.title}</h3>
                <p className="text-gray-500 mt-2 text-xs sm:text-base leading-relaxed">{ad.description}</p>
                <div className="mt-4">
                    <a 
                        href={ad.href} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`inline-block px-5 py-2 rounded-xl text-white font-bold text-sm transition-all transform hover:scale-105 ${ad.color || 'bg-purple-600'}`}
                    >
                        {ad.ctaText}
                    </a>
                </div>
            </div>
        </div>
    );
};

export default AdSlot;
