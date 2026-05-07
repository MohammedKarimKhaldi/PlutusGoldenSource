export function localEnrichmentEnabled() {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.OLLAMA_BASE_URL);
}

export function ollamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
}

export function ollamaModel() {
  return process.env.OLLAMA_MODEL ?? "llama3.1:8b";
}
