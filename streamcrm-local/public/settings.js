import { LEGAL_CONSENT, LEGAL_RESALE, api, bind, closeModal, confirmModal, copy, esc, fdatetime, openModal, options, readFileAs, state, toast } from './lib.js';
import { channelFields } from './setup.js';
import { refreshPublic } from './app.js';

const TABS = [
  ['negocio', 'Negocio y marca'],
  ['canales', 'Canales'],
  ['horarios', 'Horarios'],
  ['usuarios', 'Usuarios'],
  ['licencia', 'Licencia'],
  ['webhook', 'Webhook y red'],
  ['respaldos', 'Respaldos'],
  ['bitacora', 'Bitácora'],
];
const hours = Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, '0')}:00`]);
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export async function renderSettings(view, tab, g) {
  const d = await api('GET', '/api/settings');
  const s = d.settings;
  const lic = d.license;
  const reload = () => renderSettings(view, tab, g);
  const brandingOk = lic.mode === 'demo' || lic.features.includes('branding');

  async function save(values, msg = 'Guardado') {
    const r = await api('PUT', '/api/settings', values);
    toast(r.rescheduled ? `${msg}. Se reprogramaron ${r.rescheduled} aviso(s).` : msg);
    await refreshPublic();
    reload();
  }

  let body = '';
  const actions = {};
  const forms = {};

  if (tab === 'negocio') {
    body = `<form class="card" data-form="business"><div class="fields">
      <label>Nombre del negocio (se usa en llamadas y mensajes)<input name="business_name" required value="${esc(s.business_name)}"></label>
      <label>Nombre en el panel (opcional)<input name="panel_name" value="${esc(s.panel_name)}" ${brandingOk ? '' : 'disabled'}></label>
      <label>Color principal<input name="primary_color" type="color" value="${esc(s.primary_color)}" ${brandingOk ? '' : 'disabled'}></label>
      <label>WhatsApp de contacto<input name="contact_whatsapp" value="${esc(s.contact_whatsapp)}"></label>
      <label>País<select name="country">${options(Object.entries(d.countries).map(([k, c]) => [k, c.name]), s.country)}</select></label>
      <label>Zona horaria<input name="timezone" value="${esc(s.timezone)}"></label>
      <label>Moneda<input name="currency" value="${esc(s.currency)}" maxlength="8"></label>
    </div>
    ${brandingOk ? '' : '<p class="notice">Tu licencia no incluye marca personalizada (logo, color y nombre del panel).</p>'}
    <div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>
    <div class="card" style="margin-top:14px"><h2>Logo</h2>
      <div class="actions" style="align-items:center">${state.pub.branding.hasLogo ? '<img src="/branding/logo" alt="" style="height:56px;border-radius:12px">' : '<span class="muted">Sin logo (se usa la inicial)</span>'}
      <label class="btn" style="flex-direction:row;color:var(--text)" ${brandingOk ? '' : 'hidden'}>Subir logo<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" hidden></label>
      ${state.pub.branding.hasLogo ? '<button class="btn danger" data-action="removeLogo">Quitar</button>' : ''}</div>
      <p class="notice">PNG, JPG o WEBP de hasta 1 MB. También se usa como ícono de la pestaña.</p></div>`;
    forms.business = (v) => save(v);
    actions.removeLogo = async () => {
      await api('DELETE', '/api/settings/logo');
      await refreshPublic();
      location.reload();
    };
  }

  if (tab === 'canales') {
    body = `<form class="card" data-form="channels" id="chForm">
      <h2>Canal de recordatorios</h2>
      <div class="radio-cards">
        <label><input type="radio" name="reminder_channel" value="retell" ${s.reminder_channel === 'retell' ? 'checked' : ''}><span><b>Llamada con IA</b><br><small>Retell AI ${lic.mode !== 'demo' && !lic.features.includes('ai_calls') ? '· no incluido en tu licencia' : ''}</small></span></label>
        <label><input type="radio" name="reminder_channel" value="whatsapp" ${s.reminder_channel === 'whatsapp' ? 'checked' : ''}><span><b>WhatsApp automático</b><br><small>Cloud API ${lic.mode !== 'demo' && !lic.features.includes('whatsapp') ? '· no incluido en tu licencia' : ''}</small></span></label>
        <label><input type="radio" name="reminder_channel" value="manual" ${s.reminder_channel === 'manual' ? 'checked' : ''}><span><b>Solo manual</b><br><small>Botón wa.me</small></span></label>
      </div>
      <h3 style="margin-top:16px">Retell AI ${s.has_retell_api_key ? '<span class="badge ok">configurado</span>' : ''}</h3>${channelFields('retell', s)}
      <h3 style="margin-top:16px">WhatsApp Cloud API ${s.has_whatsapp_token ? '<span class="badge ok">configurado</span>' : ''}</h3>${channelFields('whatsapp', s)}
      <p class="notice">Las claves se guardan cifradas. Para cambiar una, escribe la nueva; si la dejas como está (••••) no se modifica.</p>
      <p class="notice">${esc(LEGAL_CONSENT)}</p><p class="notice">${esc(LEGAL_RESALE)}</p>
      <div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`;
    forms.channels = ({ test_phone, ...v }) => save(v);
    const formValues = () => {
      const f = document.getElementById('chForm');
      return Object.fromEntries([...f.elements].filter((e) => e.name).map((e) => [e.name, e.value]));
    };
    actions.testCall = async (el) => {
      const v = formValues();
      const phone = el.closest('.fields, form').querySelector('[name=test_phone]')?.value || v.test_phone;
      const r = await api('POST', '/api/settings/test-call', { ...v, phone });
      toast(`Llamada creada (${r.callId}). Tu teléfono debería sonar.`);
    };
    actions.testWhatsapp = async () => {
      const v = formValues();
      const phones = [...document.querySelectorAll('[name=test_phone]')].map((e) => e.value).filter(Boolean);
      await api('POST', '/api/settings/test-whatsapp', { ...v, phone: phones.at(-1) });
      toast('Mensaje de prueba enviado');
    };
  }

  if (tab === 'horarios') {
    body = `<form class="card" data-form="hours"><div class="fields">
      <label>Avisar cuántos días antes<input name="reminder_days_before" type="number" min="0" max="30" value="${esc(s.reminder_days_before)}"></label>
      <label>Hora del aviso<select name="reminder_hour">${options(hours, s.reminder_hour)}</select></label>
      <label>Llamar desde<select name="allowed_start_hour">${options(hours, s.allowed_start_hour)}</select></label>
      <label>Llamar hasta<select name="allowed_end_hour">${options(hours, s.allowed_end_hour)}</select></label>
      <label>"Por vencer" = faltan N días o menos<input name="por_vencer_days" type="number" min="0" max="30" value="${esc(s.por_vencer_days)}"></label>
      <label>Cerrar sesión tras minutos sin uso<input name="session_idle_minutes" type="number" min="5" value="${esc(s.session_idle_minutes)}"></label>
    </div><p class="notice">Zona horaria: ${esc(s.timezone)}. Los avisos que aún no salieron se recalculan al guardar.</p>
    <div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`;
    forms.hours = (v) => save(v);
  }

  if (tab === 'usuarios') {
    const { users, license } = await api('GET', '/api/users');
    body = `<div class="card"><div class="page-head" style="margin-bottom:6px"><h2>Usuarios (${license.usersCount}/${license.maxUsers})</h2>
      <button class="btn primary" data-action="newUser" ${license.usersCount >= license.maxUsers ? 'disabled title="Tu licencia no permite más usuarios"' : ''}>+ Usuario</button></div>
      <div class="list">${users
        .map(
          (u) => `<div class="row"><div><div class="title">${esc(u.name || u.email)}</div><div class="sub">${esc(u.email)}</div></div>
        <div class="sub">${u.role === 'admin' ? 'Administrador' : 'Vendedor'} · último ingreso ${fdatetime(u.last_login_at)}</div>
        <div class="tags">${u.active ? '<span class="badge ok">Activo</span>' : '<span class="badge">Inactivo</span>'}${u.locked_until && new Date(u.locked_until) > new Date() ? '<span class="badge bad">Bloqueado</span>' : ''}</div>
        <div class="actions"><button class="btn small" data-action="editUser" data-id="${u.id}">Editar</button></div></div>`,
        )
        .join('')}</div>
      <p class="notice">El vendedor registra ventas, renovaciones y ve credenciales (queda en la bitácora). No entra a Ajustes ni a Respaldos.</p></div>`;
    const userModal = (u) =>
      openModal(
        u ? 'Editar usuario' : 'Nuevo usuario',
        `<form data-form="saveUser"><div class="fields">
          <label>Nombre<input name="name" value="${esc(u?.name ?? '')}"></label>
          ${u ? '' : '<label>Email<input name="email" type="email" required></label>'}
          <label>Rol<select name="role">${options([['vendedor', 'Vendedor'], ['admin', 'Administrador']], u?.role ?? 'vendedor')}</select></label>
          <label>${u ? 'Nueva contraseña (opcional)' : 'Contraseña'}<input name="password" type="password" minlength="8" ${u ? '' : 'required'} autocomplete="new-password"></label>
          ${u ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Activo</label>` : ''}
        </div><div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`,
        {
          forms: {
            async saveUser(v) {
              if (u) {
                if (!v.password) delete v.password;
                await api('PUT', `/api/users/${u.id}`, v);
              } else await api('POST', '/api/users', v);
              closeModal();
              toast('Usuario guardado');
              reload();
            },
          },
        },
      );
    actions.newUser = () => userModal(null);
    actions.editUser = (el) => userModal(users.find((u) => u.id === Number(el.dataset.id)));
  }

  if (tab === 'licencia') {
    const rows = [
      ['Tipo', lic.mode === 'demo' ? 'Demo (14 días)' : lic.mode === 'perpetua' ? 'Perpetua' : lic.mode === 'anual' ? 'Anual' : 'Inválida'],
      ['Estado', lic.active ? '<span class="badge ok">Activa</span>' : '<span class="badge bad">Vencida · solo lectura</span>'],
      ['Negocio', esc(lic.businessName || '—')],
      ['ID', esc(lic.licenseId || '—')],
      ['Vence', lic.expiresAt ? `${fdatetime(lic.expiresAt)}${lic.daysLeft !== null ? ` (${lic.daysLeft} días)` : ''}` : 'Nunca'],
      ['Actualizaciones hasta', lic.supportUntil ? `${fdatetime(lic.supportUntil)}${lic.updatesAllowed ? '' : ' · <span class="badge warn">terminó</span>'}` : '—'],
      ['Funciones', lic.features.length ? lic.features.map((f) => `<span class="badge info">${esc({ ai_calls: 'Llamadas IA', whatsapp: 'WhatsApp API', multiuser: 'Multiusuario', branding: 'Marca propia' }[f] ?? f)}</span>`).join(' ') : '—'],
      ['Límite de suscripciones', lic.maxSubscriptions ?? 'Sin límite'],
      ['Usuarios', `${lic.usersCount} de ${lic.maxUsers}`],
    ];
    body = `<div class="card"><table class="table">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
      <p class="muted" style="margin-top:10px">Para renovar o ampliar: ${esc(lic.vendor.name)} · WhatsApp ${esc(lic.vendor.whatsapp)}${lic.vendor.email ? ` · ${esc(lic.vendor.email)}` : ''}</p></div>
      <form class="card" style="margin-top:14px" data-form="activate"><h2>Activar o cambiar licencia</h2>
      <label>Clave de licencia<textarea name="key" required rows="4" placeholder="STREAMCRM-…"></textarea></label>
      <div class="form-foot"><button class="btn primary" type="submit">Activar</button></div></form>`;
    forms.activate = async (v) => {
      await api('POST', '/api/license', v);
      toast('Licencia activada ✔');
      location.reload();
    };
  }

  if (tab === 'webhook') {
    const sys = d.system;
    body = `<div class="card"><h2>Webhook de Retell</h2>
      ${sys.webhookUrl ? `<p>Pega esta URL en tu agente de Retell (Webhook URL):</p><pre class="msg">${esc(sys.webhookUrl)}</pre><button class="btn small" data-action="copyHook">Copiar</button>` : '<div class="banner info">No hay URL pública. Las llamadas igual funcionan: el sistema consulta a Retell cada 2 minutos el resultado de cada llamada (get-call). Con túnel, el resultado llega al instante.</div>'}
      ${sys.tunnelUrl ? `<p class="muted" style="margin-top:8px">Túnel detectado: ${esc(sys.tunnelUrl)}</p>` : ''}
      <form data-form="publicUrl" style="margin-top:12px"><label>URL pública (Cloudflare Tunnel con dominio fijo, o tu VPS)<input name="public_url" value="${esc(s.public_url)}" placeholder="https://crm.tunegocio.com"></label>
      <div class="form-foot"><button class="btn" type="submit">Guardar URL</button></div></form>
      <p class="notice">Cómo crear el túnel: ejecuta <code>tunel.bat</code> (Windows) o <code>./tunel.sh</code> (Linux/macOS). Guía completa en docs/cloudflare-tunnel.md. Por el túnel solo se aceptan los webhooks: el panel no queda expuesto a internet.</p></div>
      <div class="card" style="margin-top:14px"><h2>Acceso desde el celular (red local)</h2>
      <p>Ahora: ${sys.lanEnabled ? `<span class="badge warn">habilitado</span> ${sys.lanUrls.map((u) => `<code>${esc(u)}</code>`).join(' ')}` : '<span class="badge ok">solo esta computadora</span>'}</p>
      <p class="notice">⚠ Con la red local habilitada, cualquier dispositivo en tu WiFi puede ver la pantalla de ingreso. Usa contraseñas fuertes y no lo actives en redes públicas.</p>
      <div class="actions"><button class="btn" data-action="lan" data-on="${sys.lanEnabled ? '' : '1'}">${sys.lanEnabled ? 'Deshabilitar red local' : 'Habilitar red local'}</button></div></div>
      <div class="card" style="margin-top:14px"><h2>Sistema</h2><table class="table">
      <tr><th>Versión</th><td>${esc(sys.version)} (${esc(sys.releaseDate)})</td></tr><tr><th>Node.js</th><td>${esc(sys.node)}</td></tr>
      <tr><th>Escucha en</th><td>${esc(sys.host)}:${sys.port}</td></tr><tr><th>Archivo de claves</th><td><code>${esc(sys.envFile)}</code></td></tr>
      <tr><th>Datos</th><td><code>${esc(sys.dataDir)}</code></td></tr></table>
      <p class="notice">Para actualizar: cierra el programa y ejecuta <code>actualizar.bat</code> (o <code>npm run update</code>). Se hace un respaldo antes.</p></div>`;
    actions.copyHook = () => copy(sys.webhookUrl);
    forms.publicUrl = (v) => save(v, 'URL guardada');
    actions.lan = async (el) => {
      const on = !!el.dataset.on;
      if (on && !(await confirmModal('Habilitar red local', 'Podrás entrar desde el celular en el mismo WiFi. Cualquiera en esa red verá la pantalla de ingreso. ¿Continuar?', 'Habilitar'))) return;
      const r = await api('PUT', '/api/system/lan', { enabled: on });
      toast(r.restartRequired ? 'Guardado. Cierra y vuelve a abrir StreamCRM para aplicarlo.' : 'Guardado');
    };
  }

  if (tab === 'respaldos') {
    const b = await api('GET', '/api/backups');
    body = `<div class="card"><h2>Respaldos</h2>
      <p>Se hace uno automático cada día a las ${String(s.backup_hour).padStart(2, '0')}:00 (o al encender la PC si estaba apagada) y se guardan los últimos 30 en <code>${esc(b.system.backupDir)}</code>.</p>
      <p class="muted">Último respaldo: ${fdatetime(b.system.lastBackupAt)}</p>
      <div class="actions"><a class="btn primary" href="/api/backups/now">Descargar respaldo ahora</a>
        <label class="btn" style="flex-direction:row;color:var(--text)">Restaurar desde archivo…<input type="file" id="restoreFile" accept=".db" hidden></label></div>
      <p class="notice">Además del respaldo de la base, guarda tu archivo <code>.env</code> en un lugar seguro: contiene la clave que cifra las contraseñas.</p></div>
      <form class="card" style="margin-top:14px" data-form="backupCfg"><h2>Copia en la nube (opcional)</h2>
      <div class="fields"><label class="full">Carpeta sincronizada (Google Drive u OneDrive)<input name="backup_copy_dir" value="${esc(s.backup_copy_dir)}" placeholder="C:\\Users\\TuUsuario\\OneDrive\\StreamCRM"></label>
      <label>Hora del respaldo diario<select name="backup_hour">${options(hours, s.backup_hour)}</select></label></div>
      <div class="form-foot"><button class="btn" type="submit">Guardar</button></div></form>
      <div class="card" style="margin-top:14px"><h2>Respaldos guardados (${b.backups.length})</h2>
      ${b.backups.length ? `<div class="table-wrap"><table class="table"><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th></th></tr>${b.backups.map((x) => `<tr><td><code>${esc(x.name)}</code></td><td>${fdatetime(x.createdAt)}</td><td>${size(x.size)}</td><td class="actions"><a class="btn small" href="/api/backups/${encodeURIComponent(x.name)}">Descargar</a><button class="btn small" data-action="restore" data-name="${esc(x.name)}">Restaurar</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Aún no hay respaldos</div>'}</div>`;
    forms.backupCfg = (v) => save(v);
    const doRestore = async (payload, what) => {
      if (!(await confirmModal('Restaurar respaldo', `Se reemplazarán los datos actuales por ${what}. Antes se guarda un respaldo de lo actual. ¿Continuar?`, 'Restaurar'))) return;
      await api('POST', '/api/backups/restore', payload);
      toast('Respaldo restaurado');
      setTimeout(() => location.reload(), 800);
    };
    actions.restore = (el) => doRestore({ name: el.dataset.name }, el.dataset.name);
    setTimeout(() =>
      document.getElementById('restoreFile')?.addEventListener('change', async (ev) => {
        const f = ev.target.files[0];
        if (f) doRestore(await readFileAs(f, 'buffer'), f.name).catch((e) => toast(e.message, true));
      }),
    );
  }

  if (tab === 'bitacora') {
    const { events } = await api('GET', '/api/events?limit=300');
    body = `<div class="card"><h2>Bitácora</h2><p class="muted">Llamadas, renovaciones, contraseñas vistas, cambios de ajustes e ingresos.</p>
      <div class="table-wrap"><table class="table"><tr><th>Fecha</th><th>Evento</th><th>Usuario</th><th>Detalle</th></tr>
      ${events.map((e) => `<tr><td>${fdatetime(e.created_at)}</td><td><code>${esc(e.type)}</code></td><td>${esc(e.user_name || e.user_email || 'sistema')}</td><td><small>${esc(e.entity ? `${e.entity} #${e.entity_id}` : '')} ${esc(e.data ? JSON.stringify(e.data) : '')}</small></td></tr>`).join('')}
      </table></div></div>`;
  }

  view.innerHTML = `<div class="page-head"><h1>Ajustes</h1></div>
    <nav class="tabs">${TABS.map(([k, l]) => `<a href="#/ajustes/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav>${body}`;

  view.querySelector('#logoFile')?.addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      if (f.size > 1024 * 1024) throw new Error('El logo no debe pasar de 1 MB');
      await api('POST', '/api/settings/logo', { dataUrl: await readFileAs(f) });
      await refreshPublic();
      location.reload();
    } catch (err) {
      toast(err.message, true);
    }
  });
  bind({ ...g, ...actions }, forms);
}
