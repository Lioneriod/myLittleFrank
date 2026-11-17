const ERRORS = {
  not_authenticated: [401, "Sua sessão expirou. Entre novamente."],
  invalid_body: [400, "O corpo da requisição precisa ser um objeto JSON."],
  missing_credentials: [400, "Preencha e-mail e senha."],
  invalid_credentials: [400, "E-mail ou senha incorretos."],
  user_already_exists: [409, "Este e-mail já tem uma conta. Tente entrar."],
  weak_password: [422, "A senha precisa ter pelo menos 6 caracteres."],
  email_not_confirmed: [403, "Confirme seu e-mail antes de entrar."],
  email_address_invalid: [400, "Este e-mail não é válido."],
  validation_failed: [400, "Confira o e-mail e a senha e tente de novo."],
  over_email_send_rate_limit: [429, "Muitas tentativas. Espere um pouco e tente de novo."],
  over_request_rate_limit: [429, "Muitas tentativas. Espere um pouco e tente de novo."],
  auth_error: [400, "Não foi possível concluir. Confira os dados e tente de novo."],
  supabase_unavailable: [502, "Não foi possível falar com o Supabase. Tente de novo."],
  invalid_monster_id: [400, "Monstrinho inválido."],
  invalid_name: [400, "O nome do Frank precisa ter entre 1 e 30 caracteres."],
  invalid_frank_parts: [400, "As partes do Frank são inválidas."],
  nothing_to_update: [400, "Envie o nome ou as partes do Frank para atualizar."],
  invalid_code: [404, "Código não encontrado. Confira as letras e tente de novo."],
  monster_full: [409, "Esse monstrinho já tem dois cuidadores."],
  already_has_monster: [409, "Você já cuida de um monstrinho."],
  not_a_member: [403, "Você não cuida deste monstrinho."],
  monster_not_found: [404, "Este monstrinho não existe mais."],
  invalid_answer: [400, "Escreva uma resposta antes de enviar."],
  no_questions: [409, "Nenhuma pergunta disponível no momento."],
  no_pairing_question: [409, "Nenhuma pergunta disponível no momento."],
  not_all_answered: [409, "Espere todos os cuidadores responderem."],
  question_changed: [409, "A pergunta já mudou."],
  invalid_push_token: [400, "Token de notificação inválido."],
  not_found: [404, "Rota não encontrada."],
  internal_error: [500, "Algo deu errado. Tente de novo."],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;

export class HttpError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode, status?: number) {
    super(ERRORS[code][1]);
    this.status = status ?? ERRORS[code][0];
  }
}

export function fail(code: ErrorCode): never {
  throw new HttpError(code);
}

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && Object.hasOwn(ERRORS, code);
}
