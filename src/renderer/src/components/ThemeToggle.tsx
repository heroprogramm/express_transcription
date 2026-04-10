import { createSignal } from "solid-js";
import { Sun, Moon } from "lucide-solid";
import Button from "@/components/Button";

/** Icon button that toggles between dark and light themes. */
export default function ThemeToggle() {
  const html = document.documentElement;
  const [theme, setTheme] = createSignal(html.dataset.theme || "dark");

  function toggle() {
    document.body.classList.add("theme-transitioning");
    const next = theme() === "dark" ? "light" : "dark";
    html.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
    setTimeout(() => document.body.classList.remove("theme-transitioning"), 250);
  }

  return (
    <Button
      variant="icon"
      aria-label={theme() === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
      class="[&_svg]:transition-transform [&:hover_svg]:rotate-[30deg]"
    >
      <Sun size={14} class="hidden dark:block" />
      <Moon size={14} class="hidden light:block" />
    </Button>
  );
}
