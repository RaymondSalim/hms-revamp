import { Decimal } from "@prisma/client/runtime/library";

export function serializeForClient<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (data instanceof Decimal) return data.toString() as unknown as T;
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
