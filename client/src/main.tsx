/**
 * נקודת הכניסה של הלקוח.
 *
 * טוענת את שכבות הסגנון בסדר הנכון (אסימונים → בסיס), עוטפת את
 * האפליקציה בנתב, ומפעילה StrictMode כדי לתפוס באגים בזמן פיתוח.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/base.css';

import { App } from './App';
import { RouterProvider } from './router';

const container = document.querySelector('#root');
if (!container) {
  throw new Error('לא נמצא אלמנט השורש (#root) — בדקו את index.html');
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider>
      <App />
    </RouterProvider>
  </StrictMode>,
);
