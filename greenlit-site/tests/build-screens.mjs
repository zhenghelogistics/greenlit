/**
 * Bundle the screens so tests can render them.
 *
 * The components are JSX and the test runner is `node --test`, which does not
 * transform it — so until now the only way to find out whether a screen
 * renders was to open it in a browser. Three bugs shipped that way in one
 * week: a temporal-dead-zone crash, a customer list of blank lines, and a
 * modal that opened a job underneath itself.
 *
 * esbuild comes with Next, so this adds no dependency. React is left external
 * and resolved from the app's own node_modules, so the tests run against the
 * same React the app does.
 */
import { build } from "esbuild";
import { readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(site, ".test-build");

const components = (await readdir(path.join(site, "components")))
  .filter((f) => f.endsWith(".jsx"))
  .map((f) => path.join(site, "components", f));

await mkdir(out, { recursive: true });
await build({
  entryPoints: [...components, path.join(site, "GreenlitControlTower.jsx")],
  outdir: out,
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  logLevel: "error",
  external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "next/*"],
  alias: {
    "@greenlit/engine": path.join(site, "..", "packages", "engine", "src", "index.ts"),
    "@greenlit/core": path.join(site, "..", "packages", "core", "src", "index.ts"),
  },
});

export const SCREENS = out;
export const BUILT = components.map((f) => path.basename(f, ".jsx"));
