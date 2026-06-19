import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

interface RequestContext {
  requestId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function withRequestId<T>(fn: () => T): T {
  return asyncLocalStorage.run({ requestId: randomUUID() }, fn);
}

export function withAction<T>(fn: () => T): T {
  return asyncLocalStorage.run({ requestId: getRequestId() || randomUUID() }, fn);
}

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}
