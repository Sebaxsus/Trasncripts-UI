# TODO

## Gaps conocidos

- **`line-clamp-2` (Tailwind v4) sin verificar visualmente** — usado en `JobsList.tsx` para truncar el resumen. Tailwind v3 lo requería como plugin aparte (`@tailwindcss/line-clamp`); en v4 debería venir en el core, pero no se confirmó con un chequeo visual real. Verificar contra un job con `summary` largo.
- **Sin paginación en `GET /api/jobs`** — el backend no pagina y el cliente pide la lista completa de una. Con pocos jobs (uso actual) no es un problema; si el corpus crece mucho, el dashboard va a pedir/renderizar todo de una. No implementado porque el backend tampoco lo soporta hoy.
- **Sin tests automatizados** — todo el testing hasta ahora fue manual (Playwright, contra el backend real, ver `docs/SECURITY.md` para el bug de CSP que encontró). El plugin de Playwright ya está instalado; si se quiere e2e automatizado, es el punto de partida natural.
- **Reconexión de `EventSource` sin backoff manual** — se apoya en el reintento automático del browser (built-in de la spec). Funciona, pero no hay control fino sobre el intervalo de reintento si algún día hace falta.
- **Recordatorio de proceso**: cambios relacionados a la CSP (o a cualquier cosa que dependa de `security.csp`, que Astro desactiva en `dev`) solo se pueden verificar con `pnpm build && pnpm preview`, nunca alcanza con `pnpm dev`. Ver `docs/SECURITY.md`.

## Feature propuesta: edición de transcript por chunks

Pedido: desde el cliente web, poder corregir el texto de una entrada de la transcripción (por ejemplo, una marcada con la pill "Baja confianza") y que el backend persista esa corrección. El cliente se implementa acá; el servidor queda a cargo de quien mantiene ese repo — esta sección es el diseño y la tasklist para esa parte.

### Viabilidad — cliente: alta

Es una feature de UI estándar: click para editar → textarea inline → Guardar/Cancelar. No hay nada arquitectónicamente difícil — sigue exactamente el mismo patrón que el resto del cliente (`lib/api.ts` como único punto de contacto, texto siempre renderizado plano, validación fail-fast antes de la request). El bloqueante no es el cliente, es que **hoy no existe el endpoint del backend para guardar la corrección** — por eso esto queda como diseño/tasklist en vez de código: implementar la UI contra un endpoint que no existe violaría la norma del proyecto de "no asumir/inventar contrato no documentado" (ver `CLAUDE.local.md`).

### Viabilidad — servidor: media, con puntos de diseño no triviales

1. **Conflicto con el invariante "append-only" de `transcript.jsonl`**: el `JsonlWriter` del backend abre siempre en modo `append` (nunca trunca) — decisión explícita para que un `resume` real no borre lo ya escrito. Editar una línea existente in situ rompe ese invariante (requeriría leer todo el archivo, reescribir con la corrección, y escribir atómicamente vía archivo temporal + rename para no arriesgar corrupción si el proceso muere a mitad de la escritura).

   **Alternativa recomendada**: no tocar `transcript.jsonl` — mantenerlo como el output crudo de Whisper, intocado. Persistir las correcciones en un store aparte (ej. `edits.jsonl` en la carpeta del job, keyed por `chunk`), y mergearlas al servir `GET /api/jobs/{job_id}/transcript`. Ventajas: preserva el invariante append-only ya probado, deja un rastro de auditoría (texto original vs. corregido) sin esfuerzo extra, y evita toda la complejidad de reescritura atómica de un archivo que además puede estar creciendo en paralelo si el job todavía no terminó.

2. **Desincronización con los embeddings de Qdrant**: el embedding de un chunk se calculó sobre el texto original — si se corrige el texto, búsqueda y RAG van a seguir devolviendo resultados basados en semántica vieja hasta que se re-embedee. El endpoint de edición necesita:
   - Re-embedear el chunk corregido.
   - Upsert al mismo point ID determinístico (`Uuid::new_v5`) que ya usa la Fase 4 — esto ya es idempotente por diseño, así que reintentar/sobrescribir no duplica vectores. Falta exponer la lógica de "embedear un chunk puntual" como función reusable (hoy probablemente solo existe la versión de "embedear todo el audio").

