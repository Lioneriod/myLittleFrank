const ERRORS = {
  not_authenticated: [401, "Sua sessão expirou. Entre novamente."],
  network_error: [0, "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo."],
  missing_credentials: [400, "Preencha e-mail e senha."],
  email_address_invalid: [400, "Este e-mail não é válido."],
  weak_password: [400, "A senha precisa ter pelo menos 6 caracteres."],
  invalid_credentials: [400, "E-mail ou senha incorretos."],
  user_already_exists: [409, "Este e-mail já tem uma conta. Tente entrar."],
  invalid_name: [400, "O nome do Frank precisa ter entre 1 e 30 caracteres."],
  invalid_code: [404, "Código não encontrado. Confira as letras e tente de novo."],
  monster_full: [409, "Esse monstrinho já tem dois cuidadores."],
  already_has_monster: [409, "Você já cuida de um monstrinho."],
  not_a_member: [403, "Você não cuida deste monstrinho."],
  monster_not_found: [404, "Este monstrinho não existe mais."],
  invalid_answer: [400, "Escreva uma resposta de até 1000 caracteres."],
  no_questions: [409, "Nenhuma pergunta disponível no momento."],
  not_all_answered: [409, "Espere todos os cuidadores responderem."],
  question_changed: [409, "A pergunta já mudou."],
  unknown: [500, "Algo deu errado. Verifique sua conexão e tente de novo."],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;

export class BackendError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode) {
    super(ERRORS[code][1]);
    this.status = ERRORS[code][0];
  }
}

export function fail(code: ErrorCode): never {
  throw new BackendError(code);
}

const NETWORK_PATTERN = /network request failed|failed to fetch|fetch failed|load failed/i;

export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && NETWORK_PATTERN.test(message)) {
    return new BackendError("network_error");
  }
  console.warn("Erro inesperado do banco:", error);
  return new BackendError("unknown");
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === "23505" && (!constraint || (message ?? "").includes(constraint));
}

export function friendlyError(error: unknown): string {
  return toBackendError(error).message;
}
