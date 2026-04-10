import { Sun, Moon } from "lucide-solid";
import Button from "@/components/Button";

export default function ThemeToggle() {
  function toggle() {
    document.body.classList.add("theme-transitioning");
    const html = document.documentElement;
    const next = html.dataset.theme === "dark" ? "light" : "dark";
    html.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTimeout(() => document.body.classList.remove("theme-transitioning"), 250);
  }

  return (
    <Button
      variant="icon"
      aria-label="Toggle theme"
      onClick={toggle}
      class="[&_svg]:transition-transform [&:hover_svg]:rotate-[30deg]"
    >
      <Sun size={14} class="hidden dark:block" />
      <Moon size={14} class="hidden light:block" />
    </Button>
  );
}
