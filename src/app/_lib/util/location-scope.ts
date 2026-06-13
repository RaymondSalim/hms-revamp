import { auth } from "@/app/_lib/auth";
import { cookies } from "next/headers";
import { getLocationsForUser } from "@/app/_db/locations";

// A user's location scope. `null` means GLOBAL (no restriction — admin-by-no-assignment).
// A number[] restricts the user to exactly those location ids. We never represent
// scope as an empty array: zero assignments resolves to null.
export type LocationScope = number[] | null;

export function scopeFromAssignments(assignedIds: number[]): LocationScope {
  return assignedIds.length === 0 ? null : assignedIds;
}

export function isLocationInScope(scope: LocationScope, locationId: number): boolean {
  if (scope === null) return true;
  return scope.includes(locationId);
}

// Decide which location id a request should operate on.
//   - scope: the user's LocationScope
//   - requested: the id from the client cookie (may be NaN/null/out-of-scope)
//   - availableIds: the ids actually selectable for this user (already scope-filtered)
// Returns the chosen id, or null when the user has no available location.
export function pickSelectedLocationId(
  scope: LocationScope,
  requested: number | null,
  availableIds: number[]
): number | null {
  if (availableIds.length === 0) return null;
  if (
    requested !== null &&
    !Number.isNaN(requested) &&
    availableIds.includes(requested) &&
    isLocationInScope(scope, requested)
  ) {
    return requested;
  }
  // Fall back to the first available id that is within scope. `availableIds`
  // may not have been scope-filtered by the caller, so we filter here too.
  const firstInScope = availableIds.find((id) => isLocationInScope(scope, id));
  return firstInScope ?? null;
}

// Session-reading wrappers (server-only). ----------------------------------

export async function getScopedLocationIds(): Promise<LocationScope> {
  const session = await auth();
  return scopeFromAssignments(session?.user?.location_ids ?? []);
}

// Throws when the current user is scoped and the location is not in their scope.
// Use on by-id reads and write actions to block cross-location access.
export async function assertLocationAccess(locationId: number): Promise<void> {
  const scope = await getScopedLocationIds();
  if (!isLocationInScope(scope, locationId)) {
    throw new Error("Unauthorized: location out of scope");
  }
}

// Resolve the location a page should render, validated against the caller's scope.
// Returns { selectedLocationId, locations } where locations are the in-scope set.
export async function resolveLocationContext(): Promise<{
  selectedLocationId: number | null;
  locations: { id: number; name: string; address: string }[];
}> {
  const scope = await getScopedLocationIds();
  const locations = await getLocationsForUser(scope);
  const cookieStore = await cookies();
  const cookie = cookieStore.get("selectedLocationId");
  const requested = cookie ? parseInt(cookie.value, 10) : null;
  const selectedLocationId = pickSelectedLocationId(
    scope,
    requested,
    locations.map((l) => l.id)
  );
  return { selectedLocationId, locations };
}

// Validate that a client-supplied locationId (e.g. API ?locationId= param) is in
// the caller's scope; throws if not. Returns the validated id.
export async function requireLocationAccess(locationId: number): Promise<number> {
  await assertLocationAccess(locationId);
  return locationId;
}
