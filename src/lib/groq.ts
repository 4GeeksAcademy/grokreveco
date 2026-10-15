export const MODEL = "qwen/qwen3.8-27b";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type Completion = {
  message: Message;
  usage: Usage;
  model: string;
  durationMs: number;
};

export function httpErrorMessage(status: number): string {
  if (status === 401) return "La clave de Groq no es valida. Revisa NEXT_PUBLIC_GROQ_API_KEY en .env.local.";
  if (status === 429) return "Has alcanzado el limite de uso. Espera un momento y vuelve a intentarlo.";
  if (status === 400) return "La peticion o el modelo no son validos. Revisa la configuracion de Groq.";
  if (status >= 500) return "El servidor de Groq no esta disponible. Intentalo de nuevo mas tarde.";
  return "Groq no pudo completar la solicitud. Vuelve a intentarlo.";
}

export function stripReasoning(content: string): string {
  return content.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think\s*>|$)/gi, "").trim();
}

export function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return ["prompt_tokens", "completion_tokens", "total_tokens"].every(
    (key) => typeof usage[key] === "number" && Number.isSafeInteger(usage[key]) && (usage[key] as number) >= 0,
  );
}

export async function sendMessages(messages: Message[]): Promise<Completion> {
  const key = process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!key) throw new Error("Falta la clave de Groq. Configura NEXT_PUBLIC_GROQ_API_KEY en .env.local y reinicia el servidor.");

  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    async function request(hidden: boolean) {
      return await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          ...(hidden ? { reasoning_format: "hidden" } : {}),
        }),
        signal: controller.signal,
      });
    }

    let response: Response;
    try {
      response = await request(true);
      if (response.status === 400) response = await request(false);
    } catch {
      throw new Error(controller.signal.aborted
        ? "La solicitud tardo demasiado. Vuelve a intentarlo."
        : "No se pudo conectar con Groq. Comprueba tu conexion a Internet y vuelve a intentarlo.");
    }

    if (!response.ok) throw new Error(httpErrorMessage(response.status));

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Groq devolvio una respuesta JSON no valida. Vuelve a intentarlo.");
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !isUsage(data?.usage) || typeof data?.model !== "string") {
      throw new Error("La respuesta de Groq esta incompleta. Vuelve a intentarlo.");
    }
    const cleanContent = stripReasoning(content);
    if (!cleanContent) throw new Error("Groq no devolvio una respuesta visible. Vuelve a intentarlo.");

    return {
      message: { role: "assistant", content: cleanContent },
      usage: data.usage,
      model: data.model,
      durationMs: performance.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}