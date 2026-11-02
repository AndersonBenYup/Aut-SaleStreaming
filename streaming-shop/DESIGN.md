# LokiStream: sistema de diseño

> Documentado a partir del código existente (`src/index.css` y `src/components/**`). El código es la fuente de verdad: si cambias un token, actualiza este archivo.
> Tipo: **product** (ver PRODUCT.md). Claridad y consistencia por encima de la decoración.

## Principios

1. **Todo termina en WhatsApp.** La acción de compra se distingue siempre del resto: verde WhatsApp para enviar el pedido y coral para avanzar dentro del sitio.
2. **El precio es protagonista.** Los montos van en tipografía display, con números tabulares, y nunca compiten con otro elemento del mismo peso.
3. **Oscuro, sobrio y cálido.** Fondo casi negro neutro, un solo acento cálido y el color de cada plataforma solo como identificación, nunca como decoración de la interfaz.
4. **Patrones conocidos.** Tarjeta de catálogo, selector −/+, carrito lateral y acordeón se comportan como el usuario espera.

## Color

Definidos en `@theme` (`src/index.css`). Solo hay tema oscuro (`color-scheme: dark`).

| Token | Valor | Uso |
|---|---|---|
| `ink-950` | `#0a0a0d` | Fondo de página |
| `ink-900` | `#111116` | Superficies: tarjetas, carrito, footer, campos |
| `ink-850` | `#16161d` | Hover de superficies |
| `ink-800` | `#1d1d26` | Bordes y divisores por defecto |
| `ink-700` | `#2a2a36` | Bordes de controles; números decorativos |
| `ink-500` | `#6b6b7b` | Texto terciario, íconos inactivos (solo en texto pequeño no esencial) |
| `ink-300` | `#a9a9b8` | Texto secundario |
| `ink-100` | `#ececf2` | Texto principal |
| `accent` | `#ff5a36` | Acción principal en el sitio, foco, énfasis del titular, checks |
| `accent-soft` | `#ff7a5c` | Hover del botón principal |
| `wa` | `#25d366` | Exclusivo para acciones que abren WhatsApp |

**Reglas**
- El texto sobre `accent` y `wa` siempre es `ink-950`, nunca blanco, por contraste.
- `accent/10` y `accent/15` sirven para estados seleccionados (plan elegido) e insignias.
- El color de marca de cada plataforma (`platforms.json → color`) solo aparece en su monograma (`PlatformMark`) y en un halo difuso de baja opacidad en su tarjeta o en su página de detalle.
- Error: `red-400` para texto y borde de campo inválido.

## Tipografía

Se cargan desde Google Fonts en `index.html`.

| Rol | Familia | Pesos | Uso |
|---|---|---|---|
| Display | Space Grotesk (`font-display`) | 500–700 | `h1`–`h3`, precios, números de paso, logotipo |
| Texto | Inter (`font-sans`) | 400–600 | Cuerpo, controles, etiquetas |

| Nivel | Clases | Contexto |
|---|---|---|
| Hero | `text-[2.6rem] sm:text-6xl lg:text-7xl font-bold leading-[1.02]` | Solo en el `h1` del inicio |
| Título de página | `text-4xl sm:text-6xl font-bold` | `h1` del detalle |
| Título de sección | `text-3xl sm:text-4xl font-semibold` | `SectionHeading` |
| Título de tarjeta | `text-xl font-semibold` | Plataformas y packs |
| Precio grande | `text-3xl`–`text-4xl font-display font-bold tabular-nums` | Total del detalle y packs |
| Eyebrow | `.eyebrow` (`text-xs uppercase tracking-[0.18em] text-accent`) | Antetítulo de sección |
| Cuerpo | `text-base`; lead `text-lg text-ink-300` | Texto general |

- Los títulos usan `text-wrap: balance` y `tracking-tight`.
- Todo número monetario lleva `tabular-nums` y se formatea con `formatPEN()` → `S/ 0.00`.

## Espacio y layout

