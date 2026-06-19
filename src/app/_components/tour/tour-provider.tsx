"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { tourSteps } from "./tour-steps";

interface TourContextValue {
  startTour: () => void;
  resetTour: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

const STORAGE_KEY = "hms_tour_completed";

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const driverRef = useRef<Driver | null>(null);
  const hasAutoTriggered = useRef(false);

  const createDriver = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
    }
    driverRef.current = driver({
      showProgress: true,
      steps: tourSteps,
      nextBtnText: "Lanjut",
      prevBtnText: "Kembali",
      doneBtnText: "Selesai",
      progressText: "{{current}} dari {{total}}",
      onDestroyed: () => {
        localStorage.setItem(STORAGE_KEY, "1");
      },
    });
    return driverRef.current;
  }, []);

  const startTour = useCallback(() => {
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
      setTimeout(() => {
        createDriver().drive();
      }, 500);
    } else {
      createDriver().drive();
    }
  }, [pathname, router, createDriver]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (hasAutoTriggered.current) return;
    if (pathname !== "/dashboard") return;

    const completed = localStorage.getItem(STORAGE_KEY);
    if (completed) return;

    hasAutoTriggered.current = true;
    const timeout = setTimeout(() => {
      createDriver().drive();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [pathname, createDriver]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  return (
    <TourContext.Provider value={{ startTour, resetTour }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (context === undefined) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
