"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface Location {
  id: number;
  name: string;
  address: string;
}

interface LocationContextValue {
  selectedLocationId: number | null;
  setSelectedLocationId: (id: number) => void;
  locations: Location[];
  isLoading: boolean;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({
  children,
  initialLocations,
  initialLocationId,
}: {
  children: ReactNode;
  initialLocations: Location[];
  initialLocationId: number | null;
}) {
  const [locations] = useState<Location[]>(initialLocations);
  const [selectedLocationId, setSelectedLocationIdState] = useState<number | null>(
    initialLocationId
  );
  const [isLoading, setIsLoading] = useState(false);

  const setSelectedLocationId = useCallback((id: number) => {
    setSelectedLocationIdState(id);
    // Persist selection in cookie
    document.cookie = `selectedLocationId=${id};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    // Reload the page to refetch server data with new location scope
    window.location.reload();
  }, []);

  useEffect(() => {
    // If no location selected but locations available, select the first one
    if (selectedLocationId === null && locations.length > 0) {
      const firstId = locations[0].id;
      setSelectedLocationIdState(firstId);
      document.cookie = `selectedLocationId=${firstId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    }
    setIsLoading(false);
  }, [selectedLocationId, locations]);

  return (
    <LocationContext.Provider
      value={{ selectedLocationId, setSelectedLocationId, locations, isLoading }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}
