<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useBranchStore } from '@/stores/branch'
import { useAuditStore } from '@/stores/audit'
import AuditDetail from '@/components/audit/AuditDetail.vue'

// Orchestrates the read-only audit viewer: loads the best-effort actor directory and the first
// page, exposes a filter bar (action / entity type / actor when available / active-branch), and the
// entry list (master) + detail. Offset pagination via "Cargar más" until reached-end.
const branch = useBranchStore()
const audit = useAuditStore()

const error = ref<string | null>(null)

const fAction = ref('')
const fEntityType = ref('')
const fActor = ref<string | null>(null)
const fBranchOnly = ref(false)

const actorOptions = computed(() =>
  Object.entries(audit.actorIndex).map(([id, name]) => ({ label: name, value: id })),
)
const hasDirectory = computed(() => actorOptions.value.length > 0)

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

async function apply() {
  error.value = null
  try {
    await audit.query({
      action: fAction.value.trim() || null,
      entity_type: fEntityType.value.trim() || null,
      actor_id: fActor.value,
      branch_id: fBranchOnly.value ? branch.activeBranchId : null,
    })
  } catch {
    error.value = 'No se pudo consultar la auditoría.'
  }
}

async function load() {
  error.value = null
  try {
    await branch.ensureLoaded()
    await audit.loadActorDirectory()
    await audit.query({})
  } catch {
    error.value = 'No se pudo cargar la auditoría.'
  }
}

async function more() {
  try {
    await audit.loadMore()
  } catch {
    error.value = 'No se pudo cargar más.'
  }
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Filter bar -->
    <div class="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-3 sm:p-4">
      <div class="flex flex-col gap-1.5">
        <label for="f-action" class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Acción</label>
        <InputText id="f-action" v-model="fAction" placeholder="ej. login" class="w-44" @keyup.enter="apply" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="f-entity" class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Entidad</label>
        <InputText id="f-entity" v-model="fEntityType" placeholder="ej. user" class="w-36" @keyup.enter="apply" />
      </div>
      <div v-if="hasDirectory" class="flex flex-col gap-1.5">
        <label for="f-actor" class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Actor</label>
        <Select id="f-actor" v-model="fActor" :options="actorOptions" option-label="label" option-value="value" placeholder="Cualquiera" show-clear filter class="w-48" />
      </div>
      <label class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-steel-500">
        <ToggleSwitch v-model="fBranchOnly" :disabled="!branch.hasActiveBranch" />
        Solo sucursal activa
      </label>
      <Button label="Filtrar" size="small" icon="pi pi-filter" :loading="audit.loading" @click="apply" />
    </div>

    <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <div class="lg:grid lg:grid-cols-[24rem_1fr] lg:gap-6">
      <!-- LIST -->
      <aside class="flex flex-col gap-3" :class="audit.selectedId ? 'max-lg:hidden' : ''">
        <p v-if="!audit.entries.length && !audit.loading" class="text-steel-500">No hay registros de auditoría.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="e in audit.entries" :key="e.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="audit.selectedId === e.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="audit.select(e.id)"
            >
              <span class="min-w-0">
                <span class="block truncate font-mono text-sm text-ink">{{ e.action }}</span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ audit.actorName(e.actor_id) }} · {{ e.entity_type || '—' }}
                </span>
              </span>
              <span class="shrink-0 font-mono text-[10px] text-steel-500">{{ formatDateTime(e.created_at) }}</span>
            </button>
          </li>
        </ul>

        <Button
          v-if="audit.entries.length && !audit.reachedEnd"
          label="Cargar más"
          size="small"
          severity="secondary"
          outlined
          icon="pi pi-chevron-down"
          :loading="audit.loading"
          class="w-fit"
          @click="more"
        />
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="audit.selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!audit.selectedEntry" class="grid h-48 place-items-center px-6 text-center text-steel-500">
          Elige un registro para ver su detalle.
        </div>
        <Transition name="detail">
          <AuditDetail
            v-if="audit.selectedEntry"
            :key="audit.selectedEntry.id"
            :entry="audit.selectedEntry"
            :actor-name="audit.actorName"
            @back="audit.selectedId = null"
          />
        </Transition>
      </section>
    </div>
  </div>
</template>
