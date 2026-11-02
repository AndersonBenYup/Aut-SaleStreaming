import { api, bind, closeModal, esc, state, toast } from './lib.js';
import { renderSetup } from './setup.js';
import { pages } from './pages.js';
import { renderSettings } from './settings.js';

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.4 3.5 5.2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const NAV = [
  ['#/', 'Resumen', 'home'],
  ['#/suscripciones', 'Suscripciones', 'list'],
  ['#/venta', 'Nueva venta', 'plus'],
  ['#/clientes', 'Clientes', 'users'],
  ['#/cuentas', 'Cuentas madre', 'key'],
  ['#/servicios', 'Servicios', 'box'],
  ['#/ajustes', 'Ajustes', 'gear', 'admin'],
];
const MOBILE_NAV = ['#/', '#/suscripciones', '#/venta', '#/clientes', '#/ajustes'];

// ---------- Tema claro/oscuro ----------
function applyTheme(t = localStorage.getItem('theme')) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  try {
    localStorage.setItem('theme', next);
  } catch {}
  applyTheme(next);
}
try {
  applyTheme();
} catch {}

function applyBranding(b) {
  const color = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#7c3aed';
  document.documentElement.style.setProperty('--brand', color);
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  document.documentElement.style.setProperty('--brand-ink', r * 0.299 + g * 0.587 + bl * 0.114 > 170 ? '#111' : '#fff');
  document.title = b.name || 'StreamCRM';
  document.querySelector('link[rel=icon]').href = b.hasLogo ? `/branding/logo?v=${Date.now()}` : `/favicon.svg?v=${encodeURIComponent(color)}`;
}

export const brandHtml = () => {
  const b = state.pub.branding;
  const logo = b.hasLogo ? `<img src="/branding/logo" alt="">` : `<span class="logo-fallback">${esc((b.name || 'S').charAt(0).toUpperCase())}</span>`;
  return `<div class="brand">${logo}<span>${esc(b.name)}</span></div>`;
};

export async function refreshPublic() {
  state.pub = await api('GET', '/api/public');
  applyBranding(state.pub.branding);
}

function shell(route) {
  const admin = state.user.role === 'admin';
  const items = NAV.filter((n) => !n[3] || admin);
  const active = (href) => (href === '#/' ? route === '' : route.startsWith(href.slice(2))) ? 'active' : '';
  const lic = state.license;
  const banner = lic?.message ? `<div class="banner ${lic.readOnly ? 'bad' : ''}">${esc(lic.message)}</div>` : '';
  return `
  <div class="layout">
    <aside class="sidebar">
      ${brandHtml()}
      <nav class="nav">${items.map(([h, l, i]) => `<a href="${h}" class="${active(h)}">${icon(i)}${l}</a>`).join('')}</nav>
      <div class="grow"></div>
      <nav class="nav">
        <a href="#" data-action="theme">${icon('moon')}Modo claro / oscuro</a>
        <a href="#" data-action="logout">${icon('out')}Cerrar sesión</a>
      </nav>
      <div class="me">${esc(state.user.name || state.user.email)} · ${state.user.role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
    </aside>
    <header class="topbar">${brandHtml()}<div class="actions"><button class="btn ghost small" data-action="theme" aria-label="Tema">${icon('moon')}</button><button class="btn ghost small" data-action="logout" aria-label="Salir">${icon('out')}</button></div></header>
    <main>${banner}<div id="view"><div class="muted">Cargando…</div></div>
      <p class="footer-note">StreamCRM Local v${esc(state.pub.version)}${state.pub.license.branding ? '' : ' · Hecho con StreamCRM'}</p>
    </main>
    <nav class="bottomnav">${items.filter((n) => MOBILE_NAV.includes(n[0])).map(([h, l, i]) => `<a href="${h}" class="${active(h)}">${icon(i)}<span>${l.split(' ')[0]}</span></a>`).join('')}</nav>
  </div>`;
}

const globalActions = {
  theme: toggleTheme,
  async logout() {
    await api('POST', '/api/auth/logout');
    state.user = null;
    location.hash = '#/login';
  },
};

function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="center"><div class="card auth-card">
    ${brandHtml()}
    <h1>Ingresar</h1>
    <p class="muted">Panel de ${esc(state.pub.branding.businessName)}</p>
    <form data-form="login" class="grid" style="margin-top:14px">
      <label>Email<input name="email" type="email" autocomplete="username" required autofocus></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Entrar</button>
    </form>
    <p class="footer-note">¿Olvidaste la contraseña? Otro administrador puede cambiarla en Ajustes → Usuarios.</p>
  </div></div>`;
  bind(globalActions, {
    async login(data) {
      const r = await api('POST', '/api/auth/login', data);
      state.user = r.user;
      location.hash = '#/';
      route();
    },
  });
}

export async function route() {
  closeModal();
  const hash = location.hash.replace(/^#\/?/, '');
  if (!state.pub) await refreshPublic();
  if (state.pub.setupRequired) return renderSetup();
  if (!state.user) {
    try {
      state.user = (await api('GET', '/api/auth/me')).user;
    } catch {
      state.user = null;
    }
  }
  if (!state.user || hash === 'login') {
    if (state.user && hash === 'login') return (location.hash = '#/');
    return renderLogin();
  }
  state.license = await api('GET', '/api/license').catch(() => null);
  document.getElementById('app').innerHTML = shell(hash);
  const view = document.getElementById('view');
  const [section, param] = hash.split('/');
  try {
    if (section === 'ajustes') {
      if (state.user.role !== 'admin') throw new Error('Solo el administrador puede ver Ajustes');
      await renderSettings(view, param || 'negocio', globalActions);
    } else {
      const page = pages[section || 'resumen'];
      if (!page) throw new Error('Página no encontrada');
      await page(view, param, globalActions);
    }
  } catch (err) {
    view.innerHTML = `<div class="banner bad">${esc(err.message)}</div>`;
    bind(globalActions);
  }
}

window.addEventListener('hashchange', route);
route().catch((err) => toast(err.message, true));
