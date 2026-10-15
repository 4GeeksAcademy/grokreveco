# Groq / Chat

Prototipo de chat en Next.js App Router, TypeScript y Tailwind. Las llamadas a
Groq se realizan exclusivamente con `fetch`, desde el navegador, enviando todos
los turnos de la conversacion. Incluye errores en espanol, razonamiento oculto,
historial local y metricas acumuladas de tokens, latencia y tokens por segundo.

## Ejecutar

Requiere Node.js 20.9 o superior.

```bash
npm install
```

Crea `.env.local` en la raiz del proyecto con esta variable y tu propia clave:

```dotenv
NEXT_PUBLIC_GROQ_API_KEY=tu_clave_de_groq
```

```bash
npm run dev
```

Abre http://localhost:3000. Reinicia el servidor tras modificar el entorno.
Enter envia el mensaje; Shift+Enter introduce un salto de linea. Borrar
conversacion elimina el historial local y reinicia todas las metricas.

## Modelo

`MODEL` en `src/lib/groq.ts` usa `qwen/qwen3.8-27b`. Verificado con
`GET /openai/v1/models` el 15 de octubre de 2026: el modelo solicitado
`qwen/qwen3.6-27b` no estaba disponible y este era el Qwen mas cercano.
La API acepta `reasoning_format: "hidden"`; si devuelve 400, se reintenta sin
ese parametro. Los bloques `<think>` y el campo `reasoning` no se muestran.
Las metricas usan el modelo y `usage` de cada respuesta exitosa. Los tokens
por segundo usan la latencia completa medida en el navegador, no solo el
tiempo interno de generacion del proveedor.

## Seguridad

`NEXT_PUBLIC_` **expone la clave en el navegador**. Es aceptable exclusivamente
para este prototipo privado. En produccion, la llamada y una variable
`GROQ_API_KEY` deben estar en un route handler del servidor, con autenticacion
y limites de uso. No publiques este prototipo con una clave real.
`.gitignore` ignora `.env*`. El historial se guarda en localStorage de este
navegador; evita introducir informacion sensible en equipos compartidos.

## Verificar

```bash
npm run lint
npm run build
```