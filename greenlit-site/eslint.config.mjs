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
    },
  },
]);

export default eslintConfig;
