/** Error con código HTTP: el manejador de errores de Express lo devuelve como { error }. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
