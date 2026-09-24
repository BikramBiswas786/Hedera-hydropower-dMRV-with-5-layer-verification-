/** Input that a methodology or tool does not allow (e.g. simple OM on a hydro-dominated grid). Maps to HTTP 400. */
export class MethodologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MethodologyError";
  }
}
