<script setup lang="ts">
type Batch = { id: string, name: string, note: string | null, status: string, created_by: string | null, created_at: string, item_count: number }
type UploadTarget = { position: number, path: string, signedUrl: string }

const { canEditScan } = usePermissions()

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Laddar upp',
  uploaded: 'Uppladdad',
  identifying: 'Identifieras',
  review: 'Granskning',
  confirmed: 'Bekräftad',
  priced: 'Prissatt',
  drafted: 'Utkast i Shopify',
  published: 'Publicerad'
}

const EXPECTED_CARDS = 50
const IMAGE_EXT = /\.(jpe?g|png)$/i

// --- Batch list ---
const batches = ref<Batch[]>([])
const listLoading = ref(true)
const listError = ref('')

const loadBatches = async () => {
  listLoading.value = true
  listError.value = ''

  try {
    const res = await $fetch<{ batches: Batch[] }>('/api/scan/batches')
    batches.value = res.batches
  } catch (err: any) {
    listError.value = err?.data?.statusMessage || 'Kunde inte hämta buntar'
  } finally {
    listLoading.value = false
  }
}

onMounted(loadBatches)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

// --- Folder selection ---
type ScanMode = 'single' | 'duplex-back-odd' | 'duplex-back-even'

const files = ref<File[]>([])
const fileHashes = ref<(string | null)[]>([])
const fileVectors = ref<(string | null)[]>([])
const skippedCount = ref(0)
const batchName = ref('')
const note = ref('')
const scanMode = ref<ScanMode>('single')
const detectedMode = ref<ScanMode>('single')
const analysing = ref(false)

// Image index (0-based) -> is it a card front under the chosen scan mode?
const isFront = (i: number) => {
  if (scanMode.value === 'duplex-back-odd') return i % 2 === 1
  if (scanMode.value === 'duplex-back-even') return i % 2 === 0
  return true
}

const cardFiles = computed(() => files.value.map((file, i) => ({ file, hash: fileHashes.value[i] ?? null, vec: fileVectors.value[i] ?? null, i })).filter((c) => isFront(c.i)))

const hamming = (a: string, b: string) => {
  let x = BigInt.asUintN(64, BigInt(a) ^ BigInt(b))
  let bits = 0
  while (x) {
    bits += Number(x & 1n)
    x >>= 1n
  }
  return bits
}

// Card backs all look alike, so on a duplex scan every second image hashes
// almost identically. Compare consecutive same-parity images: one parity
// with very small distances and the other with large ones = the backs.
const detectDuplex = (hashes: (string | null)[]): ScanMode => {
  if (hashes.length < 6) return 'single'

  const median = (parity: number) => {
    const distances: number[] = []
    for (let i = parity; i + 2 < hashes.length; i += 2) {
      const a = hashes[i]
      const b = hashes[i + 2]
      if (a != null && b != null) distances.push(hamming(a, b))
    }
    distances.sort((x, y) => x - y)
    return distances.length ? distances[Math.floor(distances.length / 2)]! : 99
  }

  const evenIdx = median(0)
  const oddIdx = median(1)

  if (evenIdx <= 8 && oddIdx >= 16) return 'duplex-back-odd'
  if (oddIdx <= 8 && evenIdx >= 16) return 'duplex-back-even'
  return 'single'
}

const onFolderPicked = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])

  const images = picked
    .filter((f) => IMAGE_EXT.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv', { numeric: true }))

  files.value = images
  fileHashes.value = []
  fileVectors.value = []
  skippedCount.value = picked.length - images.length
  scanMode.value = 'single'
  detectedMode.value = 'single'

  const firstPath = (picked[0] as File & { webkitRelativePath?: string } | undefined)?.webkitRelativePath
  batchName.value = firstPath?.includes('/') ? firstPath.split('/')[0]! : ''

  // Hash up front: needed for the duplex check, and reused by the upload.
  analysing.value = true
  const hashes: (string | null)[] = []
  const vectors: (string | null)[] = []

  for (const file of images) {
    hashes.push(await computeDHash(file).catch(() => null))
    vectors.push(await computeArtVector(file).catch(() => null))
  }

  fileHashes.value = hashes
  fileVectors.value = vectors
  detectedMode.value = detectDuplex(hashes)
  scanMode.value = detectedMode.value
  analysing.value = false
}

