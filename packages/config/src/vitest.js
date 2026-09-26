/** Shared Vitest defaults, spread into each package's own defineConfig. */
export const sharedVitestConfig = {
  test: {
    globals: false,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
};

export default sharedVitestConfig;
