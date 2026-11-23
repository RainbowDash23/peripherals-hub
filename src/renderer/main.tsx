import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

window.addEventListener('error', (event) => {
  console.error('[GlobalError]', event.error?.stack || event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason?.stack || event.reason);
});

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
