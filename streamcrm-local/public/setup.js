import { LEGAL_CONSENT, LEGAL_RESALE, api, bind, esc, options, readFileAs, state, toast } from './lib.js';

const STEPS = ['Tu negocio', 'Administrador', 'Licencia', 'Recordatorios', 'Horarios'];
const w = { step: 0, settings: null, countries: {}, admin: {}, licenseKey: '', licenseMode: 'demo', logo: null, done: null };

const hours = Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, '0')}:00`]);

function stepHtml() {
  const s = w.settings;
  switch (w.step) {
    case 0:
      return `
      <h2>Datos de tu negocio</h2>
      <p class="muted">Este nombre aparece en el panel, en las llamadas del agente y en los mensajes de WhatsApp.</p>
      <div class="fields">
        <label class="full">Nombre del negocio<input name="business_name" required maxlength="80" value="${esc(s.business_name === 'Mi Negocio' ? '' : s.business_name)}" placeholder="Ej. Streaming Juan"></label>
        <label>WhatsApp de contacto<input name="contact_whatsapp" value="${esc(s.contact_whatsapp)}" placeholder="987 654 321"></label>
        <label>Color principal<input name="primary_color" type="color" value="${esc(s.primary_color)}"></label>
        <label>País<select name="country" data-country>${options(Object.entries(w.countries).map(([k, c]) => [k, c.name]), s.country)}</select></label>
        <label>Zona horaria<input name="timezone" value="${esc(s.timezone)}" required></label>
        <label>Moneda<input name="currency" value="${esc(s.currency)}" required maxlength="8"></label>
        <label>Logo (PNG, JPG o WEBP, opcional)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
      </div>
      ${w.logo ? '<p class="muted">✔ Logo cargado</p>' : ''}`;
    case 1:
      return `
      <h2>Usuario administrador</h2>
      <p class="muted">Con este usuario entrarás al panel. Después puedes crear vendedores.</p>
      <div class="fields">
        <label>Tu nombre<input name="name" value="${esc(w.admin.name ?? '')}" required></label>
        <label>Email<input name="email" type="email" value="${esc(w.admin.email ?? '')}" required autocomplete="username"></label>
        <label>Contraseña (mín. 8)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <label>Repite la contraseña<input name="password2" type="password" minlength="8" required autocomplete="new-password"></label>
      </div>`;
    case 2:
      return `
      <h2>Licencia</h2>
      <div class="radio-cards">
        <label><input type="radio" name="mode" value="license" ${w.licenseMode === 'license' ? 'checked' : ''}><span><b>Tengo una licencia</b><br><small>Pégala abajo.</small></span></label>
        <label><input type="radio" name="mode" value="demo" ${w.licenseMode === 'demo' ? 'checked' : ''}><span><b>Probar 14 días</b><br><small>Hasta 20 suscripciones; los avisos son simulados.</small></span></label>
      </div>
      <label style="margin-top:12px">Clave de licencia<textarea name="key" rows="4" placeholder="STREAMCRM-…">${esc(w.licenseKey)}</textarea></label>
      <div class="actions" style="margin-top:8px"><button class="btn small" data-action="checkLicense">Verificar licencia</button><span id="licResult" class="muted"></span></div>`;
    case 3:
      return `
      <h2>¿Cómo avisamos a tus clientes?</h2>
      <p class="muted">Antes de que venza cada suscripción, el sistema llama al cliente con un agente de voz de IA o le escribe por WhatsApp. Usa <b>tu propia cuenta</b> de Retell o de WhatsApp Business.</p>
      <div class="radio-cards">
        <label><input type="radio" name="reminder_channel" value="retell" ${s.reminder_channel === 'retell' ? 'checked' : ''}><span><b>Llamada con IA</b><br><small>Retell AI</small></span></label>
        <label><input type="radio" name="reminder_channel" value="whatsapp" ${s.reminder_channel === 'whatsapp' ? 'checked' : ''}><span><b>WhatsApp automático</b><br><small>WhatsApp Cloud API</small></span></label>
        <label><input type="radio" name="reminder_channel" value="manual" ${s.reminder_channel === 'manual' ? 'checked' : ''}><span><b>Solo manual</b><br><small>Botón de WhatsApp, sin API</small></span></label>
      </div>
      <div id="chFields" style="margin-top:14px">${channelFields(s.reminder_channel)}</div>
      <p class="notice">${esc(LEGAL_CONSENT)} Solo se llama a los clientes marcados con consentimiento; el resto va a la lista de aviso manual.</p>
      <p class="notice">${esc(LEGAL_RESALE)}</p>
      ${w.licenseMode === 'demo' ? '<div class="banner info">En modo demo los avisos se simulan (no se llama a nadie). Puedes probar tus claves con los botones de prueba.</div>' : ''}`;
    case 4:
      return `
      <h2>Horario de los avisos</h2>
      <div class="fields">
        <label>Avisar cuántos días antes<input name="reminder_days_before" type="number" min="0" max="30" value="${esc(s.reminder_days_before)}"></label>
        <label>Hora del aviso<select name="reminder_hour">${options(hours, s.reminder_hour)}</select></label>
        <label>Llamar desde<select name="allowed_start_hour">${options(hours, s.allowed_start_hour)}</select></label>
        <label>Llamar hasta<select name="allowed_end_hour">${options(hours, s.allowed_end_hour)}</select></label>
      </div>
      <p class="notice">Ejemplo: si vence el 20, se avisa el ${20 - Number(s.reminder_days_before)} a las ${String(s.reminder_hour).padStart(2, '0')}:00 (hora de ${esc(s.timezone)}). Si el cliente no contesta, se reintenta cada 2 horas, máximo 3 veces.</p>`;
  }
  return '';
}

export function channelFields(ch, s = w.settings) {
  if (ch === 'retell') {
    return `<div class="fields">
      <label>API key de Retell<input name="retell_api_key" value="${esc(s.retell_api_key ?? '')}" placeholder="key_…" autocomplete="off"></label>
      <label>Agent ID<input name="retell_agent_id" value="${esc(s.retell_agent_id ?? '')}" placeholder="agent_…"></label>
      <label>Número saliente (de Retell)<input name="retell_from_number" value="${esc(s.retell_from_number ?? '')}" placeholder="+14155550100"></label>
      <label>Tu número para la prueba<input name="test_phone" placeholder="987 654 321"></label>
    </div>
    <div class="actions" style="margin-top:8px"><button class="btn small" data-action="testCall">📞 Probar llamada a mi número</button></div>
    <p class="notice">Guía paso a paso para crear el agente: docs/retell-agent.md</p>`;
  }
  if (ch === 'whatsapp') {
    return `<div class="fields">
      <label>Phone number ID<input name="whatsapp_phone_number_id" value="${esc(s.whatsapp_phone_number_id ?? '')}"></label>
      <label>Token de acceso<input name="whatsapp_token" value="${esc(s.whatsapp_token ?? '')}" autocomplete="off"></label>
      <label>Plantilla aprobada<input name="whatsapp_template" value="${esc(s.whatsapp_template ?? 'recordatorio_renovacion')}"></label>
      <label>Tu número para la prueba<input name="test_phone" placeholder="987 654 321"></label>
    </div>
    <div class="actions" style="margin-top:8px"><button class="btn small" data-action="testWhatsapp">💬 Enviar mensaje de prueba</button></div>
    <p class="notice">La plantilla debe tener 5 variables: cliente, servicio, fecha, precio y negocio (ver README).</p>`;
  }
  return '<p class="muted">Cada día verás en el Resumen la lista "Recordatorios manuales de hoy", con un botón que abre WhatsApp con el mensaje ya escrito.</p>';
}

function collect(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file') continue;
    if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
    } else data[el.name] = el.value;
  }
  return data;
}

function render() {
  const app = document.getElementById('app');
  if (w.done) {
    app.innerHTML = `
    <div class="center"><div class="card wizard">
      <h1>¡Listo! 🎉</h1>
      <p>${esc(w.settings.business_name)} ya está configurado.</p>
      <div class="banner"><b>Importante: haz una copia de seguridad.</b><br>
        Guarda en un USB o en la nube el archivo <code>${esc(w.done.envFile)}</code> y la carpeta <code>${esc(w.done.dataDir)}</code>.
        Sin el archivo .env no se pueden leer las contraseñas guardadas. Los respaldos diarios automáticos quedan en <code>${esc(w.done.backupDir)}</code>.</div>
      <div class="form-foot"><button class="btn primary" data-action="enter">Entrar al panel</button></div>
    </div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="center"><div class="card wizard">
    <div class="muted">Configuración inicial · Paso ${w.step + 1} de ${STEPS.length}: ${STEPS[w.step]}</div>
    <div class="steps">${STEPS.map((_, i) => `<span class="${i <= w.step ? 'on' : ''}"></span>`).join('')}</div>
    <form data-form="step" id="wform">${stepHtml()}
      <div class="form-foot">
        ${w.step > 0 ? '<button class="btn" type="button" data-action="back">Atrás</button>' : ''}
        <button class="btn primary" type="submit">${w.step === STEPS.length - 1 ? 'Terminar' : 'Siguiente'}</button>
      </div>
    </form>
  </div></div>`;
  const form = document.getElementById('wform');
  form.addEventListener('change', async (ev) => {
    const el = ev.target;
    if (el.name === 'country') {
      const c = w.countries[el.value];
      form.timezone.value = c.tz;
      form.currency.value = c.currency;
    }
    if (el.name === 'reminder_channel') {
      Object.assign(w.settings, collect(form));
      document.getElementById('chFields').innerHTML = channelFields(el.value);
    }
    if (el.name === 'logo' && el.files[0]) {
      if (el.files[0].size > 1024 * 1024) return toast('El logo no debe pasar de 1 MB', true);
      w.logo = await readFileAs(el.files[0]);
      toast('Logo cargado');
    }
    if (el.name === 'mode') w.licenseMode = el.value;
  });
}

async function next(data) {
  if (w.step === 0) {
    const { logo, ...rest } = data;
    Object.assign(w.settings, rest);
  } else if (w.step === 1) {
    if (data.password !== data.password2) throw new Error('Las contraseñas no coinciden');
    w.admin = { name: data.name, email: data.email, password: data.password };
  } else if (w.step === 2) {
    w.licenseMode = data.mode;
    w.licenseKey = (data.key ?? '').trim();
    if (w.licenseMode === 'license') await api('POST', '/api/setup/license-check', { key: w.licenseKey });
  } else if (w.step === 3) {
    const { test_phone, ...rest } = data;
    Object.assign(w.settings, rest);
  } else if (w.step === 4) {
    Object.assign(w.settings, data);
    const r = await api('POST', '/api/setup/complete', {
      settings: w.settings,
      admin: w.admin,
      licenseKey: w.licenseMode === 'license' ? w.licenseKey : '',
      logo: w.logo,
    });
    w.done = r;
    return render();
  }
  w.step++;
  render();
}

export async function renderSetup() {
  if (!w.settings) {
    const d = await api('GET', '/api/setup/defaults');
    w.settings = d.settings;
    w.countries = d.countries;
    if (d.license) {
      w.licenseKey = d.license;
      w.licenseMode = 'license';
    }
  }
  bind(
    {
      back() {
        w.step = Math.max(0, w.step - 1);
        render();
      },
      async checkLicense() {
        const key = document.querySelector('[name=key]').value;
        const r = await api('POST', '/api/setup/license-check', { key });
        const l = r.license;
        document.getElementById('licResult').textContent = `✔ ${l.businessName} · ${l.type}${l.expiresAt ? ` hasta ${l.expiresAt.slice(0, 10)}` : ''}`;
      },
      async testCall() {
        const d = { ...w.settings, ...collect(document.getElementById('wform')) };
        const r = await api('POST', '/api/setup/test-call', { ...d, phone: d.test_phone });
        toast(`Llamada creada (${r.callId}). Tu teléfono debería sonar en segundos.`);
      },
      async testWhatsapp() {
        const d = { ...w.settings, ...collect(document.getElementById('wform')) };
        await api('POST', '/api/setup/test-whatsapp', { ...d, phone: d.test_phone });
        toast('Mensaje enviado. Revisa tu WhatsApp.');
      },
      enter() {
        state.pub = null;
        location.hash = '#/';
        location.reload();
      },
    },
    { step: next },
  );
  render();
}
