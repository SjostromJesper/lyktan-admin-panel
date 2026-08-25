<script setup lang="ts">
import jsQR from 'jsqr'

const emit = defineEmits<{ close: [] }>()

type VerifyResult = {
  approved: boolean
  reason: 'not_found' | 'expired' | 'never_activated' | null
  member?: { name: string; tier: 'litet' | 'stort'; expiryDate: string | null }
}

const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

const cameraError = ref('')
const scanning = ref(false)
const result = ref<VerifyResult | null>(null)
const verifying = ref(false)

let stream: MediaStream | null = null
let frameHandle: number | null = null

const stopCamera = () => {
  if (frameHandle !== null) {
    cancelAnimationFrame(frameHandle)
    frameHandle = null
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
}

const scanFrame = () => {
  if (!scanning.value || !videoEl.value || !canvasEl.value) return

  const video = videoEl.value
  const canvas = canvasEl.value

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code?.data) {
        verify(code.data)
        return
      }
    }
  }

  frameHandle = requestAnimationFrame(scanFrame)
}

const startCamera = async () => {
  cameraError.value = ''
  result.value = null

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })

    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }

    scanning.value = true
    frameHandle = requestAnimationFrame(scanFrame)
  } catch (err: any) {
    cameraError.value = err?.name === 'NotAllowedError'
      ? 'Kameraåtkomst nekades. Tillåt kameran i webbläsaren och försök igen.'
      : 'Kunde inte starta kameran.'
  }
}

const verify = async (token: string) => {
  scanning.value = false
  stopCamera()
  verifying.value = true

  try {
    result.value = await $fetch<VerifyResult>('/api/members/verify', {
      method: 'POST',
      body: { token }
    })
  } catch (err: any) {
    result.value = { approved: false, reason: null }
  } finally {
    verifying.value = false
  }
}

const scanAgain = () => {
  result.value = null
  startCamera()
}

const close = () => {
  stopCamera()
  emit('close')
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  startCamera()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopCamera()
})

const reasonLabel = (reason: VerifyResult['reason']) => {
  if (reason === 'expired') return 'Medlemskapet har gått ut'
  if (reason === 'never_activated') return 'Medlemskapet har aldrig aktiverats'
  if (reason === 'not_found') return 'Okänd QR-kod'
  return 'Kunde inte verifiera'
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <div class="w-full max-w-sm rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">Skanna medlemskort</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="close">✕</button>
      </div>

      <div v-if="!result" class="overflow-hidden rounded-xl bg-black">
        <video ref="videoEl" class="aspect-square w-full object-cover" muted playsinline />
      </div>
      <canvas ref="canvasEl" class="hidden" />

      <p v-if="cameraError" class="mt-4 text-sm text-red-600">{{ cameraError }}</p>
      <p v-else-if="!result && scanning" class="mt-4 text-center text-sm text-lyktan-mute">Rikta kameran mot QR-koden…</p>
      <p v-else-if="verifying" class="mt-4 text-center text-sm text-lyktan-mute">Kontrollerar…</p>

      <div v-if="result" class="mt-2 rounded-xl p-6 text-center" :class="result.approved ? 'bg-emerald-50' : 'bg-red-50'">
        <p class="text-2xl font-semibold" :class="result.approved ? 'text-emerald-700' : 'text-red-700'">
          {{ result.approved ? 'Godkänd' : 'Nekad' }}
        </p>
        <p v-if="result.member" class="mt-2 text-sm text-lyktan-ink">
          {{ result.member.name }} · {{ TIER_LABELS[result.member.tier] }}
        </p>
        <p v-if="!result.approved" class="mt-1 text-sm text-lyktan-mute">{{ reasonLabel(result.reason) }}</p>

        <button
          type="button"
          class="mt-5 inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black"
          @click="scanAgain"
        >
          Skanna igen
        </button>
      </div>
    </div>
  </div>
</template>