3. **Gate por estado del job**: permitir editar solo si `status === "Completed"` — evita carreras con el pipeline (que puede seguir escribiendo checkpoints) o con un `resume` en curso.

4. **Autenticación — cambio respecto al resto del contrato**: `POST /api/upload-audio` y `POST .../resume` son endpoints de escritura sin auth (decisión histórica ya aceptada). Un endpoint que **edita contenido ya procesado** es distinto: no dispara un pipeline nuevo, modifica un resultado persistido — el riesgo es de integridad de datos, no de cómputo. Recomiendo que este sí requiera el bearer token, sumándose al grupo `crear_router_protegido` en vez de quedar abierto.

5. **Validación server-side estricta**: el body debe aceptar únicamente `{ text: string }` — nunca permitir que el cliente toque `chunk`/`start`/`end`/`avg_logprob` (son estructurales o calculados, no editables). Límite de tamaño explícito por chunk (evitar que se pegue contenido arbitrariamente grande), `trim()`, rechazar vacío — mismo criterio que ya se usa para `title` en el upload.

6. **Auditoría y `low_confidence`**: persistir `edited: bool` (y sugerido: `edited_at`, `original_text`) por entrada corregida. Consecuencia útil: una vez que un humano corrige el texto, el `low_confidence` calculado sobre `avg_logprob` deja de tener sentido para esa entrada — el cliente debería ocultar la pill "Baja confianza" cuando `edited === true`, sin importar el `avg_logprob` original.

### Contrato HTTP propuesto (a confirmar/ajustar del lado del backend)

```
PATCH /api/jobs/{job_id}/transcript/{chunk}
Auth:  Bearer token requerido (a diferencia de upload/resume)
Body:  { "text": "..." }   — único campo mutable

Respuestas:
  200 OK        → TranscriptEntry actualizado, con edited: true
  400 Bad Request → texto vacío tras trim, o excede el límite de tamaño
  404 Not Found  → job_id no es UUID válido, no existe el job, o no existe ese chunk
  409 Conflict   → job.status !== "Completed" (no editable en este estado)
```

### Tasklist para el servidor

1. Decidir y documentar dónde persisten las correcciones — recomendado: store separado (`edits.jsonl` o similar), no reescribir `transcript.jsonl`.
2. Nuevo endpoint `PATCH /api/jobs/{job_id}/transcript/{chunk}`, agregado a `crear_router_protegido` (bearer token obligatorio).
3. Validar `job_id` (UUID) y `chunk` (existe en la transcripción) antes de tocar el filesystem — mismo patrón que el resto de endpoints de `jobs_handler`.
4. Gate por `status === "Completed"` → `409` si no se cumple.
5. Validar/sanear `text`: no vacío tras `trim()`, límite de tamaño explícito.
6. Mergear las correcciones al servir `GET /api/jobs/{job_id}/transcript` (y revisar si `GET .../metrics` necesita algo análogo) — el cliente no debería tener que saber que hay dos fuentes de datos.
7. Exponer una función de "re-embedear un chunk puntual" y llamarla tras cada edición exitosa, con upsert al point ID determinístico existente.
8. Devolver `edited: true` (y opcionalmente `edited_at`/`original_text`) en la respuesta y en `GET .../transcript`.
9. Decidir si esto también debe reflejarse en la tool MCP `get_transcript` (hoy comparte lógica con el endpoint REST vía `construir_transcript_response`) — probablemente sí, para no tener dos fuentes de verdad divergentes.

### Qué queda pendiente del lado del cliente (una vez exista el endpoint)

- `updateTranscriptEntry(jobId, chunk, text)` en `lib/api.ts`, siguiendo el mismo patrón que el resto de funciones (valida `job_id`, no acepta paths dinámicos sin validar).
- UI de edición inline en `TranscriptView.tsx`: ícono de editar → textarea → Guardar/Cancelar, con el mismo texto siempre renderizado plano (nunca `dangerouslySetInnerHTML`).
- Gate en la UI: solo mostrar la opción de editar cuando `job.status === 'Completed'`, coherente con el gate server-side.
- Validación fail-fast client-side: no vacío, límite de tamaño (mismo valor que el backend, para no depender solo del `400`).
- Mostrar un indicador "editado" y ocultar la pill "Baja confianza" cuando `entry.edited === true`.
