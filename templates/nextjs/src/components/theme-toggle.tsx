"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

const themes = ["light", "dark", "system"] as const;

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        aria-label="Toggle theme"
      >
        <Monitor className="h-4 w-4" />
      </button>
    );
  }

  const current = (theme ?? "system") as (typeof themes)[number];
  const nextTheme = themes[(themes.indexOf(current) + 1) % themes.length];
  const Icon = icons[current];

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
