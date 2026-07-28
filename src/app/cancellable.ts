// Helper for loads driven by a Svelte $effect, where the inputs can change
// (or the component unmount) before the request settles. Returns the cancel
// function an effect can hand straight back as its teardown, and skips every
// callback once cancelled so a stale response can't overwrite fresh state.

export interface CancellableHandlers<T> {
  onResult: (value: T) => void
  onError?: (error: unknown) => void
  onSettled?: () => void
}

export function cancellable<T>(promise: Promise<T>, handlers: CancellableHandlers<T>): () => void {
  let cancelled = false

  promise
    .then((value) => {
      if (!cancelled) handlers.onResult(value)
    })
    .catch((error) => {
      if (!cancelled) handlers.onError?.(error)
    })
    .finally(() => {
      if (!cancelled) handlers.onSettled?.()
    })

  return () => {
    cancelled = true
  }
}
