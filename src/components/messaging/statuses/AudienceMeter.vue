<script setup lang="ts">
// A cuánta gente va, y **por qué son menos de los que el dueño espera**.
//
// Este componente existe para cumplir un requisito, no para decorar: la cifra final sola se lee
// como cobertura completa de los contactos del negocio, y no lo es. Un "200" sobre 340 sin decir
// que 118 no escriben desde hace meses y que 6 se cayeron por el tope es una media verdad, y la
// media que falta es justo la que el dueño necesita para decidir.
//
// Tres cosas que no se pueden tocar:
//
// 1. **Las cuatro bajas van por separado**, no sumadas. `excluded_by_cap > 0` es lo único que
//    distingue "esto llega a todos los que puede" de "esto se truncó".
// 2. **La truncación se anuncia**, con voz propia. Es la única baja que el sistema decide por el
//    dueño, así que es la única que tiene que sonar distinta.
// 3. **No hay ninguna cifra de vistas ni de entregados.** No existen: el proveedor no las devuelve
//    y devuelve 201 aunque se le caigan tandas de destinatarios.
import { computed } from 'vue'
import {
  audienceLines,
  emptyAudienceReason,
  isTruncated,
} from '@/lib/whatsappStatuses'
import type { AudiencePreview } from '@/services/messaging.api'

const props = defineProps<{ preview: AudiencePreview }>()

const lines = computed(() => audienceLines(props.preview))
const truncated = computed(() => isTruncated(props.preview))
const empty = computed(() => props.preview.addressed === 0)
</script>

<template>
  <section
    class="rounded-lg border border-steel-300/50 bg-paper p-3"
    data-testid="audience-meter"
  >
    <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
      Audiencia
    </p>

    <template v-if="empty">
      <p class="mt-1 text-sm font-medium text-graphite-900">
        No llegaría a nadie
      </p>
      <!-- Un cero pelado no le dice nada. Lo que necesita saber es si nadie le ha escrito nunca o
           si los excluyó a todos, porque se arreglan de formas distintas. -->
      <p class="mt-1 text-xs leading-relaxed text-steel-600" data-testid="audience-empty-reason">
        {{ emptyAudienceReason(preview) }}
      </p>
    </template>

    <template v-else>
      <p class="mt-1 flex items-baseline gap-1.5">
        <span class="font-mono text-2xl leading-none text-graphite-900" data-testid="audience-addressed">
          {{ preview.addressed }}
        </span>
        <span class="text-sm text-steel-600">
          de {{ preview.total_candidates }} contactos
        </span>
      </p>

      <!-- La truncación, con voz propia y antes del desglose: es lo único de esta lista que el
           sistema decidió, no el dueño. -->
      <p
        v-if="truncated"
        class="mt-2 rounded border border-ember/40 bg-ember/10 px-2 py-1 text-xs text-graphite-900"
        data-testid="audience-truncated"
      >
        Se omiten {{ preview.excluded_by_cap }} por el tope de envío.
      </p>

      <ul v-if="lines.length" class="mt-2 flex flex-col gap-0.5" data-testid="audience-lines">
        <li
          v-for="line in lines"
          :key="line.key"
          class="flex gap-1.5 text-xs text-steel-600"
          :data-line="line.key"
        >
          <span class="font-mono tabular-nums text-steel-500">{{ line.count }}</span>
          <span>{{ line.label }}</span>
        </li>
      </ul>

      <!-- El número que mide el riesgo real para el número de WhatsApp del negocio. Se enseña en
           vez de esconderse: el dueño es quien decide si le vale la pena. -->
      <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-400">
        {{ preview.provider_calls }} envíos al proveedor
      </p>
    </template>
  </section>
</template>
