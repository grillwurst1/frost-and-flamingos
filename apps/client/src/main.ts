import { mount } from 'svelte';
import '@fontsource/luckiest-guy/400.css';
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import App from './App.svelte';
import { preloadPaintedArt } from './components/icons/painted';
import './styles/app.css';

preloadPaintedArt();

const target = document.getElementById('app');
if (!target) {
  throw new Error('Missing #app mount point.');
}

const app = mount(App, { target });

export default app;
