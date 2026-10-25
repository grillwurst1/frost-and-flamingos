import { mount } from 'svelte';
import '@fontsource/luckiest-guy/400.css';
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import App from './App.svelte';
import './styles/app.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Missing #app mount point.');
}

const app = mount(App, { target });

export default app;
