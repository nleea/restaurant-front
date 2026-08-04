<script setup lang="ts">
// Real image picker: uploads the chosen file straight to Cloudflare R2 (presign → direct PUT) and
// emits the object's final public URL as v-model. Keeps the previous value on failure and surfaces
// an inline error. Same El Pase chrome as ImageUploadMock, plus uploading/error states.
import { ref } from 'vue'
import { uploadImageToR2 } from '@/services/media.api'

defineProps<{
  label: string
  modelValue: string
  /** Preview aspect: 'banner' is wide, 'logo' is a square chip. */
  shape: 'banner' | 'logo'
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const input = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref('')

function pick() {
  input.value?.click()
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  error.value = ''
  uploading.value = true
  try {
    const publicUrl = await uploadImageToR2(file)
    emit('update:modelValue', publicUrl)
  } catch {
    error.value = 'No se pudo subir la imagen. Intenta de nuevo.'
  } finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

function clear() {
  error.value = ''
  emit('update:modelValue', '')
  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <span class="text-[13px] text-ink">{{ label }}</span>
    <div class="flex items-center gap-3">
      <!-- Preview well -->
      <div
        class="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-sunken"
        :class="shape === 'banner' ? 'h-14 w-28' : 'size-14'"
      >
        <img v-if="modelValue" :src="modelValue" alt="" class="h-full w-full object-cover" />
        <i v-else class="pi text-steel-400" :class="shape === 'banner' ? 'pi-image' : 'pi-camera'" />
      </div>
      <div class="flex flex-col gap-1.5">
        <button
          type="button"
          :disabled="uploading"
          class="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-600 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:cursor-not-allowed disabled:opacity-60"
          @click="pick"
        >
          <i
            class="text-[10px]"
            :class="uploading ? 'pi pi-spin pi-spinner' : 'pi pi-upload'"
          />
          {{ uploading ? 'Subiendo…' : modelValue ? 'Cambiar' : 'Subir' }}
        </button>
        <button
          v-if="modelValue && !uploading"
          type="button"
          class="text-left font-mono text-[10px] uppercase tracking-wide text-steel-500 transition hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          @click="clear"
        >
          Quitar
        </button>
      </div>
      <input ref="input" type="file" accept="image/*" class="hidden" @change="onFile" />
    </div>
    <p v-if="error" class="text-[12px] text-alert" role="alert">{{ error }}</p>
  </div>
</template>
