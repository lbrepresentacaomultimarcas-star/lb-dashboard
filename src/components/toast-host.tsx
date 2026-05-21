"use client";

import { Toaster } from "sonner";

export function ToastHost() {
  return (
    <Toaster
      theme="dark"
      position="top-right"
      richColors
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        },
      }}
    />
  );
}
