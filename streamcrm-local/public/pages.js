import {
  LEGAL_CONSENT, PAYMENT_METHODS, addDaysIso, api, badge, bind, closeModal, confirmModal, copy, daysUntil, esc, fdate, fdatetime,
  label, money, openModal, options, readFileAs, state, toast, todayIso,
} from './lib.js';

const ro = () => state.license?.readOnly;
const dis = () => (ro() ? 'disabled title="Solo lectura: licencia vencida"' : '');

// ---------------- Acciones comunes sobre suscripciones ----------------

function subActions(reload) {
  return {
    async renew(el) {
      const { subscription: s } = await api('GET', `/api/subscriptions/${el.dataset.id}`);
      const from = s.end_date < todayIso() ? todayIso() : s.end_date;
      openModal(
        `Renovar · ${s.customer_name}`,
        `<form data-form="renew" data-id="${s.id}"><div class="fields">
          <label>Monto cobrado<input name="amount" type="number" step="0.01" min="0" value="${s.price}" required></label>
          <label>Método<select name="method">${options(PAYMENT_METHODS, 'yape')}</select></label>
          <label>Días a extender<input name="days" type="number" min="1" value="30" required></label>
          <label>Nota<input name="note" maxlength="300"></label>
        </div>
        <p class="notice">Se extiende desde ${fdate(from)} (${s.end_date < todayIso() ? 'ya venció, cuenta desde hoy' : 'su vencimiento actual'}) y se reprograma el aviso.</p>
        <div class="form-foot"><button class="btn primary" type="submit">Registrar pago y renovar</button></div></form>`,
        {
          forms: {
            async renew(d, f) {
              const r = await api('POST', `/api/subscriptions/${f.dataset.id}/renew`, d);
              closeModal();
              toast(`Renovada hasta ${fdate(r.end_date)}`);
              reload();
            },
          },
        },
      );
    },
    async remind(el) {
      await api('POST', `/api/subscriptions/${el.dataset.id}/remind`);
      toast('Aviso en cola: sale en menos de un minuto');
      reload();
    },
    async creds(el) {
      const r = await api('POST', `/api/subscriptions/${el.dataset.id}/credentials`);
      const phone = el.dataset.phone;
      openModal(
        'Credenciales para enviar',
        `<pre class="msg">${esc(r.message)}</pre>
        <div class="form-foot"><button class="btn" data-action="copyMsg">Copiar</button>
        ${phone ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${esc(phone.replace(/\D/g, ''))}?text=${encodeURIComponent(r.message)}">Enviar por WhatsApp</a>` : ''}</div>
        <p class="notice">Ver credenciales queda registrado en la bitácora.</p>`,
        { actions: { copyMsg: () => copy(r.message) } },
      );
    },
    async edit(el) {
      const [{ subscription: s }, { services }, { accounts }] = await Promise.all([
        api('GET', `/api/subscriptions/${el.dataset.id}`),
        api('GET', '/api/services'),
        api('GET', '/api/accounts'),
      ]);
      openModal(
        `Editar · ${s.customer_name}`,
        `<form data-form="editSub" data-id="${s.id}"><div class="fields">
          <label>Servicio<select name="serviceId">${options(services.map((x) => [x.id, x.name]), s.service_id, { empty: '—' })}</select></label>
          <label>Cuenta madre<select name="accountId">${options(accounts.map((a) => [a.id, `${a.platform} · ${a.email}`]), s.stream_account_id, { empty: 'Sin cuenta' })}</select></label>
          <label>Perfil<input name="profileName" value="${esc(s.profile_name ?? '')}"></label>
          <label>PIN (vacío = no cambiar)<input name="pin" inputmode="numeric" placeholder="${s.has_pin ? '••••' : ''}"></label>
          <label>Inicio<input name="startDate" type="date" value="${s.start_date}" required></label>
          <label>Vencimiento<input name="endDate" type="date" value="${s.end_date}" required></label>
          <label>Precio<input name="price" type="number" step="0.01" min="0" value="${s.price}"></label>
          <label class="full">Notas<textarea name="notes">${esc(s.notes ?? '')}</textarea></label>
        </div><div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`,
        {
          forms: {
            async editSub(d, f) {
              if (!d.pin) delete d.pin;
              await api('PUT', `/api/subscriptions/${f.dataset.id}`, d);
              closeModal();
              toast('Guardado');
              reload();
            },
          },
        },
      );
    },
    async cancel(el) {
      if (!(await confirmModal('Cancelar suscripción', 'Ya no se enviarán avisos y el perfil quedará libre. ¿Continuar?', 'Cancelar suscripción'))) return;
      await api('POST', `/api/subscriptions/${el.dataset.id}/cancel`);
      toast('Suscripción cancelada');
      reload();
    },
    async intent(el) {
      openModal(
        'Anotar respuesta del cliente',
        `<div class="actions">${['renueva', 'pensando', 'no_renueva', 'sin_respuesta'].map((i) => `<button class="btn" data-action="setIntent" data-id="${el.dataset.id}" data-intent="${i}">${label(i)}</button>`).join('')}</div>`,
        {
          actions: {
            async setIntent(b) {
              await api('POST', `/api/subscriptions/${b.dataset.id}/intent`, { intent: b.dataset.intent });
              closeModal();
              toast('Respuesta guardada');
              reload();
            },
          },
        },
      );
    },
    async waManual(el) {
      window.open(el.dataset.href, '_blank', 'noopener');
      await api('POST', `/api/subscriptions/${el.dataset.id}/manual-sent`);
      setTimeout(reload, 400);
    },
  };
}

function subRow(s, { compact = false } = {}) {
  const d = daysUntil(s.end_date);
  const when = d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : `vence en ${d} d`;
  return `<div class="row">
    <div><div class="title"><a href="#/clientes/${s.customer_id}">${esc(s.customer_name)}</a></div><div class="sub">${esc(s.phone ?? 'sin teléfono')}${s.consent_calls ? '' : ' · sin consentimiento'}</div></div>
    <div><div>${esc(s.service_name ?? s.platform ?? '—')}${s.profile_name ? ` · ${esc(s.profile_name)}` : ''}</div><div class="sub">${fdate(s.end_date)} · ${when} · ${money(s.price)}</div></div>
    <div class="tags">${badge(s.status)} ${compact ? '' : badge(s.reminder_status)} ${badge(s.renewal_intent)}</div>
    <div class="actions">
      ${s.wa_link && s.reminder_status === 'manual' ? `<button class="btn small wa" data-action="waManual" data-id="${s.id}" data-href="${esc(s.wa_link)}">WhatsApp</button>` : ''}
      ${s.wa_link && s.reminder_status !== 'manual' ? `<a class="btn small wa" target="_blank" rel="noopener" href="${esc(s.wa_link)}">WhatsApp</a>` : ''}
      <button class="btn small primary" data-action="renew" data-id="${s.id}" ${dis()}>Renovar</button>
      ${compact ? '' : `<button class="btn small" data-action="remind" data-id="${s.id}" ${dis()}>Avisar ya</button>
      <button class="btn small" data-action="creds" data-id="${s.id}" data-phone="${esc(s.phone ?? '')}">Credenciales</button>
      <button class="btn small" data-action="intent" data-id="${s.id}" ${dis()}>Respuesta</button>
      <button class="btn small" data-action="edit" data-id="${s.id}" ${dis()}>Editar</button>
      ${s.status !== 'cancelada' ? `<button class="btn small danger" data-action="cancel" data-id="${s.id}" ${dis()}>Cancelar</button>` : ''}`}
    </div>
    ${s.last_call_summary && !compact ? `<div class="sub full" style="grid-column:1/-1">📝 ${esc(s.last_call_summary)}${s.recording_url ? ` · <a href="${esc(s.recording_url)}" target="_blank" rel="noopener">grabación</a>` : ''}</div>` : ''}
  </div>`;
}

const listOrEmpty = (rows, fn, empty) => (rows.length ? `<div class="list">${rows.map(fn).join('')}</div>` : `<div class="empty">${empty}</div>`);

// ---------------- Resumen ----------------

async function resumen(view, _p, g) {
  const d = await api('GET', '/api/dashboard');
  state.pub.currency = d.currency;
  const reload = () => resumen(view, _p, g);
  view.innerHTML = `
  <div class="page-head"><div><h1>Resumen</h1><div class="muted">Hoy ${fdate(d.today)} · ${esc(d.month)}</div></div>
    <a class="btn primary" href="#/venta">+ Nueva venta</a></div>
  <div class="grid kpis">
    <div class="card kpi ok"><div class="label">Activas</div><div class="value">${d.counts.activa}</div></div>
    <div class="card kpi warn"><div class="label">Por vencer</div><div class="value">${d.counts.por_vencer}</div></div>
    <div class="card kpi bad"><div class="label">Vencidas</div><div class="value">${d.counts.vencida}</div></div>
    <div class="card kpi"><div class="label">Ingresos del mes</div><div class="value">${money(d.income)}</div></div>
    <div class="card kpi ${d.profit >= 0 ? 'ok' : 'bad'}"><div class="label">Ganancia del mes</div><div class="value">${money(d.profit)}</div><small>ventas − costo de cuentas madre (${money(d.accountsCost)})${d.callsCostUsd ? ` · llamadas US$ ${d.callsCostUsd.toFixed(2)}` : ''}</small></div>
  </div>
  ${d.accountAlerts.length ? `<div class="banner">${d.accountAlerts.map((a) => `⚠ Tu cuenta ${esc(a.platform)} madre (${esc(a.email)}) ${daysUntil(a.expires_at) < 0 ? 'venció' : `vence ${daysUntil(a.expires_at) === 0 ? 'hoy' : `en ${daysUntil(a.expires_at)} días`}`} (${fdate(a.expires_at)}).`).join('<br>')} <a href="#/cuentas">Ver cuentas</a></div>` : ''}
  <div class="grid two">
    <section class="card"><h2>📲 Recordatorios manuales de hoy (${d.manuales.length})</h2>
      <p class="muted">Clientes sin consentimiento de llamadas o sin canal automático. Toca WhatsApp: se abre con el mensaje listo.</p>
      ${listOrEmpty(d.manuales, (s) => subRow(s, { compact: true }), 'Nada pendiente 🎉')}</section>
    <section class="card"><h2>💰 Por cobrar (${d.porCobrar.length})</h2>
      <p class="muted">Dijeron que renuevan. Coordina el pago y registra la renovación.</p>
      ${listOrEmpty(d.porCobrar, (s) => subRow(s, { compact: true }), 'Nadie por cobrar todavía')}</section>
  </div>
  <section class="card" style="margin-top:14px"><h2>📅 Vencen en 7 días (${d.vencen7.length})</h2>
    ${listOrEmpty(d.vencen7, (s) => subRow(s), 'Ninguna suscripción vence esta semana')}</section>`;
  bind({ ...g, ...subActions(reload) });
}

// ---------------- Suscripciones ----------------

async function suscripciones(view, _p, g) {
  const f = suscripciones.filters ?? (suscripciones.filters = { q: '', status: '', platform: '', intent: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const d = await api('GET', `/api/subscriptions?${qs}`);
  const reload = () => suscripciones(view, _p, g);
  const statusOpts = [['activa', 'Activas'], ['por_vencer', 'Por vencer'], ['vencida', 'Vencidas'], ['cancelada', 'Canceladas']];
  const intentOpts = [['renueva', 'Renueva'], ['pensando', 'Lo piensa'], ['no_renueva', 'No renueva'], ['sin_respuesta', 'Sin respuesta'], ['ninguna', 'Sin respuesta aún']];
  view.innerHTML = `
  <div class="page-head"><div><h1>Suscripciones</h1><div class="muted">${d.subscriptions.length} resultado(s)</div></div><a class="btn primary" href="#/venta">+ Nueva venta</a></div>
  <form class="toolbar" data-form="filter">
    <input type="search" name="q" placeholder="Buscar cliente, teléfono, servicio, perfil…" value="${esc(f.q)}">
    <select name="status">${options(statusOpts, f.status, { empty: 'Todas (sin canceladas)' })}</select>
    <select name="platform">${options(d.platforms.map((p) => [p, p]), f.platform, { empty: 'Todas las plataformas' })}</select>
    <select name="intent">${options(intentOpts, f.intent, { empty: 'Cualquier respuesta' })}</select>
    <button class="btn" type="submit">Filtrar</button>
  </form>
  <div class="card">${listOrEmpty(d.subscriptions, (s) => subRow(s), 'No hay suscripciones con esos filtros')}</div>`;
  const form = view.querySelector('form');
  form.addEventListener('change', () => form.requestSubmit());
  bind({ ...g, ...subActions(reload) }, {
    filter(data) {
      suscripciones.filters = data;
      reload();
    },
  });
}

// ---------------- Nueva venta ----------------

async function venta(view, _p, g) {
  const [{ services }, { accounts }] = await Promise.all([api('GET', '/api/services'), api('GET', '/api/accounts')]);
  const active = services.filter((s) => s.active);
  const sale = { customer: null };
  view.innerHTML = `
  <div class="page-head"><h1>Nueva venta</h1></div>
  ${active.length ? '' : '<div class="banner">Primero crea al menos un servicio (ej. "Netflix 1 perfil · 30 días") en <a href="#/servicios">Servicios</a>.</div>'}
  <form class="card" data-form="sale" autocomplete="off">
    <h2>Cliente</h2>
    <div class="fields">
      <label class="full ac">Buscar cliente existente o escribir uno nuevo
        <input name="customer_name" required placeholder="Nombre o teléfono" data-ac>
        <div class="ac-list" hidden></div>
      </label>
      <label>Teléfono<input name="customer_phone" inputmode="tel" placeholder="987 654 321"></label>
      <label>Email (opcional)<input name="customer_email" type="email"></label>
      <label class="check full"><input type="checkbox" name="consent_calls"> <span>${esc(LEGAL_CONSENT)}</span></label>
    </div>
    <p id="custInfo" class="muted"></p>
    <h2 style="margin-top:16px">Servicio</h2>
    <div class="fields">
      <label>Servicio<select name="serviceId" required>${options(active.map((s) => [s.id, `${s.name} · ${money(s.price)} · ${s.duration_days} d`]), '', { empty: 'Elige…' })}</select></label>
      <label>Cuenta madre<select name="accountId"><option value="">Sin cuenta madre</option></select></label>
      <label>Perfil<input name="profileName" placeholder="Perfil 1"></label>
      <label>PIN del perfil<input name="pin" inputmode="numeric" maxlength="20"></label>
      <div class="full chips" id="freeProfiles"></div>
      <label>Inicio<input name="startDate" type="date" value="${todayIso()}" required></label>
      <label>Vencimiento<input name="endDate" type="date" required></label>
      <label>Precio<input name="price" type="number" step="0.01" min="0" required></label>
    </div>
    <h2 style="margin-top:16px">Pago</h2>
    <div class="fields">
      <label class="check"><input type="checkbox" name="paid" checked> Ya pagó</label>
      <label>Método<select name="method">${options(PAYMENT_METHODS, 'yape')}</select></label>
    </div>
    <div class="form-foot"><button class="btn primary" type="submit" ${dis()}>Registrar venta</button></div>
  </form>`;
  const form = view.querySelector('form');
  const acInput = form.customer_name;
  const acList = form.querySelector('.ac-list');
  let acTimer;

  acInput.addEventListener('input', () => {
    sale.customer = null;
    document.getElementById('custInfo').textContent = 'Cliente nuevo';
    clearTimeout(acTimer);
    const q = acInput.value.trim();
    if (q.length < 2) return (acList.hidden = true);
    acTimer = setTimeout(async () => {
      const { customers } = await api('GET', `/api/customers?limit=8&q=${encodeURIComponent(q)}`);
      acList.innerHTML = customers.map((c) => `<button type="button" data-cid="${c.id}">${esc(c.name)} <small>${esc(c.phone ?? '')}</small></button>`).join('');
      acList.hidden = !customers.length;
      acList.onclick = (ev) => {
        const b = ev.target.closest('[data-cid]');
        if (!b) return;
        const c = customers.find((x) => x.id === Number(b.dataset.cid));
        sale.customer = c;
        acInput.value = c.name;
        form.customer_phone.value = c.phone ?? '';
        form.customer_email.value = c.email ?? '';
        form.consent_calls.checked = !!c.consent_calls;
        document.getElementById('custInfo').textContent = `Cliente existente · ${c.active_subs} suscripción(es) activa(s)`;
        acList.hidden = true;
      };
    }, 200);
  });
  acInput.addEventListener('blur', () => setTimeout(() => (acList.hidden = true), 200));

  async function loadProfiles() {
    const box = document.getElementById('freeProfiles');
    box.innerHTML = '';
    if (!form.accountId.value) return;
    const p = await api('GET', `/api/accounts/${form.accountId.value}/profiles`);
    box.innerHTML = p.free.length
      ? `<span class="muted">Libres (${p.freeCount}/${p.total}):</span> ${p.free.map((n) => `<button type="button" class="chip" data-profile="${esc(n)}">${esc(n)}</button>`).join('')}`
      : '<span class="badge bad">Esta cuenta no tiene perfiles libres</span>';
    box.onclick = (ev) => {
      const b = ev.target.closest('[data-profile]');
      if (!b) return;
      form.profileName.value = b.dataset.profile;
      box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    };
  }

  function onService() {
    const s = active.find((x) => x.id === Number(form.serviceId.value));
    if (!s) return;
    form.price.value = s.price;
    form.endDate.value = addDaysIso(form.startDate.value || todayIso(), s.duration_days);
    const accs = accounts.filter((a) => a.active && (!s.platform || a.platform.toLowerCase() === s.platform.toLowerCase()));
    form.accountId.innerHTML = `<option value="">Sin cuenta madre</option>${accs.map((a) => `<option value="${a.id}">${esc(a.platform)} · ${esc(a.email)} (${a.free} libres)</option>`).join('')}`;
    loadProfiles();
  }
  form.serviceId.addEventListener('change', onService);
  form.accountId.addEventListener('change', loadProfiles);
  form.startDate.addEventListener('change', onService);

  bind(g, {
    async sale(d) {
      const body = {
        serviceId: d.serviceId,
        accountId: d.accountId || null,
        profileName: d.profileName,
        pin: d.pin,
        startDate: d.startDate,
        endDate: d.endDate,
        price: d.price,
        payment: d.paid ? { amount: d.price, method: d.method } : null,
      };
      if (sale.customer) {
        body.customerId = sale.customer.id;
        if (d.consent_calls !== !!sale.customer.consent_calls || d.customer_phone !== (sale.customer.phone ?? '')) {
          await api('PUT', `/api/customers/${sale.customer.id}`, { consent_calls: d.consent_calls, phone: d.customer_phone, email: d.customer_email });
        }
      } else body.customer = { name: d.customer_name, phone: d.customer_phone, email: d.customer_email, consent_calls: d.consent_calls };
      const r = await api('POST', '/api/sales', body);
      toast('Venta registrada ✔');
      const acts = subActions(() => (location.hash = '#/suscripciones'));
      bind({ ...g, ...acts, again: () => venta(view, _p, g) });
      const phone = sale.customer?.phone ?? d.customer_phone;
      view.innerHTML = `<div class="card"><h1>Venta registrada ✔</h1><p>El aviso de renovación quedó programado automáticamente.</p>
        <div class="actions"><button class="btn primary" data-action="creds" data-id="${r.id}" data-phone="${esc(phone ?? '')}">Copiar credenciales para WhatsApp</button>
        <button class="btn" data-action="again">Otra venta</button><a class="btn" href="#/suscripciones">Ver suscripciones</a></div></div>`;
    },
  });
}

// ---------------- Clientes ----------------

async function clientes(view, param, g) {
  if (param) return cliente(view, Number(param), g);
  const q = clientes.q ?? '';
  const { customers } = await api('GET', `/api/customers?q=${encodeURIComponent(q)}`);
  const reload = () => clientes(view, null, g);
  view.innerHTML = `
  <div class="page-head"><div><h1>Clientes</h1><div class="muted">${customers.length} cliente(s)</div></div>
    <div class="actions">
      <button class="btn" data-action="newCustomer" ${dis()}>+ Cliente</button>
      <label class="btn" style="flex-direction:row;color:var(--text)" ${ro() ? 'hidden' : ''}>Importar CSV<input type="file" accept=".csv,text/csv,.txt" hidden id="importFile"></label>
      <a class="btn" href="/api/customers/export?format=csv">Exportar CSV</a>
      <a class="btn" href="/api/customers/export?format=xls">Exportar Excel</a>
    </div></div>
  <form class="toolbar" data-form="search"><input type="search" name="q" placeholder="Buscar por nombre, teléfono, email o etiqueta" value="${esc(q)}"><button class="btn" type="submit">Buscar</button></form>
  <div class="card">${listOrEmpty(
    customers,
    (c) => `<div class="row">
      <div><div class="title"><a href="#/clientes/${c.id}">${esc(c.name)}</a></div><div class="sub">${esc(c.phone ?? 'sin teléfono')}${c.email ? ` · ${esc(c.email)}` : ''}</div></div>
      <div class="sub">${c.active_subs} suscripción(es)${c.next_end ? ` · próximo vencimiento ${fdate(c.next_end)}` : ''}</div>
      <div class="tags">${c.consent_calls ? '<span class="badge ok">Acepta llamadas</span>' : '<span class="badge">Sin consentimiento</span>'}${(c.tags || '').split(',').filter(Boolean).map((t) => `<span class="badge info">${esc(t)}</span>`).join('')}</div>
      <div class="actions"><a class="btn small" href="#/clientes/${c.id}">Ver ficha</a></div></div>`,
    'Sin clientes todavía',
  )}</div>
  <p class="notice">CSV/Excel: columnas <code>nombre, telefono, email, notas, etiquetas, consentimiento, servicio, perfil, inicio, vencimiento, precio</code>. En Excel usa "Guardar como → CSV UTF-8". Las contraseñas y PIN nunca se exportan.</p>`;
  view.querySelector('#importFile')?.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const r = await api('POST', '/api/customers/import', { csv: await readFileAs(file, 'text') });
      openModal(
        'Importación terminada',
        `<p>Clientes nuevos: <b>${r.customers}</b> · Suscripciones: <b>${r.subscriptions}</b></p>${r.errors.length ? `<p>Filas con error (${r.errors.length}):</p><ul>${r.errors.slice(0, 30).map((e) => `<li>Fila ${e.row}: ${esc(e.error)}</li>`).join('')}</ul>` : ''}`,
      );
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  });
  bind(
    { ...g, newCustomer: () => customerModal(null, reload) },
    {
      search(d) {
        clientes.q = d.q;
        reload();
      },
    },
  );
}

function customerModal(c, done) {
  openModal(
    c ? 'Editar cliente' : 'Nuevo cliente',
    `<form data-form="saveCustomer"><div class="fields">
      <label>Nombre<input name="name" required value="${esc(c?.name ?? '')}"></label>
      <label>Teléfono<input name="phone" inputmode="tel" value="${esc(c?.phone ?? '')}"></label>
      <label>Email<input name="email" type="email" value="${esc(c?.email ?? '')}"></label>
      <label>Etiquetas (separadas por coma)<input name="tags" value="${esc(c?.tags ?? '')}"></label>
      <label class="full">Notas<textarea name="notes">${esc(c?.notes ?? '')}</textarea></label>
      <label class="check full"><input type="checkbox" name="consent_calls" ${c?.consent_calls ? 'checked' : ''}> <span>${esc(LEGAL_CONSENT)}</span></label>
    </div><div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`,
    {
      forms: {
        async saveCustomer(d) {
          if (c) await api('PUT', `/api/customers/${c.id}`, d);
          else await api('POST', '/api/customers', d);
          closeModal();
          toast('Cliente guardado');
          done();
        },
      },
    },
  );
}

async function cliente(view, id, g) {
  const d = await api('GET', `/api/customers/${id}`);
  const c = d.customer;
  const reload = () => cliente(view, id, g);
  view.innerHTML = `
  <div class="page-head"><div><a href="#/clientes" class="muted">← Clientes</a><h1>${esc(c.name)}</h1>
    <div class="muted">${esc(c.phone ?? 'sin teléfono')}${c.email ? ` · ${esc(c.email)}` : ''} · ${c.consent_calls ? `acepta llamadas desde ${fdate(c.consent_at)}` : 'sin consentimiento de llamadas'}</div></div>
    <div class="actions">${c.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${esc(c.phone.replace(/\D/g, ''))}">WhatsApp</a>` : ''}
      <button class="btn" data-action="editCustomer" ${dis()}>Editar</button>
      ${state.user.role === 'admin' ? `<button class="btn danger" data-action="deleteCustomer" ${dis()}>Eliminar</button>` : ''}</div></div>
  ${c.notes ? `<div class="card" style="margin-bottom:14px">${esc(c.notes)}</div>` : ''}
  <section class="card"><h2>Suscripciones</h2>${listOrEmpty(d.subscriptions, (s) => subRow({ ...s, customer_name: c.name }), 'Sin suscripciones')}</section>
  <div class="grid two" style="margin-top:14px">
    <section class="card"><h2>Pagos</h2>${
      d.payments.length
        ? `<div class="table-wrap"><table class="table"><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Registró</th></tr>${d.payments.map((p) => `<tr><td>${fdatetime(p.paid_at)}</td><td>${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.user_name ?? '')}</td></tr>`).join('')}</table></div>`
        : '<div class="empty">Sin pagos</div>'
    }</section>
    <section class="card"><h2>Llamadas y mensajes</h2>${listOrEmpty(
      d.calls,
      (k) => `<div class="row" style="grid-template-columns:1fr">
        <div><b>${fdatetime(k.created_at)}</b> · ${esc(k.channel === 'retell' ? 'Llamada IA' : k.channel === 'whatsapp' ? 'WhatsApp' : k.channel)} ${badge(k.intent)} <span class="badge">${esc(k.status)}</span>${k.disconnection_reason ? ` <small>${esc(k.disconnection_reason)}</small>` : ''}</div>
        ${k.summary ? `<div class="sub">${esc(k.summary)}</div>` : ''}
        ${k.recording_url ? `<audio controls preload="none" src="${esc(k.recording_url)}"></audio>` : ''}</div>`,
      'Sin llamadas todavía',
    )}</section>
  </div>`;
  bind({
    ...g,
    ...subActions(reload),
    editCustomer: () => customerModal(c, reload),
    async deleteCustomer() {
      if (!(await confirmModal('Eliminar cliente', 'Se borran el cliente, sus suscripciones y sus pagos. No se puede deshacer.', 'Eliminar'))) return;
      await api('DELETE', `/api/customers/${id}`);
      toast('Cliente eliminado');
      location.hash = '#/clientes';
    },
  });
}

// ---------------- Cuentas madre ----------------

async function cuentas(view, _p, g) {
  const { accounts } = await api('GET', '/api/accounts');
  const reload = () => cuentas(view, _p, g);
  view.innerHTML = `
  <div class="page-head"><div><h1>Cuentas madre</h1><div class="muted">Las cuentas que pagas a cada plataforma y repartes en perfiles.</div></div>
    <button class="btn primary" data-action="newAccount" ${dis()}>+ Cuenta madre</button></div>
  <div class="grid two">${
    accounts.length
      ? accounts
          .map((a) => {
            const left = a.expires_at ? daysUntil(a.expires_at) : null;
            return `<div class="card" ${a.active ? '' : 'style="opacity:.6"'}>
        <div style="display:flex;justify-content:space-between;gap:8px"><div><h3>${esc(a.platform)}</h3><div class="muted" style="overflow-wrap:anywhere">${esc(a.email)}</div></div>
          <div>${left === null ? '' : left < 0 ? '<span class="badge bad">Vencida</span>' : left <= 3 ? `<span class="badge warn">Vence en ${left} d</span>` : `<span class="badge ok">Al día</span>`}</div></div>
        <p style="margin:10px 0 4px">${a.used}/${a.total_profiles} perfiles usados · <b>${a.free} libres</b></p>
        <div class="progress"><i style="width:${Math.min(100, (a.used / a.total_profiles) * 100)}%"></i></div>
        <p class="muted" style="margin-top:8px">Vence ${fdate(a.expires_at)} · costo ${money(a.cost)} · ingresos ${money(a.revenue)} · margen <b>${money(a.margin)}</b></p>
        <div class="actions"><button class="btn small" data-action="reveal" data-id="${a.id}" ${a.has_password ? '' : 'disabled'}>Ver contraseña</button>
          <button class="btn small" data-action="profiles" data-id="${a.id}">Perfiles</button>
          <button class="btn small" data-action="renewAccount" data-id="${a.id}" ${dis()}>Renovar cuenta</button>
          <button class="btn small" data-action="editAccount" data-id="${a.id}" ${dis()}>Editar</button></div></div>`;
          })
          .join('')
      : '<div class="card empty">Todavía no registras cuentas madre.</div>'
  }</div>`;
  const byId = (id) => accounts.find((a) => a.id === Number(id));
  bind({
    ...g,
    newAccount: () => accountModal(null, reload),
    editAccount: (el) => accountModal(byId(el.dataset.id), reload),
    async reveal(el) {
      const r = await api('POST', `/api/accounts/${el.dataset.id}/reveal`);
      openModal('Contraseña de la cuenta madre', `<pre class="msg">${esc(r.password)}</pre><div class="form-foot"><button class="btn" data-action="cp">Copiar</button></div><p class="notice">Queda registrado en la bitácora que la viste.</p>`, {
        actions: { cp: () => copy(r.password) },
      });
    },
    async profiles(el) {
      const p = await api('GET', `/api/accounts/${el.dataset.id}/profiles`);
      openModal(
        'Perfiles',
        `<p>${p.used.length}/${p.total} usados · ${p.freeCount} libres</p>
        ${p.used.map((u) => `<div class="row" style="grid-template-columns:1fr auto"><div><b>${esc(u.profile_name || 'Sin nombre')}</b> · <a href="#/suscripciones">${esc(u.customer_name)}</a><div class="sub">vence ${fdate(u.end_date)}</div></div>${badge(u.status)}</div>`).join('')}
        ${p.free.length ? `<p class="muted" style="margin-top:10px">Libres: ${p.free.map(esc).join(', ')}</p>` : ''}`,
      );
    },
    async renewAccount(el) {
      const a = byId(el.dataset.id);
      openModal(
        `Renovar ${a.platform}`,
        `<form data-form="renewAcc"><div class="fields"><label>Días<input name="days" type="number" value="30" min="1"></label><label>Costo del periodo<input name="cost" type="number" step="0.01" value="${a.cost}"></label></div>
        <div class="form-foot"><button class="btn primary" type="submit">Renovar</button></div></form>`,
        {
          forms: {
            async renewAcc(d) {
              const r = await api('POST', `/api/accounts/${a.id}/renew`, { days: Number(d.days), cost: Number(d.cost) });
              closeModal();
              toast(`Cuenta al día hasta ${fdate(r.expires_at)}`);
              reload();
            },
          },
        },
      );
    },
  });
}

function accountModal(a, done) {
  openModal(
    a ? 'Editar cuenta madre' : 'Nueva cuenta madre',
    `<form data-form="saveAccount"><div class="fields">
      <label>Plataforma<input name="platform" required value="${esc(a?.platform ?? '')}" placeholder="Netflix" list="platforms"></label>
      <datalist id="platforms">${['Netflix', 'Disney+', 'Max', 'Prime Video', 'Spotify', 'YouTube Premium', 'Paramount+', 'Crunchyroll', 'Apple TV+', 'Vix'].map((p) => `<option value="${p}">`).join('')}</datalist>
      <label>Correo de la cuenta<input name="email" required value="${esc(a?.email ?? '')}"></label>
      <label>Contraseña${a ? ' (vacío = no cambiar)' : ''}<input name="password" type="password" autocomplete="new-password"></label>
      <label>Perfiles totales<input name="total_profiles" type="number" min="1" max="50" value="${a?.total_profiles ?? 5}"></label>
      <label>Vence (cuenta madre)<input name="expires_at" type="date" value="${a?.expires_at ?? ''}"></label>
      <label>Costo mensual<input name="cost" type="number" step="0.01" min="0" value="${a?.cost ?? 0}"></label>
      <label class="full">Notas<textarea name="notes">${esc(a?.notes ?? '')}</textarea></label>
      ${a ? `<label class="check"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Activa</label>` : ''}
    </div><p class="notice">La contraseña se guarda cifrada (AES-256-GCM) y nunca aparece en listados ni exportaciones.</p>
    <div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`,
    {
      forms: {
        async saveAccount(d) {
          d.total_profiles = Number(d.total_profiles);
          if (!d.password) delete d.password;
          if (a) await api('PUT', `/api/accounts/${a.id}`, d);
          else await api('POST', '/api/accounts', d);
          closeModal();
          toast('Cuenta guardada');
          done();
        },
      },
    },
  );
}

// ---------------- Servicios ----------------

async function servicios(view, _p, g) {
  const { services } = await api('GET', '/api/services');
  const reload = () => servicios(view, _p, g);
  view.innerHTML = `
  <div class="page-head"><div><h1>Servicios</h1><div class="muted">Lo que vendes: plataforma, precio y duración.</div></div><button class="btn primary" data-action="newService" ${dis()}>+ Servicio</button></div>
  <div class="card">${listOrEmpty(
    services,
    (s) => `<div class="row"><div class="title">${esc(s.name)}</div><div class="sub">${esc(s.platform)}</div><div>${money(s.price)} · ${s.duration_days} días ${s.active ? '' : '<span class="badge">Inactivo</span>'}</div>
      <div class="actions"><button class="btn small" data-action="editService" data-id="${s.id}" ${dis()}>Editar</button></div></div>`,
    'Crea tu primer servicio, por ejemplo "Netflix 1 perfil" a S/ 15 por 30 días.',
  )}</div>`;
  const modal = (s) =>
    openModal(
      s ? 'Editar servicio' : 'Nuevo servicio',
      `<form data-form="saveService"><div class="fields">
        <label>Nombre<input name="name" required value="${esc(s?.name ?? '')}" placeholder="Netflix 1 perfil"></label>
        <label>Plataforma<input name="platform" required value="${esc(s?.platform ?? '')}" placeholder="Netflix"></label>
        <label>Precio<input name="price" type="number" step="0.01" min="0" value="${s?.price ?? ''}" required></label>
        <label>Duración (días)<input name="duration_days" type="number" min="1" value="${s?.duration_days ?? 30}" required></label>
        <label class="check"><input type="checkbox" name="active" ${!s || s.active ? 'checked' : ''}> Activo</label>
      </div><div class="form-foot"><button class="btn primary" type="submit">Guardar</button></div></form>`,
      {
        forms: {
          async saveService(d) {
            d.duration_days = Number(d.duration_days);
            if (s) await api('PUT', `/api/services/${s.id}`, d);
            else await api('POST', '/api/services', d);
            closeModal();
            toast('Servicio guardado');
            reload();
          },
        },
      },
    );
  bind({ ...g, newService: () => modal(null), editService: (el) => modal(services.find((s) => s.id === Number(el.dataset.id))) });
}

export const pages = { resumen, '': resumen, suscripciones, venta, clientes, cuentas, servicios };
