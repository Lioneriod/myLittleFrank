const CLIENT_MESSAGES = {
  network_error: "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.",
  timeout: "O servidor demorou demais para responder. Tente de novo.",
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  unknown: "Algo deu errado. Verifique sua conexão e tente de novo.",
} as const;

type ClientErrorCode = keyof typeof CLIENT_MESSAGES;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static client(code: ClientErrorCode, status = 0): ApiError {
    return new ApiError(status, code, CLIENT_MESSAGES[code]);
  }
}

export function friendlyError(error: unknown): string {
  return error instanceof ApiError ? error.message : CLIENT_MESSAGES.unknown;
}
