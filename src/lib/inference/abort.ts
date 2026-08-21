// Cada cliente de LLM tem seu próprio timeout interno. Sem ligar o signal externo a ele,
// o TASK_TIMEOUT do worker aborta apenas o relógio: a requisição HTTP continua viva, a
// retentativa roda em paralelo com a órfã e as duas escrevem o resultado.
export function linkAbort(controller: AbortController, external?: AbortSignal): () => void {
  if (!external) return () => undefined;
  if (external.aborted) {
    controller.abort();
    return () => undefined;
  }
  const forward = () => controller.abort();
  external.addEventListener("abort", forward, { once: true });
  return () => external.removeEventListener("abort", forward);
}
