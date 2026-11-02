// Utilidades del panel: API, escape de HTML, formato, modal, avisos y delegación de eventos.

export const state = { pub: null, user: null, license: null };

export async function api(method, url, body) {
  const opts = { method, headers: { 'x-requested-with': 'streamcrm' }, credentials: 'same-origin' };
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    opts.headers['content-type'] = 'application/octet-stream';
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && !url.startsWith('/api/auth/login')) {
    state.user = null;
    location.hash = '#/login';
    throw new Error(data.error ?? 'Sesión terminada');
  }
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const money = (n, cur = state.pub?.currency ?? 'S/') => `${cur} ${Number(n ?? 0).toFixed(2)}`;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fdate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
export const fdatetime = (iso) => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
export const daysUntil = (iso) => Math.round((new Date(`${iso}T12:00:00Z`) - new Date(`${todayIso()}T12:00:00Z`)) / 86400000);

const LABELS = {
  activa: ['Activa', 'ok'], por_vencer: ['Por vencer', 'warn'], vencida: ['Vencida', 'bad'], cancelada: ['Cancelada', ''],
  pendiente: ['Aviso pendiente', ''], enviando: ['Enviando…', 'info'], enviado: ['Aviso enviado', 'info'], respondido: ['Respondió', 'ok'],
  fallido: ['Sin respuesta', 'bad'], manual: ['Avisar a mano', 'warn'],
  renueva: ['Renueva', 'ok'], no_renueva: ['No renueva', 'bad'], pensando: ['Lo piensa', 'warn'], sin_respuesta: ['Sin respuesta', ''],
};
export const badge = (key) => (key && LABELS[key] ? `<span class="badge ${LABELS[key][1]}">${LABELS[key][0]}</span>` : '');
export const label = (key) => LABELS[key]?.[0] ?? key;

export function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3500);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiado al portapapeles');
}

// ---------- Delegación: data-action="nombre" y <form data-form="nombre"> ----------
let actions = {};
let forms = {};
export function bind(a = {}, f = {}) {
  actions = { ...modalActions, ...a };
  forms = { ...modalForms, ...f };
}
let modalActions = {};
let modalForms = {};

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  try {
    await fn(el, ev);
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fn = forms[form.dataset.form];
  if (!fn) return;
  const btn = form.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  try {
    await fn(formData(form), form);
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

/** FormData → objeto; los checkbox salen como booleanos. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

// ---------- Modal ----------
const dialog = () => document.getElementById('modal');

export function openModal(title, html, { actions: a = {}, forms: f = {}, wide = false } = {}) {
  const d = dialog();
  d.style.width = wide ? 'min(820px, calc(100vw - 24px))' : '';
  d.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost small" data-action="closeModal" aria-label="Cerrar">✕</button></div><div class="modal-body">${html}</div>`;
  modalActions = { closeModal, ...a };
  modalForms = f;
  actions = { ...actions, ...modalActions };
  forms = { ...forms, ...modalForms };
  if (!d.open) d.showModal();
  return d;
}

export function closeModal() {
  const d = dialog();
  if (d.open) d.close();
  modalActions = {};
  modalForms = {};
}

export function confirmModal(title, text, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    openModal(title, `<p>${esc(text)}</p><div class="form-foot"><button class="btn" data-action="no">Volver</button><button class="btn primary" data-action="yes">${esc(okLabel)}</button></div>`, {
      actions: {
        yes: () => (closeModal(), resolve(true)),
        no: () => (closeModal(), resolve(false)),
      },
    });
    dialog().addEventListener('close', () => resolve(false), { once: true });
  });
}

export const options = (list, selected, { empty } = {}) =>
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');

export const PAYMENT_METHODS = [['yape', 'Yape'], ['plin', 'Plin'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['otro', 'Otro']];

export function readFileAs(file, how = 'dataURL') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    if (how === 'text') r.readAsText(file, 'utf-8');
    else if (how === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsDataURL(file);
  });
}

export const LEGAL_CONSENT = 'El cliente aceptó recibir llamadas automatizadas y mensajes de recordatorio (Ley 29733 de Protección de Datos Personales).';
export const LEGAL_RESALE = 'La reventa de cuentas o perfiles debe estar autorizada por los términos de servicio de cada plataforma. El negocio es responsable de cumplirlos.';
