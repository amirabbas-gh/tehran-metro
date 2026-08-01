import type { Theme } from "../types/metro";
import { safeStorageGet, safeStorageSet } from "./storage";

export function getPreferredTheme(): Theme {
  const saved = safeStorageGet("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#1c1d21" : "#ffcc00");
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function persistTheme(theme: Theme): void {
  safeStorageSet("theme", theme);
}
