export interface SharedVitestConfig {
  test: {
    globals: boolean;
    restoreMocks: boolean;
    coverage: {
      provider: "v8";
      reporter: string[];
    };
  };
}

export declare const sharedVitestConfig: SharedVitestConfig;
export default sharedVitestConfig;
