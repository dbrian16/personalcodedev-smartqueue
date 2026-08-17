import React from 'react';
import KioskForm from './components/KioskForm';
import { ErrorBoundary } from '@omni/shared-ui';
import { ShieldCheck } from 'lucide-react';
import { LanguageProvider } from './contexts/LanguageContext';

import { useLanguage } from './contexts/LanguageContext';

const AppContent = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <header className="mb-6 sm:mb-8 text-center animate-in slide-in-from-top duration-700">
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tighter uppercase">{t.appTitle}</h1>
        <p className="text-blue-400 font-bold uppercase tracking-widest text-xs">{t.appSubtitle}</p>
      </header>

      <div className="max-w-md w-full animate-in fade-in duration-500">
        <KioskForm />
      </div>

      <footer className="mt-8 sm:mt-12 text-gray-500 text-[10px] text-center">
        <div className="flex items-center justify-center space-x-2 mb-1">
          <ShieldCheck size={14} className="text-green-500" />
          <p className="font-bold tracking-widest">{t.appFooterSecure}</p>
        </div>
        <p>{t.appFooterId}</p>
      </footer>
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
