# LokiStream

Tienda de streaming solo frontend (React + Vite + Tailwind v4). Sin backend: los pedidos y las consultas se envían por WhatsApp con el mensaje ya escrito.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas de la lógica (mensajes de WhatsApp, carrito, formato)
npm run build    # genera dist/
```

## Qué editar

| Archivo | Contenido |
|---|---|
| `src/data/site.json` | Marca, **número de WhatsApp** (solo dígitos, con código de país), horario, correo |
| `src/data/platforms.json` | Plataformas: precio por perfil, planes (1/3/6 meses), color, características |
| `src/data/plans.json` | Packs combinados de la página de planes |
| `src/data/faq.json` | Preguntas frecuentes |

Para usar logos reales, agrega `"logo": "/logos/netflix.svg"` a la plataforma y coloca el archivo en `public/logos/`. Revisa antes los derechos de uso de cada marca.

## Despliegue

Usa rutas reales (`BrowserRouter`). Ya se incluyen `public/_redirects` para Netlify y `vercel.json` para Vercel.

## Google Sheets como base de datos

La web puede leer su catálogo y registrar pedidos en una hoja de Google, sin servidor (Google Apps Script).
Guía completa: [docs/GOOGLE-SHEETS.md](docs/GOOGLE-SHEETS.md).

```bash
npm run hoja:bundle   # apps-script/dist/LokiStream.gs, para pegar en Extensiones → Apps Script
npm run hoja:mock     # hoja simulada en local (http://localhost:8787/exec)
npm run hoja:seed     # regenera los datos iniciales de la hoja desde src/data/*.json
```

Con `VITE_SHEETS_API_URL` vacío la web funciona como antes: catálogo local y pedidos directos por WhatsApp.
