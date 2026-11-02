# Crear el agente de voz en Retell AI

Esta guía se hace **una sola vez** desde la cuenta de Retell del negocio. Tiempo: unos 15 minutos.

## 1. Cuenta y número

1. Entra a <https://dashboard.retellai.com> y crea la cuenta. En **Billing**, agrega saldo.
2. Ve a **Phone Numbers → Buy Number**, o *Import* si ya tienes un número SIP o de Twilio. Ese será el **número saliente**.
   - Para llamar a Perú y Latinoamérica, revisa en Retell las tarifas y que el número permita llamadas internacionales.

## 2. Crear el agente

1. **Agents → Create Agent → Single Prompt Agent**.
2. **Language**: *Spanish* (o *Multilingual*). **Voice**: elige una voz en español latino.
3. En **Prompt** pega exactamente esto:

```
Eres el asistente de {{businessName}}. Llamas a {{customerName}} para recordarle que su {{serviceName}} (perfil {{profileName}}) vence el {{endDate}}, en {{daysLeft}} días. La renovación cuesta S/ {{price}}. Pregúntale con amabilidad si desea renovar. Si dice que sí, dile que el negocio le escribirá por WhatsApp para coordinar el pago. Si duda, ofrécele que lo piense. Nunca pidas datos de tarjetas ni contraseñas. La llamada no debe pasar de un minuto.
```

> Si tu moneda no es soles, cambia `S/` en el prompt por la tuya.

4. **Begin message** (opcional): `Hola, ¿hablo con {{customerName}}? Te llamo de {{businessName}}.`
5. En **Call Settings**, pon un límite de duración de 90 segundos y activa *End call on silence*.

### Variables que envía StreamCRM

StreamCRM las manda en cada llamada (`retell_llm_dynamic_variables`), no hay que crearlas:

| Variable | Ejemplo |
|---|---|
| `businessName` | Streaming Juan |
| `customerName` | Ana Pérez |
| `serviceName` | Netflix 1 perfil |
| `profileName` | Perfil 2 |
| `endDate` | 15 de enero (en palabras) |
| `daysLeft` | 2 |
| `price` | 15.00 |

## 3. Análisis post-llamada (obligatorio)

En el agente: **Post-Call Analysis → Add → Custom**:

- **Name**: `renovacion`
- **Type**: **Enum**
- **Values**: `renueva`, `no_renueva`, `pensando`
- **Description**: `¿El cliente desea renovar su suscripción? renueva = sí; no_renueva = no; pensando = lo va a pensar o no está seguro.`

StreamCRM lee `custom_analysis_data.renovacion`. Si llega como texto libre (“sí, renuevo”, “ya no”, “lo pienso”),
también lo interpreta. El **resumen** de la llamada (`call_summary`) y la **grabación** se guardan en la ficha del cliente.

## 4. Webhook (recomendado)

1. Abre el túnel (`tunel.bat`) y copia la URL de **Ajustes → Webhook y red** (termina en `/webhooks/retell`).
2. En el agente, **Webhook URL** → pega la URL. Eventos: `call_ended` y `call_analyzed`.
3. La firma `x-retell-signature` se verifica con tu API key. Si la firma no es válida, la petición se rechaza (401).

Sin webhook el sistema igual obtiene el resultado: cada 2 minutos consulta `GET /v2/get-call/{call_id}` de las
llamadas que aún no tienen resultado.

## 5. Conectar con StreamCRM

1. **Settings → API Keys** en Retell: copia la API key.
2. Copia el **Agent ID** (en la página del agente, empieza con `agent_`).
3. En StreamCRM, **Ajustes → Canales → Llamada con IA**: pega API key, Agent ID y número saliente (formato `+1…` o `+51…`).
4. Escribe tu celular y pulsa **Probar llamada a mi número**.

## Reintentos

Si el cliente no contesta (`dial_no_answer`, `dial_busy`, `dial_failed`, `voicemail_reached`, `user_declined`,
`invalid_destination`, `error_no_audio_received`), se reintenta en 2 horas dentro del horario permitido, máximo 3
intentos. Después queda como **Sin respuesta** y puedes escribirle a mano.