- **Contenedor:** `.container-x` = `max-w-6xl` con 16 px de margen lateral en celular y 24 px desde `sm`.
- **Ritmo vertical:** las secciones usan `py-20`; las cabeceras de página, `pt-14 sm:pt-20`.
- **Rejillas:** catálogo 1 → 2 (`sm`) → 4 (`lg`) columnas; packs 1 → 3 (`md`); detalle 1 → `1.1fr 1fr` (`lg`), con el panel de compra fijo (`sticky top-28`).
- **Mobile-first:** en celular, las tablas se convierten en tarjetas (`/planes`) y los filtros se deslizan en horizontal sin barra visible.
- **Header fijo:** franja de anuncio (fondo `accent`) más la barra de navegación de 64 px, que es translúcida (`bg-ink-950/85 backdrop-blur-md`). Los anclajes compensan esa altura con `scroll-mt-28`.

## Forma

| Elemento | Radio |
|---|---|
| Botones, chips, selector de cantidad, insignias | `rounded-full` |
| Tarjetas, paneles, acordeón, formulario | `rounded-3xl` |
| Opciones de plan, campos de formulario, mini tarjetas | `rounded-2xl` |
| Bloque de llamada final | `rounded-[2rem]` |
| Monograma de plataforma | `rounded-xl` / `2xl` / `3xl` según el tamaño (sm/md/lg) |

Los bordes son de 1 px: `ink-800` en superficies y `ink-700` en controles. Las sombras solo se usan en elementos flotantes: el botón de WhatsApp, la vista previa del chat y el pack destacado, que lleva un anillo `accent` y un resplandor.

## Componentes

| Componente | Archivo | Notas |
|---|---|---|
| `Button` | `ui/Button.jsx` | Variantes `primary` (accent), `whatsapp` (wa), `ghost` (borde) y `subtle`. Tamaños `sm` 36 px, `md` 44 px y `lg` 48 px. Con `to` es un `Link`; con `href` es un enlace externo con `rel="noopener noreferrer"`. Al pulsarlo se reduce a `scale-[0.97]`. |
| `PlatformMark` | `ui/PlatformMark.jsx` | Monograma con degradado del color de la plataforma. Acepta `logo` opcional. |
| `QuantitySelector` | `ui/QuantitySelector.jsx` | −/+ con límite de 1 a 6; el valor está en `<output aria-live>`. |
| `Accordion` | `ui/Accordion.jsx` | Una sola pregunta abierta a la vez; se anima con `grid-template-rows`; usa `aria-expanded` y `aria-controls`. |
| `Modal` | `ui/Modal.jsx` | `alertdialog` para confirmaciones destructivas; se cierra con Esc. |
| `SectionHeading` | `ui/SectionHeading.jsx` | Eyebrow, título y bajada; se alinea a la izquierda o al centro. |
| `PlatformCard` | `home/PlatformCard.jsx` | Tarjeta-enlace completa: monograma, insignia, precio mensual y un «desde» si hay plan más barato. |
| `PackCard` | `home/PackCard.jsx` | Precio, «por separado» tachado, monogramas apilados, beneficios y CTA a WhatsApp. |
| `CartDrawer` | `cart/CartDrawer.jsx` | Panel derecho, `max-w-md`; `inert` cuando está cerrado; estado vacío con CTA al catálogo. |
| `WhatsAppFab` | `layout/WhatsAppFab.jsx` | Botón flotante verde de 56 px, abajo a la derecha. |

## Movimiento

- **Entrada:** `.animate-rise` (0.6 s, `cubic-bezier(0.2,0.7,0.2,1)`, sube 12 px) solo en el hero, la cabecera del detalle, el modal y los ítems del menú móvil, escalonados de 40 en 40 ms.
- **Interacción:** transiciones de 150–200 ms en color y borde; el carrito se desliza en 300 ms; las tarjetas suben 2 px al pasar el cursor.
- Con `prefers-reduced-motion: reduce` se desactivan todas las animaciones y transiciones, y el scroll deja de ser suave.

## Accesibilidad

- Foco visible global: contorno `accent` de 2 px separado 2 px del elemento.
- Enlace «Saltar al contenido», `aria-label` en los botones que solo tienen ícono y navegación con `aria-label="Principal"`.
- Los filtros del catálogo usan `role="tablist"` y `aria-selected`; los planes son radios reales dentro de un `fieldset` con `legend`.
- El formulario de contacto usa `aria-invalid` y `aria-describedby` en los errores.
- Las áreas táctiles son de al menos 40 px (los controles del carrito, de 32 px, son la excepción).

