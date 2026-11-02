/**
 * LokiStream · catálogo de la web a partir de las pestañas AJUSTES, PLATAFORMAS, PLANES, PACKS y FAQ.
 * buildCatalog() es pura: recibe las tablas (arreglos 2D, como getValues()) y devuelve el JSON que lee la web.
 * Las filas con problemas no se publican y se listan en `errors` para mostrarlas en la hoja.
 */

function readSettings(values) {
  var settings = {};
  Object.keys(SETTING_DEFAULTS).forEach(function (k) { settings[k] = SETTING_DEFAULTS[k]; });
  var t = tableToObjects(values || [], FIELDS.AJUSTES, 2);
  t.rows.forEach(function (r) {
    var key = normalizeHeader(r.clave);
    if (key) settings[key] = toText(r.valor);
  });
  return settings;
}

function categoryFrom(v) {
  var s = normalizeHeader(v);
  if (/MUSIC/.test(s)) return 'musica';
  if (/ANIME/.test(s)) return 'anime';
  return 'video';
}

function planLabel(months) {
  return months === 1 ? '1 mes' : months + ' meses';
}

/** Elige el color de texto que se lee sobre un fondo (#rrggbb). */
function inkFor(hex) {
  var m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return '#ffffff';
  var n = parseInt(m[1], 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#0a0a0d' : '#ffffff';
}

function normalizeHex(v) {
  var m = toText(v).match(/^#?([0-9a-f]{6})$/i);
  return m ? '#' + m[1].toLowerCase() : null;
}

function buildCatalog(tables) {
  var errors = [];
  var settings = readSettings(tables.AJUSTES);
  var site = {};
  Object.keys(PUBLIC_SETTINGS).forEach(function (k) {
    site[PUBLIC_SETTINGS[k]] = settings[k] || '';
  });
  site.whatsapp = String(site.whatsapp).replace(/\D/g, '');

  // Planes agrupados por plataforma
  var plansBy = {};
  tableToObjects(tables.PLANES || [], FIELDS.PLANES, 3).rows.forEach(function (r) {
    if (!toBool(r.active, true)) return;
    var pid = toText(r.platform).toLowerCase();
    var months = toNumber(r.months);
    var price = toNumber(r.price);
    if (!pid || !months || months < 1 || price === null || price < 0) {
      errors.push({ tab: TABS.PLANES, row: r._row, error: 'Falta PLATAFORMA, MESES o PRECIO válido' });
      return;
    }
    months = Math.round(months);
    var id = toText(r.id) || months + 'm';
    (plansBy[pid] = plansBy[pid] || []).push({
      id: id,
      label: toText(r.label) || planLabel(months),
      months: months,
      price: round2(price),
    });
  });

  var seen = {};
  var platforms = [];
  tableToObjects(tables.PLATAFORMAS || [], FIELDS.PLATAFORMAS, 2).rows.forEach(function (r) {
    if (!toBool(r.active, true)) return;
    var name = toText(r.name);
    var id = (toText(r.id) || slugify(name)).toLowerCase();
    if (!name || !id) {
      errors.push({ tab: TABS.PLATAFORMAS, row: r._row, error: 'Falta NOMBRE' });
      return;
    }
    if (seen[id]) {
      errors.push({ tab: TABS.PLATAFORMAS, row: r._row, error: 'ID repetido: ' + id });
      return;
    }
    var plans = (plansBy[id] || []).sort(function (a, b) { return a.months - b.months; });
    if (!plans.length) {
      errors.push({ tab: TABS.PLATAFORMAS, row: r._row, error: 'Sin planes activos en PLANES: no se publica' });
      return;
    }
    seen[id] = true;
    var field = normalizeHex(r.field);
    var p = {
      id: id,
      slug: toText(r.slug) || slugify(name),
      name: name,
      category: categoryFrom(r.category),
      tagline: toText(r.tagline),
      description: toText(r.description),
      features: splitList(r.features),
      badge: toText(r.badge) || null,
      order: toNumber(r.order),
      plans: plans,
    };
    if (field) {
      p.field = field;
      p.color = field;
      p.ink = normalizeHex(r.ink) || inkFor(field);
    }
    platforms.push(p);
  });
  platforms.sort(function (a, b) {
    return (a.order === null ? 999 : a.order) - (b.order === null ? 999 : b.order);
  });
  platforms.forEach(function (p) { delete p.order; });

  var packs = [];
  tableToObjects(tables.PACKS || [], FIELDS.PACKS, 3).rows.forEach(function (r) {
    if (!toBool(r.active, true)) return;
    var name = toText(r.name);
    var price = toNumber(r.price);
    var ids = splitList(r.platforms, ',').map(function (s) { return s.toLowerCase(); });
    var known = ids.filter(function (id) { return seen[id]; });
    if (!name || price === null) {
      errors.push({ tab: TABS.PACKS, row: r._row, error: 'Falta NOMBRE o PRECIO' });
      return;
    }
    if (!known.length) {
      errors.push({ tab: TABS.PACKS, row: r._row, error: 'Ninguna plataforma del pack existe en PLATAFORMAS' });
      return;
    }
    if (known.length < ids.length) {
      errors.push({ tab: TABS.PACKS, row: r._row, error: 'Se ignoran plataformas desconocidas: ' + ids.filter(function (i) { return !seen[i]; }).join(', ') });
    }
    packs.push({
      id: toText(r.id) || slugify(name),
      name: name,
      price: round2(price),
      period: toText(r.period) || 'mes',
      description: toText(r.description),
      platforms: known,
      perks: splitList(r.perks),
      highlight: toBool(r.highlight, false),
    });
  });

  var faq = tableToObjects(tables.FAQ || [], FIELDS.FAQ, 2).rows
    .filter(function (r) { return toBool(r.active, true) && toText(r.q) && toText(r.a); })
    .map(function (r) { return { q: toText(r.q), a: toText(r.a), order: toNumber(r.order) }; })
    .sort(function (a, b) { return (a.order === null ? 999 : a.order) - (b.order === null ? 999 : b.order); })
    .map(function (r) { return { q: r.q, a: r.a }; });

  return { site: site, platforms: platforms, packs: packs, faq: faq, errors: errors, settings: settings };
}

/** Versión pública (sin ajustes internos) con una huella para que la web sepa si cambió. */
function publicCatalog(catalog, updatedAt) {
  var body = { site: catalog.site, platforms: catalog.platforms, packs: catalog.packs, faq: catalog.faq };
  var json = JSON.stringify(body);
  var hash = 0;
  for (var i = 0; i < json.length; i++) hash = (hash * 31 + json.charCodeAt(i)) | 0;
  body.version = (hash >>> 0).toString(36);
  body.updatedAt = updatedAt || null;
  return body;
}
