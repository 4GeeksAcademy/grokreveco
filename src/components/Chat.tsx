"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight, Bot, Check, CircleAlert, Clock3, LoaderCircle, MessageSquare, Send, Trash2, User, Zap } from "lucide-react";
import { MODEL, isUsage, sendMessages, stripReasoning, type Message, type Usage } from "@/lib/groq";

const STORAGE_KEY = "groq-chat-session-v1";
const EMPTY_METRICS = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, model: MODEL, durationMs: 0, tokensPerSecond: 0 };
type Metrics = Usage & { model: string; durationMs: number; tokensPerSecond: number };

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const session = JSON.parse(saved);
          if (!Array.isArray(session.messages) || !session.messages.every((message: Message) =>
            message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string",
          ) || !isUsage(session.metrics)) throw new Error("Invalid session");
          setMessages(session.messages.map((message: Message) => ({
            role: message.role,
            content: message.role === "assistant" ? stripReasoning(message.content) : message.content,
          })));
          setMetrics({
            prompt_tokens: session.metrics.prompt_tokens,
            completion_tokens: session.metrics.completion_tokens,
            total_tokens: session.metrics.total_tokens,
            model: typeof session.metrics.model === "string" ? session.metrics.model : MODEL,
            durationMs: Number.isFinite(session.metrics.durationMs) && session.metrics.durationMs >= 0 ? session.metrics.durationMs : 0,
            tokensPerSecond: Number.isFinite(session.metrics.tokensPerSecond) && session.metrics.tokensPerSecond >= 0 ? session.metrics.tokensPerSecond : 0,
          });
        }
      } catch {
        setError("No se pudo recuperar el historial local. Puedes iniciar una nueva conversacion.");
      } finally {
        setHydrated(true);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (!messages.length && metrics.total_tokens === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, metrics }));
    } catch {
      queueMicrotask(() => setError("No se pudo guardar el historial en este navegador. La conversacion sigue disponible durante esta sesion."));
    }
  }, [messages, metrics, hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading, error]);

  async function complete(history: Message[]) {
    if (requestRef.current || !hydrated) return;
    requestRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const response = await sendMessages(history);
      setMessages([...history, response.message]);
      setMetrics((previous) => ({
        prompt_tokens: previous.prompt_tokens + response.usage.prompt_tokens,
        completion_tokens: previous.completion_tokens + response.usage.completion_tokens,
        total_tokens: previous.total_tokens + response.usage.total_tokens,
        model: response.model,
        durationMs: response.durationMs,
        tokensPerSecond: response.durationMs > 0 ? response.usage.completion_tokens / (response.durationMs / 1000) : 0,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrio un error inesperado. Vuelve a intentarlo.");
    } finally {
      requestRef.current = false;
      setIsLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || requestRef.current || !hydrated) return;
    const history: Message[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    void complete(history);
  }

  function clearConversation() {
    if (requestRef.current) return;
    setMessages([]);
    setMetrics(EMPTY_METRICS);
    setInput("");
    setError(null);
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { setError("No se pudo borrar el historial del navegador. Revisa los permisos de almacenamiento."); }
    inputRef.current?.focus();
  }

  const number = (value: number) => value.toLocaleString("es-ES");

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-icon"><MessageSquare size={21} /></span><span>groq<span className="brand-light"> / chat</span></span><span className="prototype">PROTOTIPO</span></div>
        <div className="header-status"><span className="status-dot" /> {isLoading ? "Procesando" : "Listo para conversar"}</div>
      </header>
      <div className="workspace">
        <aside className="metrics-panel" aria-label="Metricas de la sesion">
          <div className="section-label"><Activity size={15} /> SESION EN VIVO</div>
          <h2>El pulso del chat</h2>
          <div className="model-line"><span className="model-symbol"><Zap size={18} /></span><div><span className="metric-caption">Modelo activo</span><p data-testid="model">{metrics.model}</p></div></div>
          <div className="token-total"><span className="metric-caption">Tokens de la sesion</span><strong data-testid="total-tokens">{number(metrics.total_tokens)}</strong><span className="total-caption">TOTAL ACUMULADO</span></div>
          <dl className="token-breakdown"><div><dt><span className="legend-dot input-dot" />Entrada</dt><dd data-testid="prompt-tokens">{number(metrics.prompt_tokens)}</dd></div><div><dt><span className="legend-dot output-dot" />Salida</dt><dd data-testid="completion-tokens">{number(metrics.completion_tokens)}</dd></div></dl>
          <div className="performance-grid"><div><Clock3 size={16} /><span className="metric-caption">Ultima respuesta</span><strong>{metrics.durationMs ? `${number(Math.round(metrics.durationMs))} ms` : "--"}</strong></div><div><Zap size={16} /><span className="metric-caption">Velocidad</span><strong>{metrics.durationMs ? metrics.tokensPerSecond.toFixed(1) : "--"}<small> tok/s</small></strong></div></div>
          <div className="session-footer"><Check size={14} /><span>{hydrated ? "Sesion local" : "Cargando sesion"}</span></div>
        </aside>
        <section className="chat-panel" aria-label="Chat con Groq">
          <div className="conversation-header"><div><span className="section-label">ESPACIO DE CONVERSACION</span><h1>Tu proxima idea empieza aqui.</h1></div><button className="clear-button" onClick={clearConversation} disabled={isLoading || !hydrated} title="Borrar conversacion" aria-label="Borrar conversacion"><Trash2 size={17} /><span>Borrar conversacion</span></button></div>
          <div className="message-list" role="log" aria-live="polite" aria-label="Mensajes">
            {!messages.length && <div className="empty-state"><span className="empty-icon"><Bot size={30} strokeWidth={1.5} /></span><span className="section-label">UN LIENZO EN BLANCO</span><h2>{"\u00bfQue tienes en mente?"}</h2><div className="suggestions">{["Dame una idea para mi proximo proyecto", "Explica un concepto complejo de forma sencilla", "Ayudame a escribir algo diferente"].map((suggestion) => <button key={suggestion} disabled={!hydrated || isLoading} onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}>{suggestion}<ArrowUpRight size={16} /></button>)}</div></div>}
            {messages.map((message, index) => <article key={index} className={`message message-${message.role}`}><div className="message-author">{message.role === "user" ? <User size={14} /> : <Zap size={14} />}<span>{message.role === "user" ? "TU" : "GROQ"}</span></div><div className="message-content">{message.content}</div></article>)}
            {isLoading && <div className="thinking" role="status"><LoaderCircle className="animate-spin" size={17} />Pensando{"\u2026"}</div>}
            {error && <div className="error-message" role="alert"><CircleAlert size={18} /><div><p>{error}</p>{!isLoading && messages.at(-1)?.role === "user" && <button onClick={() => void complete(messages)}>Reintentar</button>}</div></div>}
            <div ref={endRef} />
          </div>
          <form className="composer" onSubmit={submit}><div className="composer-inner"><textarea ref={inputRef} aria-label="Mensaje" placeholder="Escribe tu mensaje..." value={input} onChange={(event) => setInput(event.target.value)} disabled={isLoading || !hydrated} rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} /><button className="send-button" type="submit" disabled={isLoading || !hydrated || !input.trim()} title="Enviar mensaje"><span>Enviar</span><Send size={17} /></button></div><div className="composer-footer"><span><span className="status-dot" /> Groq / {MODEL.split("/")[1]}</span><span>{number(messages.length)} mensajes</span></div></form>
        </section>
      </div>
    </main>
  );
}