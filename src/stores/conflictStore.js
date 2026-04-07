import { create } from "zustand";

/**
 * Global product/customer update conflict (409 CONFLICT).
 * `pendingConflictIds` drives row badges until the user resolves or dismisses.
 */
export const useConflictStore = create((set) => ({
  conflict: null,
  /** @type {Record<string, 'product' | 'customer'>} */
  pendingConflictIds: {},

  openConflict: (data) =>
    set((s) => ({
      conflict: data,
      pendingConflictIds:
        data?.recordId && data?.kind
          ? { ...s.pendingConflictIds, [data.recordId]: data.kind }
          : s.pendingConflictIds,
    })),

  clearConflict: () =>
    set((s) => {
      const id = s.conflict?.recordId;
      const next = { ...s.pendingConflictIds };
      if (id) delete next[id];
      return { conflict: null, pendingConflictIds: next };
    }),
}));
