
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { getStates, getCitiesByState, type UF, type Municipio } from '../services/ibgeService';

interface LocationSettingsModalProps {
    onClose: () => void;
}

const LocationSettingsModal: React.FC<LocationSettingsModalProps> = ({ onClose }) => {
    const { settings, setFamilyLocation } = useAppContext();
    const [states, setStates] = useState<UF[]>([]);
    const [cities, setCities] = useState<Municipio[]>([]);
    const [isLoadingStates, setIsLoadingStates] = useState(true);
    const [isLoadingCities, setIsLoadingCities] = useState(false);

    const [selectedState, setSelectedState] = useState(settings.familyLocation?.uf || '');
    const [selectedCityId, setSelectedCityId] = useState(settings.familyLocation?.cityId || '');

    useEffect(() => {
        getStates().then(data => {
            setStates(data);
            setIsLoadingStates(false);
        });
    }, []);

    useEffect(() => {
        if (!selectedState) {
            setCities([]);
            return;
        }
        setIsLoadingCities(true);
        getCitiesByState(selectedState).then(data => {
            setCities(data);
            setIsLoadingCities(false);
        });
    }, [selectedState]);

    const handleSave = () => {
        const cityObj = cities.find(c => String(c.id) === selectedCityId);
        if (selectedState && cityObj) {
            setFamilyLocation({
                uf: selectedState,
                cityId: String(cityObj.id),
                cityName: cityObj.nome
            });
            onClose();
        } else {
            alert('Selecione estado e cidade.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Localização da Família</h2>
                <p className="text-gray-500 text-sm mb-6">Defina sua cidade para receber recomendações de especialistas da Rede de Apoio.</p>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Estado (UF)</label>
                        {isLoadingStates ? (
                            <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
                        ) : (
                            <select 
                                value={selectedState} 
                                onChange={(e) => { setSelectedState(e.target.value); setSelectedCityId(''); }}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                            >
                                <option value="">Selecione...</option>
                                {states.map(s => <option key={s.id} value={s.sigla}>{s.nome}</option>)}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Cidade</label>
                        <select 
                            value={selectedCityId} 
                            onChange={(e) => setSelectedCityId(e.target.value)}
                            disabled={!selectedState || isLoadingCities}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                        >
                            <option value="">{isLoadingCities ? 'Carregando...' : 'Selecione...'}</option>
                            {cities.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={!selectedState || !selectedCityId}
                        className="flex-1 px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50"
                    >
                        Salvar Local
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LocationSettingsModal;
