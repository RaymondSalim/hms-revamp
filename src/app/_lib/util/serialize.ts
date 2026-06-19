import { Decimal } from "@prisma/client/runtime/library";

function isDecimalLike(value: unknown): boolean {
  if (value instanceof Decimal) return true;
  if (
    typeof value === "object" &&
    value !== null &&
    "s" in value &&
    "e" in value &&
    "d" in value &&
    typeof (value as any).toFixed === "function"
  ) {
    return true;
  }
  return false;
}

export function serializeForClient<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (isDecimalLike(data)) return String(data) as unknown as T;
  if (data instanceof Date) return data.toISOString() as unknown as T;
  if (Array.isArray(data)) return data.map(serializeForClient) as unknown as T;
  if (typeof data === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeForClient(value);
    }
    return result;
  }
  return data;
}
