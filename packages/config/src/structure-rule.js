/**
 * Top-level entries allowed directly under a React app's `src/`.
 * Anything else is expected to live under `src/features/<feature>/`.
 */
export const ALLOWED_TOP_LEVEL_SRC_ENTRIES = new Set([
  "main.tsx",
  "App.tsx",
  "vite-env.d.ts",
  "features",
  "lib",
  "components",
  "routes",
  "providers",
  "store",
  "test",
]);

export function isDisallowedTopLevelSrcEntry(entryName) {
  return !ALLOWED_TOP_LEVEL_SRC_ENTRIES.has(entryName);
}

/** ESLint rule: flags files placed directly under src/ outside the allowed entries. */
export function createFeatureStructureRule() {
  return {
    meta: {
      type: "problem",
      docs: {
        description: "Feature code must live under src/features/<feature>/{components,hooks,api}",
      },
      schema: [],
    },
    create(context) {
      return {
        Program(node) {
          const filename = context.filename ?? context.getFilename();
          const match = filename.replace(/\\/g, "/").match(/\/src\/([^/]+)(\/|$)/);
          if (!match) return;

          const topLevelEntry = match[1];
          if (isDisallowedTopLevelSrcEntry(topLevelEntry)) {
            context.report({
              node,
              message: `"${topLevelEntry}" is not an allowed top-level src/ entry. Feature code belongs under src/features/<feature>/{components,hooks,api}.`,
            });
          }
        },
      };
    },
  };
}
