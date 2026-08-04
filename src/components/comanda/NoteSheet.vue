<script setup lang="ts">
// The kitchen note, written where there is room for it. Opened from a stamped dupe line,
// it is a centered modal with a textarea big enough to actually type into on a tablet —
// the note used to be a cramped inline field on the menu tile, captured only at add time.
// Saving closes the sheet; the note reaches the KDS because the station reads it live.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  itemName: string
  note: string | null
  saving?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ save: [note: string | null]; close: [] }>()

// Mirrors the backend's `max_length=255` on the item note.
const MAX = 255

const draft = ref(props.note ?? '')
const field = ref<HTMLTextAreaElement | null>(null)

const trimmed = computed(() => draft.value.trim())
const tooLong = computed(() => draft.value.length > MAX)
// Nothing to save when the note is unchanged — keeps a no-op tap from hitting the network.
const dirty = computed(() => trimmed.value !== (props.note ?? '').trim())
const canSave = computed(() => dirty.value && !tooLong.value && !props.saving)

function save() {
  if (!canSave.value) return
  emit('save', trimmed.value || null)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  // Enter alone must stay available for line breaks in a multi-line note.
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await nextTick()
  field.value?.focus()
  // Caret at the end so editing an existing note continues rather than overwrites.
  field.value?.setSelectionRange(draft.value.length, draft.value.length)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- Teleported: the dupe can itself live inside the mobile bottom sheet, whose z-index
       would otherwise trap this modal in a nested stacking context. -->
  <Teleport to="body">
    <!-- Scrim -->
    <div class="fixed inset-0 z-[60] bg-graphite-900/40 backdrop-blur-sm" @click="emit('close')" />

    <!-- Sheet: centered on lg, bottom sheet on mobile (thumb-reachable) -->
    <div class="pointer-events-none fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
    <aside
      class="sheet pointer-events-auto flex w-full max-w-lg flex-col rounded-t-2xl border border-line bg-paper lg:rounded-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Nota para cocina"
    >
      <header class="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div class="min-w-0">
          <p class="eyebrow">Nota para cocina</p>
          <p class="truncate font-display text-lg font-bold text-ink">{{ itemName }}</p>
        </div>
        <button
          type="button"
          class="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          aria-label="Cerrar nota"
          @click="emit('close')"
        >
          <i class="pi pi-times" />
        </button>
      </header>

      <div class="px-5 py-4">
        <label class="sr-only" for="note-field">Nota para cocina</label>
        <textarea
          id="note-field"
          ref="field"
          v-model="draft"
          rows="5"
          placeholder="sin cebolla, término medio, aparte…"
          class="w-full resize-none rounded-xl border bg-surface px-4 py-3 text-base leading-relaxed text-ink placeholder:text-steel-300 focus:outline-none focus:ring-2"
          :class="tooLong ? 'border-alert/60 focus:ring-alert/40' : 'border-line focus:border-ember/50 focus:ring-ember/40'"
          :aria-invalid="tooLong"
        />
        <div class="mt-2 flex items-center justify-between gap-2">
          <p class="font-mono text-[11px] text-steel-400">
            <kbd class="rounded border border-line px-1">Esc</kbd> cierra ·
            <kbd class="rounded border border-line px-1">⌘↵</kbd> guarda
          </p>
          <p
            class="font-mono text-[11px] tabular-nums"
            :class="tooLong ? 'font-semibold text-alert-600' : 'text-steel-400'"
          >
            {{ draft.length }}/{{ MAX }}
          </p>
        </div>
      </div>

      <div class="border-t border-line px-5 pb-5 pt-4">
        <p v-if="error" role="alert" class="mb-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-[11px] text-alert-600">
          {{ error }}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="min-h-12 flex-1 rounded-xl border border-line bg-surface text-sm font-semibold text-ink transition hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            type="button"
            :disabled="!canSave"
            class="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 disabled:cursor-not-allowed disabled:opacity-40"
            @click="save"
          >
            <i v-if="saving" class="pi pi-spin pi-spinner text-sm" />
            Guardar
          </button>
        </div>
      </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
/* Bottom sheet on mobile, a settling card on lg — matches PaymentSheet's motion vocabulary. */
@keyframes note-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.sheet {
  animation: note-in 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (min-width: 1024px) {
  @keyframes note-in-lg {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .sheet {
    animation-name: note-in-lg;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
</style>
