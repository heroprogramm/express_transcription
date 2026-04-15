/* @refresh reload */
import { render } from "solid-js/web";
import App from "@/App";
import "./styles/app.css";

const root = document.getElementById("root")!;
const skeleton = document.getElementById("app-skeleton");

if (skeleton) {
  skeleton.classList.add("fade-out");
  skeleton.addEventListener(
    "animationend",
    () => {
      root.innerHTML = "";
      render(() => <App />, root);
    },
    { once: true },
  );
} else {
  root.innerHTML = "";
  render(() => <App />, root);
}
