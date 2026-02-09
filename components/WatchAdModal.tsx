
import React, { useState, useEffect } from 'react';

interface WatchAdModalProps {
  onAdFinished: () => void;
  onClose: () => void;
  title: string;
  description: string;
}

const WatchAdModal: React.FC<WatchAdModalProps> = ({ onAdFinished, onClose, title, description }) => {
  const [countdown, setCountdown] = useState(15);
  const [adWatched, setAdWatched] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (!adWatched) {
        setAdWatched(true);
        // Delay finishing to allow user to read the message
        setTimeout(() => {
            onAdFinished();
        }, 500);
    }
  }, [countdown, onAdFinished, adWatched]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
      <div className="bg-gray-800 text-white rounded-lg shadow-xl p-8 w-full max-w-md m-4 text-center">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <p className="mb-6">{description}</p>
        <div className="bg-black w-full aspect-video flex items-center justify-center border-2 border-gray-600 rounded-lg mb-6">
          <p className="text-2xl font-mono">Vídeo publicitário simulado</p>
        </div>
        <div className="text-xl font-bold">
          {countdown > 0 ? `Sua recompensa estará disponível em ${countdown}...` : 'Obrigado por assistir!'}
        </div>
        {countdown > 0 && (
            <button 
                onClick={onClose} 
                className="mt-6 text-sm text-gray-400 hover:text-white"
            >
                Pular e fechar
            </button>
        )}
      </div>
    </div>
  );
};

export default WatchAdModal;
