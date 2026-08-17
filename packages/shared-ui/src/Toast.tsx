import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'error', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center space-x-2 animate-in slide-in-from-top duration-300 max-w-[90vw]
        ${type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
    >
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        ✕
      </button>
    </div>
  );
};

export default Toast;
