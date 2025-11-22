/**
 * React クライアントアプリケーション エントリーポイント
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EikenPracticePage from './pages/eiken/practice';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/eiken/practice" replace />} />
        <Route path="/eiken/practice" element={<EikenPracticePage />} />
      </Routes>
    </BrowserRouter>
  );
}

// Mount React app
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
