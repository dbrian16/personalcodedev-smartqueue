import React from 'react';
import OnlinePlatform from './components/OnlinePlatform';
import { ErrorBoundary } from '@omni/shared-ui';

function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-4">
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-blue-700 mb-2 tracking-tighter uppercase">Omni-Remote 360</h1>
          <p className="text-blue-400 font-bold uppercase tracking-widest text-xs">Cloud Remote Ticketing Platform</p>
        </header>
        <OnlinePlatform />
        <footer className="mt-8 sm:mt-12 text-gray-400 text-[10px] text-center font-bold tracking-widest uppercase">
          Secure Cloud Infrastructure - &copy; 2026
        </footer>
      </div>
    </ErrorBoundary>
  );
}

export default App;
