<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'

const props = defineProps<{ visible: boolean; suggestedNumber: string; saving?: boolean }>()
const emit = defineEmits<{
  'update:visible': [boolean]
  save: [{ number: string; capacity: number }]
}>()

const number = ref('')
const capacity = ref(4)

// Prefill the next number each time the modal opens; the user can edit it.
watch(
  () => props.visible,
  (open) => {
    if (open) {
      number.value = props.suggestedNumber
      capacity.value = 4
    }
  },
)

function save() {
  const n = number.value.trim()
  if (!n) return
  emit('save', { number: n, capacity: capacity.value })
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Registrar mesa"
    :style="{ width: '24rem' }"
    :breakpoints="{ '480px': '92vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <label for="rt-number" class="eyebrow">Número de mesa</label>
        <InputText id="rt-number" v-model="number" fluid autofocus maxlength="4" />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="rt-capacity" class="eyebrow">Puestos</label>
        <InputNumber
          input-id="rt-capacity"
          v-model="capacity"
          :min="1"
          :max="20"
          show-buttons
          button-layout="horizontal"
          fluid
        >
          <template #incrementbuttonicon><i class="pi pi-plus" /></template>
          <template #decrementbuttonicon><i class="pi pi-minus" /></template>
        </InputNumber>
      </div>
    </div>

    <template #footer>
      <Button label="Cancelar" severity="secondary" text @click="emit('update:visible', false)" />
      <Button label="Guardar mesa" icon="pi pi-check" :loading="saving" :disabled="!number.trim()" @click="save" />
    </template>
  </Dialog>
</template>