const countWarning = computed(() => {
  const n = cardFiles.value.length
  if (!n) return ''
  if (n < EXPECTED_CARDS * 0.6 || n > EXPECTED_CARDS * 1.4) {
    return `Bunten innehåller ${n} kort — vanligtvis är det ca ${EXPECTED_CARDS}. Kontrollera att det är rätt mapp.`
  }
  return ''
})

// --- Upload ---
const uploading = ref(false)
const phase = ref('')
const done = ref(0)
const uploadError = ref('')

const uploadOne = async (target: UploadTarget, file: File) => {
  const body = new FormData()
  body.append('cacheControl', '3600')
  body.append('', file)

  const res = await fetch(target.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body })

  if (!res.ok) {
    throw new Error(`Uppladdning av ${file.name} misslyckades (${res.status})`)
  }
}

const startUpload = async () => {
  if (!cardFiles.value.length || !batchName.value.trim() || analysing.value) return

  uploading.value = true
  uploadError.value = ''
  done.value = 0

  try {
    const cards = cardFiles.value

    phase.value = 'Skapar bunt'
    const created = await $fetch<{ batch: { id: string }, uploads: UploadTarget[] }>('/api/scan/batches', {
      method: 'POST',
      body: {
        name: batchName.value.trim(),
        note: note.value.trim(),
        items: cards.map((c, n) => ({ filename: c.file.name, position: n + 1, dhash: c.hash, artVec: c.vec }))
      }
    })

    phase.value = 'Laddar upp'
    done.value = 0
    const targets = new Map(created.uploads.map((u) => [u.position, u]))
    const queue = cards.map((c, n) => ({ file: c.file, target: targets.get(n + 1)! }))
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const job = queue.shift()!
        await uploadOne(job.target, job.file)
        done.value += 1
      }
    })
    await Promise.all(workers)

    phase.value = 'Slutför'
    await $fetch(`/api/scan/batches/${created.batch.id}/complete`, { method: 'POST' })

    // OCR of collector number / set code, straight from the files still in memory.
    // A failure here (e.g. offline model download) never blocks the upload — the
    // hash match still runs, just without the OCR tie-break.
    phase.value = 'Läser text på korten'
    done.value = 0
    const ocr: { position: number, text: string }[] = []

    try {
      const pool = await createOcrPool(2)
      const jobs = cards.map((c, n) => ({ file: c.file, position: n + 1 }))
      await Promise.all(
        Array.from({ length: 2 }, async () => {
          while (jobs.length) {
            const job = jobs.shift()!
            ocr.push({ position: job.position, text: await pool.recognize(job.file).catch(() => '') })
            done.value += 1
          }
        })
      )
      await pool.terminate()
    } catch {
      // continue without OCR
    }

    phase.value = 'Identifierar'
    await $fetch(`/api/scan/batches/${created.batch.id}/identify`, { method: 'POST', body: { ocr } })

    files.value = []
    fileHashes.value = []
    fileVectors.value = []
    batchName.value = ''
    note.value = ''
    await navigateTo(`/skanning/${created.batch.id}`)
  } catch (err: any) {
    uploadError.value = err?.data?.statusMessage || err?.message || 'Uppladdningen misslyckades'
    await loadBatches()
  } finally {
    uploading.value = false
    phase.value = ''
  }
}

