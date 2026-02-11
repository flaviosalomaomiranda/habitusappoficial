import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ✅ ADICIONE ESTES IMPORTS (ajuste o caminho se necessário)
import { AppProvider } from './context/AppContext';
import AuthGate from './components/AuthGate';
import { FeedbackProvider } from './context/FeedbackContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <FeedbackProvider>
      <AppProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AppProvider>
    </FeedbackProvider>
  </React.StrictMode>
);
