
import React from 'react';
import { ADS } from '../data/ads';
import { SparklesIcon } from './icons/MiscIcons';

interface SponsoredBonusModalProps {
    onClose: () => void;
    onClaim: () => void;
}

const SponsoredBonusModal: React.FC<SponsoredBonusModalProps> = ({ onClose, onClaim }) => {
    const ad = ADS[Math.floor(Math.random() * ADS.length)];

    const handleOpenAd = () => {
        onClaim();
        window.open(ad.href, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 text-center">
                    <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <SparklesIcon className="w-12 h-12 text-yellow-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">Bônus Diário</h2>
                    <p className="text-gray-600 mt-3">Apoie o app visitando uma recomendação e ganhe <span className="font-bold text-purple-600">+1 Diamante (1 vez ao dia)</span> para a família.</p>
                    
                    <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                        <h4 className="font-bold text-gray-700">{ad.title}</h4>
                        <p className="text-sm text-gray-500 mt-1">{ad.description}</p>
                    </div>

                    <div className="mt-8 flex flex-col gap-3">
                        <button 
                            onClick={handleOpenAd}
                            className="w-full py-4 bg-purple-600 text-white font-bold rounded-2xl shadow-lg hover:bg-purple-700 transition-all transform hover:-translate-y-1"
                        >
                            Apoiar e Ganhar +1 💎
                        </button>
                        <button 
                            onClick={onClose}
                            className="w-full py-3 text-gray-500 font-semibold hover:text-gray-800 transition-colors"
                        >
                            Agora não
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SponsoredBonusModal;
