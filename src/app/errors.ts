// Turning a caught `unknown` into something showable. Every store does this
// on the way to its `error` field, so the shape lives here once.

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
