import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    // ESLint 9 lints .js/.mjs/.cjs by default and leaves .jsx alone unless a
    // config names it. GreenlitControlTower.jsx — the whole UI — was therefore
    // never linted, which is how three helpers came to be called with no
    // import: not typechecked either, so nothing looked at them until the
    // browser said "toIntakeResult is not defined".
    files: ["**/*.jsx", "**/*.mjs", "**/*.js"],
    rules: {
      // typescript-eslint switches this off because tsc reports an unknown
      // name more precisely. That holds only for files tsc reads.
      "no-undef": "error",
      // This codebase types nothing at runtime and uses no PropTypes; the rule
      // would report every prop of every component and drown the rules that
      // find real defects.
      "react/prop-types": "off",
      // A `const` read above the line that declares it. In a component body
      // this is not a style question: the read happens during render and
      // throws "Cannot access 'x' before initialization", which the error
      // boundary catches as a blank screen with a minified letter in it.
      //
      // It reached the browser because a useEffect dependency array sat above
      // the useState it depended on — legal-looking, since the effect itself
      // runs later, but the array is built during render.
      //
      // `functions: false` because function declarations genuinely hoist and
      // this codebase relies on that throughout: handlers are declared under
      // the render they are used in, deliberately.
      "no-use-before-define": ["error", {
        functions: false, classes: true, variables: true, allowNamedExports: false,
      }],
    },
  },
]);

export default eslintConfig;
