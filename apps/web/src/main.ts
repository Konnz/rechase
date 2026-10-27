import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';

registerSW({ immediate: true });

const target = document.getElementById('app')!;
// Der Adminbereich ist ein eigener Einstieg und wird nur dort geladen
if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
  void import('./lib/admin/AdminApp.svelte').then(({ default: AdminApp }) => mount(AdminApp, { target }));
} else {
  mount(App, { target });
}
