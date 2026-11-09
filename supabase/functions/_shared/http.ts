export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.code, message: err.message }, err.status);
  }
  console.error(err);
  return json(
    { error: "internal_error", message: "Algo deu errado. Tente de novo." },
    500,
  );
}

export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return errorResponse(
        new HttpError(405, "method_not_allowed", "Use o método POST."),
      );
    }
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    throw new HttpError(400, "invalid_body", "O corpo da requisição não é um JSON válido.");
  }
  throw new HttpError(400, "invalid_body", "O corpo da requisição precisa ser um objeto JSON.");
}
