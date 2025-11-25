import React from 'react';

/**
 * React クライアントアプリケーション エントリーポイント
 */
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EikenPracticePage from './pages/eiken/practice';
import VocabularyNotebookPage from './pages/vocabulary/notebook';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/eiken/practice" element={<EikenPracticePage />} />
        <Route path="/vocabulary/notebook" element={<VocabularyNotebookPage />} />
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
