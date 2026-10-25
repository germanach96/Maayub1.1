// Arranca el servidor MCP de Playwright con el navegador que haya.
//
// @playwright/mcp busca Google Chrome por defecto. En las sesiones en la nube
// no hay Chrome, sino un Chromium ya instalado en /opt/pw-browsers, y la
// versión que trae el MCP no es la misma, así que no lo encuentra solo. Si ese
// Chromium existe se le pasa a mano (y sin ventana, porque allí no hay
// pantalla, y sin la "caja de arena" de Chromium, que el contenedor no permite);
// en un ordenador normal se arranca tal cual y usa su Chrome.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const CHROMIUM_NUBE = "/opt/pw-browsers/chromium";
const args = ["-y", "@playwright/mcp@0.0.83"];
if (existsSync(CHROMIUM_NUBE)) {
  args.push("--headless", "--no-sandbox", "--executable-path", CHROMIUM_NUBE);
}

const hijo = spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
hijo.on("exit", (code) => process.exit(code ?? 0));
