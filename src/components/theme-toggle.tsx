"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const K = "lb:theme";
type Theme = "dark" | "light";

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "light") root.classList.add("light");
  else root.classList.remove("light");
}

export function ThemeBoot() {
  // Inicializa o tema antes da hidratação visual
  useEffect(() => {
    try {
      const saved = (localStorage.getItem(K) as Theme | null) ?? "dark";
      apply(saved);
    } catch {
      apply("dark");
    }
  }, []);
  return null;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(K) as Theme | null) ?? "dark";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(saved);
      apply(saved);
    } catch {
      /* noop */
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(K, next);
    } catch {
      /* noop */
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Alternar tema">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
