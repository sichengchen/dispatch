import { create } from "zustand";

type UiState = {
  selectedSourceId: number | null;
  selectedArticleId: number | null;
  setSelectedSourceId: (id: number | null) => void;
  setSelectedArticleId: (id: number | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedSourceId: null,
  selectedArticleId: null,
  setSelectedSourceId: (id) => set({ selectedSourceId: id, selectedArticleId: null }),
  setSelectedArticleId: (id) => set({ selectedArticleId: id })
}));
