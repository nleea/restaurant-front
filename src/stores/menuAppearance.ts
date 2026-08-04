import { defineStore } from 'pinia'
import {
  BLOCK_ORDER,
  DEFAULT_THEME,
  findFreeCell,
  type Block,
  type BlockContent,
  type BlockId,
  type BlockSize,
  type BrandConfig,
  type DishCardConfig,
  type DishDetailConfig,
  type DishDetailSection,
  type DishDetailSectionId,
  type GridPosition,
  type MenuAppearanceConfig,
  type ThemeConfig,
} from '@/lib/menuAppearance'
import { mockPublishedConfig } from '@/mock/menuAppearance'
import * as api from '@/services/menuAppearance.api'

// Editor state for the public-menu appearance. Two copies: `published` (what customers currently
// see) and `draft` (the in-progress edit). `isDirty` compares them so the save bar can flag unsaved
// work; Publish copies draft→published, Discard copies published→draft. Persisted via the appearance
// API: load() GETs the saved config (falling back to defaults so the editor always opens), publish()
// PUTs the draft and adopts the server's echoed copy as published.
interface MenuAppearanceState {
  published: MenuAppearanceConfig
  draft: MenuAppearanceConfig
  loaded: boolean
}

function clone(config: MenuAppearanceConfig): MenuAppearanceConfig {
  return structuredClone(config)
}

export const useMenuAppearanceStore = defineStore('menuAppearance', {
  state: (): MenuAppearanceState => ({
    published: clone(mockPublishedConfig),
    draft: clone(mockPublishedConfig),
    loaded: false,
  }),

  getters: {
    isDirty: (state): boolean =>
      JSON.stringify(state.draft) !== JSON.stringify(state.published),

    theme: (state): ThemeConfig => state.draft.theme,
    brand: (state): BrandConfig => state.draft.brand,
    dishCard: (state): DishCardConfig => state.draft.dishCard,
    dishDetail: (state): DishDetailConfig => state.draft.dishDetail,
    blockContent: (state): BlockContent => state.draft.blockContent,

    visibleBlocks: (state): Block[] => state.draft.blocks.filter((b) => b.visible),
    hiddenBlocks: (state): Block[] =>
      // Keep the tray in canonical order regardless of when blocks were hidden.
      BLOCK_ORDER.map((id) => state.draft.blocks.find((b) => b.id === id)).filter(
        (b): b is Block => !!b && !b.visible,
      ),
  },

  actions: {
    // Seed defaults synchronously so the editor renders immediately, then reconcile with the saved
    // config from the API. On failure (offline / not configured) the mock defaults stand in, so the
    // editor always opens. isDirty is only meaningful once this resolves (published===draft here).
    async load(): Promise<void> {
      this.published = clone(mockPublishedConfig)
      this.draft = clone(mockPublishedConfig)
      try {
        const saved = await api.getAppearance()
        this.published = clone(saved)
        this.draft = clone(saved)
      } catch {
        // keep the seeded defaults
      } finally {
        this.loaded = true
      }
    },

    updateTheme(patch: Partial<ThemeConfig>): void {
      this.draft.theme = { ...this.draft.theme, ...patch }
    },
    resetTheme(): void {
      this.draft.theme = { ...DEFAULT_THEME }
    },
    updateBrand(patch: Partial<BrandConfig>): void {
      this.draft.brand = { ...this.draft.brand, ...patch }
    },

    // --- Dish presentation (global card + detail layout) ---------------------
    updateDishCard(patch: Partial<DishCardConfig>): void {
      this.draft.dishCard = { ...this.draft.dishCard, ...patch }
    },
    // Toggle one visibility flag of the dish card (image/description/price/addonHint/removableHint).
    toggleDishCardField(field: keyof DishCardConfig['show']): void {
      const show = { ...this.draft.dishCard.show, [field]: !this.draft.dishCard.show[field] }
      this.draft.dishCard = { ...this.draft.dishCard, show }
    },
    // Commit a reordered section list (the panel hands back the already-reordered array).
    setDishDetailOrder(sections: DishDetailSection[]): void {
      this.draft.dishDetail = { sections: sections.map((s) => ({ ...s })) }
    },
    toggleDishDetailSection(id: DishDetailSectionId): void {
      const section = this.draft.dishDetail.sections.find((s) => s.id === id)
      if (section) section.visible = !section.visible
    },

    // --- Editable block content (promo/hours/testimonials/gallery) -----------
    updateBlockContent<K extends keyof BlockContent>(
      block: K,
      patch: Partial<BlockContent[K]>,
    ): void {
      this.draft.blockContent[block] = { ...this.draft.blockContent[block], ...patch }
    },

    // --- Block layout (the canvas commits already-validated placements) -------
    setBlockLayout(id: BlockId, layout: { position?: GridPosition; size?: BlockSize }): void {
      const block = this.draft.blocks.find((b) => b.id === id)
      if (!block) return
      if (layout.position) block.position = { ...layout.position }
      if (layout.size) block.size = layout.size
    },
    hideBlock(id: BlockId): void {
      const block = this.draft.blocks.find((b) => b.id === id)
      if (block) block.visible = false
    },
    // Re-activate a hidden block, dropping it into the first free cell (or an explicit position).
    showBlock(id: BlockId, position?: GridPosition): void {
      const block = this.draft.blocks.find((b) => b.id === id)
      if (!block) return
      block.visible = true
      block.position = position ?? findFreeCell(block.size, this.draft.blocks, id)
    },

    // --- Save lifecycle -----------------------------------------------------
    // PUT the draft and adopt the server's echoed copy as the new published baseline, so published
    // matches exactly what was persisted (isDirty then reads false). Errors propagate to the SaveBar.
    async publish(): Promise<void> {
      const saved = await api.putAppearance(this.draft)
      this.published = clone(saved)
      this.draft = clone(saved)
    },
    discard(): void {
      this.draft = clone(this.published)
    },
  },
})
