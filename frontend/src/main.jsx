import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import App from './App.jsx';
import { githubDarkTheme } from './theme.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FluentProvider theme={githubDarkTheme} style={{ background: 'transparent', height: '100%' }}>
      <App />
    </FluentProvider>
  </React.StrictMode>
);
