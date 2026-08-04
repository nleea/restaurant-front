<script setup lang="ts">
// La ventana de inactividad, la vida del enlace y la oferta del asistente.
//
// La ventana de inactividad parece un ajuste técnico y no lo es: es LO QUE DECIDE cuándo se
// vuelve a saludar a un cliente que ya conocemos. Ponerla en 1 hora significa saludar a la
// misma persona tres veces en una tarde; ponerla en un mes significa que un cliente de marzo
// vuelve en abril a una conversación abierta y nadie le dice nada. Se explica en la pantalla
// porque no hay forma de deducirlo del nombre del campo.
import { computed } from 'vue'

const idleHours = defineModel<number>('idleHours', { required: true })
const tokenHours = defineModel<number>('tokenHours', { required: true })
const assistantOffer = defineModel<boolean>('assistantOffer', { required: true })

const props = defineProps<{
  /** Si el asistente conversacional existe. Lo dice el backend, no la pantalla. */
  assistantAvailable: boolean
  disabled: boolean
}>()

const offerLocked = computed(() => !props.assistantAvailable || props.disabled)

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 24
  return Math.min(720, Math.max(1, Math.round(value)))
}

const idleDays = computed(() => (idleHours.value / 24).toFixed(idleHours.value % 24 === 0 ? 0 : 1))
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <h2 class="font-display text-lg font-extrabold text-ink">Conversación y enlaces</h2>

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5">
        <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
          Ventana de inactividad (horas)
        </span>
        <input
          :value="idleHours"
          type="number"
          min="1"
          max="720"
          inputmode="numeric"
          :disabled="disabled"
          data-testid="idle-hours"
          class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
          @input="idleHours = clamp(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="font-mono text-[10px] leading-relaxed text-steel-400">
          Tras {{ idleHours }} h de silencio ({{ idleDays }} días) la conversación se cierra.
          El siguiente mensaje de esa persona abre una nueva — y vuelve a recibir el saludo.
        </span>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
          Vida del enlace a la carta (horas)
        </span>
        <input
          :value="tokenHours"
          type="number"
          min="1"
          max="720"
          inputmode="numeric"
          :disabled="disabled"
          data-testid="token-hours"
          class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
          @input="tokenHours = clamp(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="font-mono text-[10px] leading-relaxed text-steel-400">
          Pasadas {{ tokenHours }} h el enlace sigue abriendo la carta, pero deja de precargar
          el nombre y el teléfono. Los enlaces ya enviados conservan la vida que tenían.
        </span>
      </label>
    </div>

    <div
      class="mt-4 flex items-start justify-between gap-3 rounded-lg border border-line bg-app p-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-ink" :class="{ 'text-steel-400': !assistantAvailable }">
          Ofrecer el asistente en el saludo
        </p>
        <p class="mt-0.5 font-mono text-[10px] leading-relaxed text-steel-400">
          <template v-if="assistantAvailable">
            Añade "Escribe *1* si prefieres que te atienda nuestro asistente" al final del
            saludo, sólo con el negocio abierto. Fuera de horario el asistente no contesta, así
            que el saludo de cerrado no lo ofrece.
          </template>
          <template v-else>
            No disponible: este negocio no tiene asistente conversacional. Un saludo que lo
            ofrezca dejaría al cliente escribiendo "1" a un número que no le va a contestar.
          </template>
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="assistantOffer"
        aria-label="Ofrecer el asistente en el saludo"
        :disabled="offerLocked"
        data-testid="assistant-toggle"
        class="relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
        :class="assistantOffer ? 'bg-success' : 'bg-steel-300'"
        @click="assistantOffer = !assistantOffer"
      >
        <span
          class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
          :class="assistantOffer ? 'left-[22px]' : 'left-0.5'"
        />
      </button>
    </div>
  </section>
</template>
