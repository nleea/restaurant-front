<script setup lang="ts">
import type { AuditLog } from '@/services/audit.api'

// Read-only detail of one audit entry — every field, no mutation controls.
defineProps<{
  entry: AuditLog
  actorName: (actorId: string | null) => string
}>()
const emit = defineEmits<{ back: [] }>()

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'medium' })
}
function shortId(id: string | null): string {
  return id ? `#${id.slice(0, 8)}` : '—'
}
</script>

<template>
  <div class="p-4 sm:p-5">
    <button
      type="button"
      class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Volver
    </button>

    <h2 class="font-mono text-base font-semibold text-ink">{{ entry.action }}</h2>
    <p class="mt-0.5 font-mono text-[11px] text-steel-500">{{ formatDateTime(entry.created_at) }}</p>

    <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Actor</dt>
        <dd class="text-ink">{{ actorName(entry.actor_id) }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">IP</dt>
        <dd class="font-mono text-ink">{{ entry.ip || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Entidad</dt>
        <dd class="text-ink">{{ entry.entity_type || '—' }} <span class="font-mono text-steel-500">{{ shortId(entry.entity_id) }}</span></dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Sucursal</dt>
        <dd class="font-mono text-ink">{{ shortId(entry.branch_id) }}</dd>
      </div>
    </dl>

    <div v-if="entry.detail" class="mt-4">
      <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Detalle</dt>
      <p class="mt-1 whitespace-pre-line rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink">
        {{ entry.detail }}
      </p>
    </div>
  </div>
</template>
