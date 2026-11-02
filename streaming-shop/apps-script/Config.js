/**
 * LokiStream · configuración de la hoja.
 * Las pestañas y columnas se reconocen por nombre (sin importar mayúsculas, tildes ni el orden),
 * así puedes mover columnas o agregar las tuyas sin romper nada.
 */

var TABS = {
  AJUSTES: 'AJUSTES',
  PLATAFORMAS: 'PLATAFORMAS',
  PLANES: 'PLANES',
  PACKS: 'PACKS',
  FAQ: 'FAQ',
  PEDIDOS: 'PEDIDOS',
  VENTAS: 'VENTAS',
  CUENTAS: 'CUENTAS',
  LOG: 'LOG',
};

/** Pestañas que alimentan la web: si se editan, se borra la caché del catálogo. */
var CATALOG_TABS = [TABS.AJUSTES, TABS.PLATAFORMAS, TABS.PLANES, TABS.PACKS, TABS.FAQ];

/** Encabezados con los que se crea cada pestaña (el primero de cada alias es el que se escribe). */
var HEADERS = {
  AJUSTES: ['CLAVE', 'VALOR', 'NOTA'],
  PLATAFORMAS: ['ID', 'NOMBRE', 'SLUG', 'CATEGORIA', 'LEMA', 'DESCRIPCION', 'CARACTERISTICAS', 'COLOR', 'COLOR TEXTO', 'INSIGNIA', 'ORDEN', 'ACTIVO'],
  PLANES: ['PLATAFORMA', 'PLAN', 'ETIQUETA', 'MESES', 'PRECIO', 'ACTIVO'],
  PACKS: ['ID', 'NOMBRE', 'PRECIO', 'PERIODO', 'DESCRIPCION', 'PLATAFORMAS', 'BENEFICIOS', 'DESTACADO', 'ACTIVO'],
  FAQ: ['PREGUNTA', 'RESPUESTA', 'ORDEN', 'ACTIVO'],
  PEDIDOS: ['ID PEDIDO', 'FECHA', 'CLIENTE', 'TELEFONO', 'DETALLE', 'TOTAL', 'ESTADO', 'ACEPTA AVISOS', 'NOTAS', 'MENSAJE', 'ENLACE WHATSAPP', 'ITEMS'],
  // Compatible con StreamCRM (Local y Cloud): mismos nombres de columna.
  VENTAS: ['CORREO', 'CONTRASEÑA', 'CLIENTE', 'TELEFONO', 'SERVICIO', 'PERFIL', 'PIN', 'FECHA INICIO', 'DIAS', 'FECHA DE VENCIMIENTO', 'ESTADO', 'DIAS RESTANTES', 'CUENTA', 'V U', 'V V', 'GANANCIA', 'ACEPTA LLAMADAS', 'INTENCION', 'RECORDATORIO', 'ULTIMO CONTACTO', 'RESUMEN LLAMADA', 'ID SISTEMA', 'PEDIDO'],
  CUENTAS: ['ESTADO', 'SUSCRIPCION', 'CORREO USUARIO', 'CONTRASEÑA', 'PERFILES', 'DURACION DIAS', 'FECHA DE CREACION', 'FECHA DE VENCIMIENTO', 'PROVEEDOR', 'PRECIO'],
  LOG: ['FECHA', 'ACCION', 'REFERENCIA', 'RESULTADO'],
};

