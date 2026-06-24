import { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { useStore, selectView } from './store/useStore';
import { LobbyPage } from './components/LobbyPage';
import { TransferPage } from './components/TransferPage';
import { ErrorBoundary } from './components/ErrorBoundary';

function AppInner() {
  const initRef     = useRef(useStore.getState().init);
  const teardownRef = useRef(useStore.getState().teardown);
  const view        = useStore(selectView);

  useEffect(() => {
    initRef.current();
    const td = teardownRef.current;
    return () => td();
  }, []);

  return (
    <>
      {view === 'lobby' ? <LobbyPage /> : <TransferPage />}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(10,14,24,0.96)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '14px',
            fontSize: '13px',
            backdropFilter: 'blur(20px)',
          },
          success: { iconTheme: { primary: '#34d399', secondary: 'rgba(10,14,24,0.96)' } },
          error:   { iconTheme: { primary: '#f87171', secondary: 'rgba(10,14,24,0.96)' } },
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