## Voz y microcopy

- Trata de tú, en español de Perú, con frases cortas y concretas.
- Los CTA dicen qué pasa: «Pedir por WhatsApp», «Comprar ahora», «Agregar al carrito», «Lo quiero».
- Los mensajes prellenados siguen el formato de `src/lib/whatsapp.js`: saludo, una línea por ítem con `• Plataforma – N perfiles × periodo – S/ total`, el total y una pregunta de cierre.

## Inicio: dirección «pinned poster» (actualizado 2026-11-02)

Rediseño del inicio con la skill design-taste-frontend (dirección `pinned-poster`, seed 1825836274) y las reglas de movimiento de Emil Kowalski. Lo que sigue manda sobre las secciones anteriores cuando no coinciden.

**Idea.** En esta página, *cambiar de canal entre los servicios que vende LokiStream* se convierte en *el póster fijo*: el nombre partido en dos esquinas (LOKI arriba a la izquierda, STREAM abajo a la derecha) y entre ellas una pantalla que va pasando por cada plataforma, con su logo oficial sobre su color de marca.

**Reglas nuevas (todo el sitio)**
- Sin eyebrows, sin líneas divisorias (`border`/`divide`) salvo en tablas reales, sin degradados, sin sombras en reposo (solo el botón flotante de WhatsApp) y sin emojis en la interfaz ni en los mensajes.
- Logos oficiales en `public/logos/` vía `BrandLogo` (`variant`: `wordmark` | `mono` | `icon`; `tone`: `white` | `black` | `color`). Cada plataforma tiene `field` (color de marca), `ink` (texto sobre ese color), `wordmark`, `mono` e `icon` en `platforms.json`. Crunchyroll no tiene wordmark publicado: se compone con su ícono y su nombre.
- Márgenes de página: 16 px en celular y 32 px desde `sm`, a todo el ancho. Separación entre secciones: `pt-32` en celular y `pt-44` en escritorio.

**Secciones del inicio:** `ChannelHero` → `Lineup` (catálogo con un solo tamaño de letra) → `OrderBuilder` («Arma tu pedido»: eliges plataforma, plan y perfiles, y el chat de WhatsApp de al lado muestra en vivo el mensaje exacto, el pago y un ejemplo de entrega; se envía o se agrega al carrito desde ahí) → `PackPicker` (nombres a la izquierda y una cifra viva a la derecha) → `FaqIndex` (preguntas a la izquierda y la respuesta en grande) → `LocalProof` (panel negro verdoso sin fondos animados, «Trujillo» en dorado, la firma LOKISTREAM en runas que se enciende una vez y los datos de pago y garantía con etiquetas doradas).

**Movimiento** (`src/index.css`)
- Curvas: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`.
- Intro: una vez por sesión, termina en 1,1 s y se salta con cualquier tecla o toque. Las letras suben con desenfoque y pasa una barra coral; no se reproduce si el usuario pidió reducir movimiento.
- Cambio de canal: `zap-in` de 560 ms (cortina con `clip-path` y desenfoque). El fondo de la pantalla cambia de color en 500 ms. Avanza solo cada 3,6 s y una barra de progreso lineal lo marca; se pausa al pasar el cursor, al enfocar o con la pestaña oculta. Las flechas del teclado cambian de canal.
- Entradas: `.reveal` (subida de 24 px más opacidad en 700 ms, con escalonado `--d`). Solo se ocultan cuando hay JavaScript (`html.js`).
- Pulsación: `.press` reduce a `scale(0.97)` en 160 ms. Las respuestas que cambian usan `fade-swap` de 220 ms.

**Paleta del logo** (usada en `LocalProof` y en la intro): esmeralda `#13803a`/`#1f9d3a`, verde neón suave `#7dffa8`, dorado `#d4a531`/`#f3d27a` y negro verdoso. Logo: `public/logos/lokistream.webp`, recortado de `public/photos/LOGO.jpg`.
