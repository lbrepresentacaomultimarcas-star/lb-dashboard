"use client";

import { createContext, useContext, useState } from "react";

type Ctx = { open: boolean; setOpen: (v: boolean) => void };
const MobileNavContext = createContext<Ctx>({ open: false, setOpen: () => {} });

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext);
}
