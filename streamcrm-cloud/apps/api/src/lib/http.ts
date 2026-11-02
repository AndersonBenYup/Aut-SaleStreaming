/** Error con código HTTP: el manejador de errores de app.ts responde { error: message } con ese status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