const removeBatch = async (batch: Batch) => {
  if (!confirm(`Ta bort bunten "${batch.name}" och alla dess bilder?`)) return

  try {
    await $fetch(`/api/scan/batches/${batch.id}`, { method: 'DELETE' })
    await loadBatches()
  } catch (err: any) {
    listError.value = err?.data?.statusMessage || 'Kunde inte ta bort bunten'
  }
}
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Skanna in kort</h1>

    <div v-if="canEditScan" class="mb-8 rounded-2xl border border-[var(--line)] p-5">
      <h2 class="mb-1 text-sm font-semibold text-lyktan-ink">Ny bunt</h2>
      <p class="mb-4 text-sm text-lyktan-mute">
        Välj mappen med skanningen (en JPEG per kort, i skanningsordning). Filordningen blir kortets plats i den fysiska bunten.
      </p>

      <label class="block">
        <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Mapp</span>
        <input
          type="file"
          webkitdirectory
          multiple
          :disabled="uploading"
          class="block w-full text-sm"
          @change="onFolderPicked"
        >
      </label>

      <p v-if="analysing" class="mt-4 text-sm text-lyktan-mute" aria-live="polite">Analyserar {{ files.length }} bilder…</p>

      <template v-if="files.length && !analysing">
        <p class="mt-4 text-sm text-lyktan-ink">
          {{ files.length }} bilder hittades<span v-if="skippedCount" class="text-lyktan-mute"> ({{ skippedCount }} filer som inte är bilder ignorerades)</span>.
          Första: {{ files[0]!.name }}, sista: {{ files[files.length - 1]!.name }}.
        </p>

        <fieldset class="mt-4">
          <legend class="mb-1 text-[0.72rem] font-medium text-lyktan-mute">Typ av skanning</legend>
          <div class="flex flex-col gap-1 text-sm">
            <label class="flex items-center gap-2"><input v-model="scanMode" type="radio" value="single" :disabled="uploading"> Enkelsidig — varje bild är ett kort</label>
            <label class="flex items-center gap-2"><input v-model="scanMode" type="radio" value="duplex-back-odd" :disabled="uploading"> Duplex — baksidor är bild 1, 3, 5… (korten är 2, 4, 6…)</label>
            <label class="flex items-center gap-2"><input v-model="scanMode" type="radio" value="duplex-back-even" :disabled="uploading"> Duplex — baksidor är bild 2, 4, 6… (korten är 1, 3, 5…)</label>
          </div>
          <p v-if="detectedMode !== 'single'" class="mt-2 text-[0.8rem] text-lyktan-mute">
            Varannan bild ser ut som en kortbaksida, så duplex är förvalt. Baksidorna laddas inte upp, och kortens plats i bunten räknas bara på framsidorna ({{ cardFiles.length }} kort).
          </p>
        </fieldset>

        <p v-if="countWarning" class="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--bad)]" role="alert">{{ countWarning }}</p>

        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Buntens namn</span>
            <input v-model="batchName" :disabled="uploading" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
          </label>
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning (valfritt)</span>
            <input v-model="note" :disabled="uploading" class="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
          </label>
        </div>

        <div class="mt-4 flex items-center gap-4">
          <button
            type="button"
            :disabled="uploading || !batchName.trim()"
            class="inline-flex min-h-9 items-center justify-center rounded-lg bg-lyktan-ink px-5 text-sm font-medium text-[var(--paper)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            @click="startUpload"
          >
            {{ uploading ? 'Arbetar…' : 'Ladda upp bunt' }}
          </button>
          <span v-if="uploading" class="text-sm text-lyktan-mute" aria-live="polite">{{ phase }} {{ done }}/{{ cardFiles.length }}</span>
        </div>
      </template>

      <p v-if="uploadError" class="mt-3 text-sm text-[var(--bad)]" role="alert">{{ uploadError }}</p>
    </div>

    <h2 class="mb-3 text-sm font-semibold text-lyktan-ink">Buntar</h2>

    <p v-if="listLoading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="listError" class="text-sm text-[var(--bad)]">{{ listError }}</p>
    <p v-else-if="!batches.length" class="text-sm text-lyktan-mute">Inga buntar ännu.</p>

    <ul v-else class="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
      <li v-for="batch in batches" :key="batch.id" class="flex flex-wrap items-center justify-between gap-3 p-4">
        <NuxtLink :to="`/skanning/${batch.id}`" class="min-w-0 flex-1">
          <p class="font-medium text-lyktan-ink">{{ batch.name }}</p>
          <p class="mono text-[0.72rem]" style="color:var(--muted)">
            {{ batch.item_count }} kort · {{ formatDate(batch.created_at) }}<span v-if="batch.created_by"> · {{ batch.created_by }}</span>
          </p>
        </NuxtLink>
        <span class="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-lyktan-mute">{{ STATUS_LABELS[batch.status] || batch.status }}</span>
        <NuxtLink v-if="canEditScan && ['confirmed', 'priced', 'drafted', 'published'].includes(batch.status)" :to="`/skanning/${batch.id}?export=1`" class="btn small">Exportera till PowerTools</NuxtLink>
        <button v-if="canEditScan" type="button" class="text-sm text-[var(--bad)] hover:underline" @click="removeBatch(batch)">Ta bort</button>
      </li>
    </ul>
  </div>
</template>
