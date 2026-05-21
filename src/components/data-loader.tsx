"use client";

import { useEffect } from "react";
import { initStore } from "@/lib/store";

export function DataLoader({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initStore();
  }, []);
  return <>{children}</>;
}
