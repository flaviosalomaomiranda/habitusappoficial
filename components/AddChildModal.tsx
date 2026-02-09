
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ANIMAL_EMOJIS } from '../constants';
import { getTodayDateString } from '../utils/dateUtils';

interface AddChildModalProps {
  onClose: () => void;
}

const AddChildModal: React.FC<AddChildModalProps> = ({ onClose }) => {
  const { addChild } = useAppContext();
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(ANIMAL_EMOJIS[0]);
  const [birthDate, setBirthDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && selectedAvatar) {
      addChild(name.trim(), selectedAvatar, birthDate);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-md m-0 sm:m-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Adicionar Nova Pessoa</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="child-name" className="block text-gray-700 font-semibold mb-2">Nome da Pessoa</label>
            <input
              id="child-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: Mia"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="birth-date" className="block text-gray-700 font-semibold mb-2">Data de Nascimento</label>
            <input
              id="birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              max={getTodayDateString()}
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Escolha um Avatar</label>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {ANIMAL_EMOJIS.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  onClick={() => setSelectedAvatar(avatar)}
                  className={`text-4xl p-2 rounded-lg transition-transform transform hover:scale-110 ${selectedAvatar === avatar ? 'bg-purple-200 ring-2 ring-purple-500' : 'bg-gray-100'}`}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              Adicionar Pessoa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddChildModal;