/** Alias de columnas por pestaña. */
var FIELDS = {
  AJUSTES: { clave: ['CLAVE'], valor: ['VALOR'] },
  PLATAFORMAS: {
    id: ['ID'], name: ['NOMBRE'], slug: ['SLUG'], category: ['CATEGORIA'], tagline: ['LEMA'],
    description: ['DESCRIPCION'], features: ['CARACTERISTICAS'], field: ['COLOR', 'COLOR FONDO'],
    ink: ['COLOR TEXTO', 'TINTA'], badge: ['INSIGNIA', 'ETIQUETA'], order: ['ORDEN'], active: ['ACTIVO'],
  },
  PLANES: {
    platform: ['PLATAFORMA', 'ID PLATAFORMA'], id: ['PLAN', 'ID PLAN'], label: ['ETIQUETA', 'NOMBRE'],
    months: ['MESES'], price: ['PRECIO'], active: ['ACTIVO'],
  },
  PACKS: {
    id: ['ID'], name: ['NOMBRE'], price: ['PRECIO'], period: ['PERIODO'], description: ['DESCRIPCION'],
    platforms: ['PLATAFORMAS'], perks: ['BENEFICIOS'], highlight: ['DESTACADO'], active: ['ACTIVO'],
  },
  FAQ: { q: ['PREGUNTA'], a: ['RESPUESTA'], order: ['ORDEN'], active: ['ACTIVO'] },
  PEDIDOS: {
    id: ['ID PEDIDO', 'PEDIDO'], date: ['FECHA'], customer: ['CLIENTE'], phone: ['TELEFONO', 'CELULAR', 'WHATSAPP'],
    detail: ['DETALLE'], total: ['TOTAL'], status: ['ESTADO'], consent: ['ACEPTA AVISOS', 'ACEPTA LLAMADAS'],
    notes: ['NOTAS'], message: ['MENSAJE'], link: ['ENLACE WHATSAPP'], items: ['ITEMS'],
  },
  VENTAS: {
    correo: ['CORREO', 'CORREO USUARIO', 'USUARIO', 'EMAIL', 'CORREO CUENTA'],
    contrasena: ['CONTRASENA', 'CLAVE', 'PASSWORD', 'CONTRASENA CUENTA'],
    cliente: ['CLIENTE', 'NOMBRE', 'NOMBRE CLIENTE', 'NOMBRE DEL CLIENTE'],
    telefono: ['TELEFONO', 'CELULAR', 'WHATSAPP', 'NUMERO', 'CEL', 'TELEFONO CLIENTE', 'NUMERO CELULAR'],
    servicio: ['SERVICIO', 'SUSCRIPCION', 'PLATAFORMA', 'TIPO DE VENTA'],
    perfil: ['PERFIL', 'NOMBRE PERFIL', 'NOMBRE DEL PERFIL'],
    pin: ['PIN'],
    fecha_inicio: ['FECHA INICIO', 'FECHA DE INICIO', 'INICIO', 'FECHA COMPRA', 'FECHA DE COMPRA'],
    dias: ['VENCIMIENTO', 'DIAS', 'DURACION', 'DURACION DIAS', 'DIAS DE SERVICIO'],
    fecha_vencimiento: ['FECHA DE VENCIMIENTO', 'FECHA VENCIMIENTO', 'VENCE', 'FECHA FIN', 'FECHA DE CORTE'],
    estado: ['ESTADO'],
    dias_restantes: ['DIAS RESTANTES', 'FALTAN'],
    cuenta: ['CUENTA', 'CUENTA MADRE'],
    costo: ['V U', 'VALOR UNITARIO', 'COSTO'],
    precio: ['V V', 'VALOR VENTA', 'PRECIO', 'MONTO', 'PRECIO VENTA'],
    ganancia: ['GANANCIA'],
    acepta_llamadas: ['ACEPTA LLAMADAS', 'CONSENTIMIENTO', 'ACEPTA AVISOS'],
    pedido: ['PEDIDO', 'ID PEDIDO'],
  },
  CUENTAS: {
    estado: ['ESTADO'],
    servicio: ['SUSCRIPCION', 'SERVICIO', 'PLATAFORMA'],
    correo: ['CORREO USUARIO', 'CORREO', 'USUARIO', 'EMAIL'],
    contrasena: ['CONTRASENA', 'CLAVE', 'PASSWORD'],
    perfiles: ['PERFILES', 'NUMERO DE PERFILES'],
    duracion: ['DURACION DIAS', 'DURACION', 'DIAS DE SERVICIO'],
    fecha_creacion: ['FECHA DE CREACION', 'FECHA CREACION', 'FECHA INICIO'],
    fecha_vencimiento: ['FECHA DE VENCIMIENTO', 'FECHA VENCIMIENTO', 'VENCE'],
    proveedor: ['PROVEEDOR'],
    costo: ['PRECIO', 'COSTO'],
  },
};

/** Estados de un pedido (columna ESTADO de PEDIDOS). */
var ORDER_STATUS = {
  NUEVO: 'Nuevo',
  PAGADO: 'Pagado',
  LISTO: 'Listo para enviar',
  ENTREGADO: 'Entregado',
  SIN_STOCK: 'Sin stock',
  CANCELADO: 'Cancelado',
  ERROR: 'Error',
};

/** Ajustes con su valor por defecto. Se leen de la pestaña AJUSTES. */
var SETTING_DEFAULTS = {
  MARCA: 'LokiStream',
  WHATSAPP: '51999999999',
  CIUDAD: 'Trujillo, Perú',
  HORARIO: 'Lunes a domingo · 8:00 a 23:00',
  CORREO: 'hola@lokistream.pe',
  INSTAGRAM: '',
  TIKTOK: '',
  ANUNCIO: '',
  LEMA: 'Streaming premium, sin complicaciones',
  'DIAS POR MES': '30',
  'CODIGO PAIS': '51',
  'PEDIDOS POR HORA POR TELEFONO': '5',
};

/** Ajustes que se publican en la web, con el nombre que usa el sitio. */
var PUBLIC_SETTINGS = {
  MARCA: 'brand',
  WHATSAPP: 'whatsapp',
  CIUDAD: 'city',
  HORARIO: 'hours',
  CORREO: 'email',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  ANUNCIO: 'announcement',
  LEMA: 'tagline',
};

/**
 * Claves secretas: van en Configuración del proyecto → Propiedades del script, NUNCA en la hoja.
 *   WHATSAPP_TOKEN     token permanente de WhatsApp Cloud API (opcional)
 *   WHATSAPP_PHONE_ID  id del número de WhatsApp Business (opcional)
 */
var PROP = {
  WA_TOKEN: 'WHATSAPP_TOKEN',
  WA_PHONE_ID: 'WHATSAPP_PHONE_ID',
};
