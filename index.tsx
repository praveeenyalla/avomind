import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Fix: The original content of this file was invalid text, causing parsing errors.
// This has been replaced with a standard React entry point.
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);