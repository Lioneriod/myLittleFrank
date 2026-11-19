const ERRORS = {
  invalid_body: [400, "Os dados enviados não são um JSON válido."],
  body_too_large: [413, "Os dados enviados são grandes demais."],
  invalid_request: [400, "Requisição inválida."],
  not_found: [404, "Rota não encontrada."],
  not_authenticated: [401, "Sua sessão expirou. Entre novamente."],
  rate_limited: [429, "Muitas tentativas. Espere alguns minutos e tente de novo."],
  missing_credentials: [400, "Preencha e-mail e senha."],
  email_address_invalid: [400, "Este e-mail não é válido."],
  weak_password: [400, "A senha precisa ter pelo menos 6 caracteres."],
  long_password: [400, "A senha pode ter no máximo 72 caracteres."],
  invalid_credentials: [401, "E-mail ou senha incorretos."],
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
  invalid_push_token: [400, "Token de notificação inválido."],
  internal_error: [500, "Algo deu errado no servidor. Tente de novo."],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;

export class HttpError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode) {
    super(ERRORS[code][1]);
    this.status = ERRORS[code][0];
  }
}

export function fail(code: ErrorCode): never {
  throw new HttpError(code);
}
