/**
 * 애플리케이션 진입점
 *
 * React 앱을 DOM에 마운트한다.
 * BrowserRouter로 감싸서 페이지 라우팅을 활성화한다.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
