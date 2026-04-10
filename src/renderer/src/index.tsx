/* @refresh reload */
import { render } from "solid-js/web";
import App from "@/App";
import "./styles/app.css";

const root = document.getElementById("root")!;
root.innerHTML = "";
render(() => <App />, root);
