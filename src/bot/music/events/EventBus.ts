type Handler = (payload: any) => void | Promise<void>;

const listeners = new Map<string, Set<Handler>>();

export function on(event: string, fn: Handler): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function once(event: string, fn: Handler): () => void {
  const wrapper: Handler = (payload: any) => {
    off(event, wrapper);
    return fn(payload);
  };
  return on(event, wrapper);
}

export function off(event: string, fn: Handler): void {
  listeners.get(event)?.delete(fn);
}

export function emit(event: string, payload?: any): void {
  for (const fn of listeners.get(event) || []) {
    try { fn(payload); } catch { /* subscriber error */ }
  }
}

export function removeAll(event?: string): void {
  if (event) listeners.delete(event);
  else listeners.clear();
}
