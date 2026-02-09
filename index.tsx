import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ✅ ADICIONE ESTES IMPORTS (ajuste o caminho se necessário)
import { AppProvider } from './context/AppContext';
import AuthGate from './components/AuthGate';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AppProvider>
  </React.StrictMode>
);
