"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** Mesma chave lida pelo script do layout, que aplica o tema antes da hidratação. */
const themeKey = "jpn-theme:v1";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const isDark = () => document.documentElement.dataset.theme === "dark";

/** Alterna claro/escuro (F6). A preferência fica no navegador, separada dos projetos. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    const next = !dark;
    if (next) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(themeKey, next ? "dark" : "light"); } catch { /* preferência só visual */ }
  }
  return <button type="button" className="ui-icon-button ui-icon-button-ghost theme-toggle" aria-pressed={dark} aria-label="Tema escuro" title={dark ? "Voltar ao tema claro" : "Usar tema escuro"} onClick={toggle}>
    {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
  </button>;
}
