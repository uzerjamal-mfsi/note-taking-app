export declare const ALLOWED_TOP_LEVEL_SRC_ENTRIES: Set<string>;
export declare function isDisallowedTopLevelSrcEntry(entryName: string): boolean;
export declare function createFeatureStructureRule(): {
  meta: { type: string; docs: { description: string }; schema: unknown[] };
  create: (context: unknown) => Record<string, (node: unknown) => void>;
};
