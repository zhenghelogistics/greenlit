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

/**
 * The API routes, bundled so tests can call their handlers directly.
 *
 * They import extensionless — `../../../lib/command` — which Next's bundler
 * resolves and Node's ESM resolver does not, so until now a route could only
 * be exercised by running the server. 62 endpoints, and the only ones with a
 * test were the ones whose logic happened to live in a library.
 *
 * `lib/auth` is aliased to a stub, so a handler runs as a signed-in operator
 * without a browser or a Supabase project. Everything else is the real thing,
 * including `authorize()` and the role table underneath it.
 */
const routes = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (entry.name === "route.ts") routes.push(full);
  }
}
await collect(path.join(site, "app", "api"));

await mkdir(out, { recursive: true });
await build({
  entryPoints: [...components, path.join(site, "GreenlitControlTower.jsx"), ...routes],
  outdir: out,
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  logLevel: "error",
  external: [
    "react", "react-dom", "react/jsx-runtime", "lucide-react",
    // The components' Next imports need a React tree to live in and are
    // never reached by a server render, so they stay external.
    "next/image", "next/link", "next/font/*", "next/navigation",
    // Reading a PDF is the extract route's job and it is not what these
    // tests are about; bundling it drags in a worker build for nothing.
    "pdfjs-dist", "pdfjs-dist/*",
  ],
  outbase: site,
  // Something in Next's server bundle reaches for CommonJS globals, and the
  // output is ESM, where they do not exist. Nothing in these tests uses them
  // for anything — they only have to be defined for the module to evaluate.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import { fileURLToPath as __f } from 'node:url';",
      "import { dirname as __d } from 'node:path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __f(import.meta.url);",
      "const __dirname = __d(__filename);",
    ].join("\n"),
  },
  alias: {
    "@greenlit/engine": path.join(site, "..", "packages", "engine", "src", "index.ts"),
    "@greenlit/core": path.join(site, "..", "packages", "core", "src", "index.ts"),
  },
  plugins: [{
    // A signed-in operator, so a handler can be called without a browser, a
    // cookie or a Supabase project. `authorize()` and the role table are
    // untouched — a permission the tester does not hold is still refused.
    //
    // A plugin rather than `alias`, which only accepts module specifiers and
    // the routes import `lib/auth` by relative path.
    name: "auth-stub",
    setup(b) {
      b.onResolve({ filter: /(^|\/)auth(\.ts)?$/ }, (args) => {
        if (!args.importer.startsWith(site)) return null;
        return { path: path.join(site, "tests", "auth-stub.ts") };
      });
    },
  }],
});

export const SCREENS = path.join(out, "components");
export const BUILT = components.map((f) => path.basename(f, ".jsx"));
export const ROUTES_DIR = path.join(out, "app", "api");
/** Every endpoint, as "/customers" or "/jobs/[id]/portnet". */
export const ROUTES = routes.map((f) =>
  "/" + path.relative(path.join(site, "app", "api"), path.dirname(f)));
