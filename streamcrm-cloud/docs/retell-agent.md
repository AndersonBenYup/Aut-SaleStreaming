# Agente de voz en Retell AI

## Prompt del agente

```
Eres el asistente de {{businessName}}. Llamas a {{customerName}} para recordarle que su {{serviceName}}
(perfil {{profileName}}) vence el {{endDate}}, en {{daysLeft}} días. Si {{expired}} es "si", di en cambio
que venció el {{endDate}}. La renovación cuesta S/ {{price}}. Pregúntale con amabilidad si desea renovar.
Si dice que sí, dile que el negocio le escribirá por WhatsApp para coordinar el pago. Si duda, ofrécele
que lo piense. Nunca pidas datos de tarjetas ni contraseñas. La llamada no debe pasar de un minuto.
```

Variables dinámicas que envía el sistema (`retell_llm_dynamic_variables`):
`businessName`, `customerName`, `serviceName`, `profileName`, `endDate` (en palabras: "30 de octubre"),
`daysLeft`, `expired` ("si"/"no") y `price` ("15.00").

## Post-call analysis

Agrega un campo personalizado:

- Nombre: `renovacion`
- Tipo: **enum**
- Valores: `renueva`, `no_renueva`, `pensando`

Si llega como texto libre, el sistema igual lo interpreta ("ya no / cancelar" → no renueva,
"después / lo pienso" → pensando, "sí / confirmo / pago" → renueva).

## Webhook

- URL: `https://<tu-dominio>/webhooks/retell`
- Eventos: `call_ended` y `call_analyzed`.
- La firma `x-retell-signature` se verifica con tu `RETELL_API_KEY`. Una firma inválida devuelve 401.
- Si no contesta (`dial_no_answer`, `dial_busy`, `voicemail_reached`, …) se reintenta en 2 horas,
  dentro del horario permitido, hasta 3 intentos. Después queda como **Sin respuesta**.

## Variables de entorno

```
RETELL_API_KEY=key_...
RETELL_AGENT_ID=agent_...
RETELL_FROM_NUMBER=+1...        # número comprado/importado en Retell
REMINDER_CHANNEL_OVERRIDE=      # vacío para llamar de verdad
DEV_ALLOWED_NUMBERS=+51987...   # en desarrollo solo se llama a estos números
```
