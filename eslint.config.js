import { base } from "./packages/config/src/eslint.js";
import { reactConfig } from "./packages/config/src/eslint-react.js";
import { createFeatureStructureRule } from "./packages/config/src/structure-rule.js";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/generated/**",
      "packages/db/src/generated/**",
    ],
  },
  ...base.map((c) => ({
    ...c,
    files: c.files ?? ["**/*.{js,mjs,cjs,ts,tsx}"],
  })),
  ...reactConfig
    .filter((c) => c.plugins || c.rules)
    .map((c) => ({ ...c, files: c.files ?? ["apps/web/**/*.{ts,tsx}"] })),
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/**/*.test.{ts,tsx}"],
    plugins: {
      local: {
        rules: {
          "feature-structure": createFeatureStructureRule(),
        },
      },
    },
    rules: {
      "local/feature-structure": "error",
    },
  },
  {
    // shadcn/ui vendors these components; their upstream pattern of
    // exporting a component alongside a plain helper (e.g. buttonVariants)
    // is intentional and not something we hand-author or want to fight.
    files: ["apps/web/src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
