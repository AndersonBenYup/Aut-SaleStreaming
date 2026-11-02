---
register: product
---

# LokiStream: producto

> Contexto de producto: qué es, para quién y qué tiene que lograr. Las decisiones visuales van en DESIGN.md, no aquí.
> Lo marcado como **(supuesto)** no está confirmado por el dueño y conviene revisarlo.

## Qué es

**LokiStream** es una tienda online que vende acceso a plataformas de streaming (Netflix, Disney+, Max, Prime Video, Spotify, YouTube Premium, Crunchyroll, Paramount+) **por perfil y por periodo** (1, 3 o 6 meses), además de packs que combinan varias plataformas. Opera desde Trujillo, Perú, y atiende online a todo el país.

- **Sin backend ni pasarela de pago.** El sitio es un catálogo con carrito. Toda compra y toda consulta termina en **WhatsApp**, con un mensaje ya escrito que detalla plataforma, plan, cantidad de perfiles y total.
- **El cobro y la entrega se hacen a mano por WhatsApp:** Yape, Plin, transferencia o depósito. Después del pago se envía el acceso.
- **Moneda:** soles (S/). **Idioma:** español de Perú.

## Para quién

- **(supuesto)** Personas de 18 a 35 años en Perú que compran desde el celular, ya pagan con Yape o Plin y buscan pagar menos que con una suscripción oficial.
- **(supuesto)** Familias o grupos que compran varios perfiles a la vez (el sitio permite hasta 6 por plataforma).
- Llegan sobre todo desde redes sociales (Instagram, TikTok) y desde enlaces compartidos por WhatsApp. Gran parte de las visitas son desde celular.

## Qué tiene que lograr el sitio

1. **Llevar al cliente a WhatsApp con el pedido correcto ya escrito.** Esta es la conversión. Cada página termina en esa acción.
2. **Generar confianza antes del chat.** El cliente le paga a un vendedor que no conoce. El sitio debe dejar claro que el negocio es real, que hay garantía durante todo el periodo, cómo se entrega el acceso y que el soporte responde.
3. **Hacer obvio el precio.** Precio por perfil, cuánto suma con varios perfiles y cuánto se ahorra con un plan largo o un pack, sin cálculos ni letra chica.
4. **Explicar el proceso a quien nunca compró así.** Qué significa «por perfil», cómo se paga y en cuánto tiempo llega.

## Objeciones a resolver

- **(supuesto)** «¿Es una estafa?»: garantía, horario de atención, número visible, proceso explicado y preguntas frecuentes.
- **(supuesto)** «¿Cuánto me dura?»: garantía de todo el periodo y aviso de renovación.
- **(supuesto)** «¿Me van a responder?»: horario visible y promesa de entrega en minutos.

## Superficies

| Superficie | Ruta | Modo | Éxito |
|---|---|---|---|
| Inicio | `/` | Persuade | Entiende la oferta y entra al catálogo o escribe por WhatsApp |
| Detalle de plataforma | `/plataforma/:slug` | Persuade | Elige plan y perfiles, y compra o agrega al carrito |
| Planes y precios | `/planes` | Persuade | Compara y pide un pack o un precio puntual |
| Preguntas frecuentes | `/faq` | Read | Resuelve su duda sin escribir, o escribe con confianza |
| Contacto | `/contacto` | Operate | Envía su consulta a WhatsApp en un paso |
| Carrito (panel lateral) | global | Operate | Revisa el pedido y lo envía por WhatsApp |

## Tipo: product

LokiStream se diseña como **producto**, no como pieza de marca o campaña. La interfaz existe para que el cliente elija, entienda el precio y envíe su pedido sin fricción. La expresión de marca vive en los detalles (acento, tipografía, microcopy), no en decoración ni en efectos. Los patrones conocidos (tarjetas de catálogo, selector de cantidad, carrito lateral, acordeón) se usan tal como el usuario los espera. La claridad, la consistencia y la velocidad en celular pesan más que la sorpresa visual.

## Personalidad de la marca

**(supuesto)** Cercana, rápida y sin vueltas: como un vendedor de confianza que responde al toque. Trata de tú. Evita el tono corporativo y la exageración. El nombre «Loki» permite algo de picardía, pero la confianza va primero.

## Restricciones

- **Solo frontend.** Los datos están en `src/data/*.json`: plataformas, packs, preguntas frecuentes y configuración del sitio, incluido el número de WhatsApp.
- **Marcas de terceros:** no se usan logos oficiales sin permiso. Las plataformas se muestran con su nombre y un color de referencia.
- **Mobile-first y en modo oscuro.** Accesible: navegable con teclado, con contraste AA, y respeta la opción de reducir animaciones.
- **Sin promesas que el negocio no pueda cumplir.** Los plazos, la garantía y los métodos de pago deben coincidir con lo que realmente ofrece el dueño.

## Pendiente de confirmar con el dueño

- [ ] Número de WhatsApp real (`site.json`)
- [ ] Precios reales y plataformas disponibles
- [ ] Métodos de pago aceptados
- [ ] Plazo real de entrega y condiciones de la garantía
- [ ] Redes sociales y correo reales
- [ ] Público principal y personalidad de la marca (marcados como supuesto arriba)
