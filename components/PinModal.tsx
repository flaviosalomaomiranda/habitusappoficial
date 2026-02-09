
import React, { useState } from 'react';

interface PinModalProps {
  onCorrectPin: (pin: string) => void;
  onClose: () => void;
  isSettingPin: boolean;
}

const PinModal: React.FC<PinModalProps> = ({ onCorrectPin, onClose, isSettingPin }) => {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 4) {
      onCorrectPin(pin);
    } else {
      alert('O PIN deve ter 4 dígitos.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[120]">
      <div className="bg-white rounded-2xl p-8 text-center text-gray-800 shadow-lg mx-4">
        <h3 className="text-2xl font-bold">{isSettingPin ? 'Defina um PIN de 4 dígitos' : 'Digite o PIN dos Pais'}</h3>
        <p className="text-sm mt-2 text-gray-500">{isSettingPin ? 'Este PIN será usado para acessar as configurações.' : 'É preciso do PIN para sair do Modo Foco.'}</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d*"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-40 text-center text-4xl tracking-[.5em] font-bold mt-6 p-2 border-b-2 focus:border-purple-500 outline-none"
            autoFocus
          />
          <div className="flex justify-center gap-4 mt-8">
            <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300">Cancelar</button>
            <button type="submit" className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700">Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PinModal;
