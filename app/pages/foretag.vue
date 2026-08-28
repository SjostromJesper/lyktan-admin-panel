<script setup lang="ts">
type CompanyField = { id: string; label: string; value: string; created_at: string }
type CompanyLink = { id: string; title: string; url: string; created_at: string }

const { canEditCompany } = usePermissions()

const copiedId = ref<string | null>(null)

const copy = async (text: string, id: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = id
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 1500)
  } catch {
    // Clipboard access can fail (permissions, non-HTTPS) — silently ignored,
    // the value is still visible on screen to copy by hand.
  }
}

// --- Företagsuppgifter ---
const fields = ref<CompanyField[]>([])
const fieldsLoading = ref(true)
const fieldsError = ref('')

const loadFields = async () => {
  fieldsLoading.value = true
  fieldsError.value = ''

  try {
    const res = await $fetch<{ fields: CompanyField[] }>('/api/company/fields')
    fields.value = res.fields
  } catch (err: any) {
    fieldsError.value = err?.data?.statusMessage || 'Kunde inte hämta företagsuppgifter'
  } finally {
    fieldsLoading.value = false
  }
}

onMounted(loadFields)

const showAddField = ref(false)
const newField = ref({ label: '', value: '' })
const addFieldSaving = ref(false)
const addFieldError = ref('')

const submitAddField = async () => {
  addFieldSaving.value = true
  addFieldError.value = ''

  try {
    const { field } = await $fetch<{ field: CompanyField }>('/api/company/fields', {
      method: 'POST',
      body: newField.value
    })
    fields.value.push(field)
    newField.value = { label: '', value: '' }
    showAddField.value = false
  } catch (err: any) {
    addFieldError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    addFieldSaving.value = false
  }
}

const editingFieldId = ref<string | null>(null)
const editFieldDraft = ref({ label: '', value: '' })
const fieldSaving = ref(false)
const fieldError = ref('')

const startEditField = (field: CompanyField) => {
  editingFieldId.value = field.id
  editFieldDraft.value = { label: field.label, value: field.value }
  fieldError.value = ''
}

const saveField = async (id: string) => {
  fieldSaving.value = true
  fieldError.value = ''

  try {
    const { field } = await $fetch<{ field: CompanyField }>(`/api/company/fields/${id}`, {
      method: 'PATCH',
      body: editFieldDraft.value
    })
    const idx = fields.value.findIndex((f) => f.id === id)
    if (idx !== -1) fields.value[idx] = field
    editingFieldId.value = null
  } catch (err: any) {
    fieldError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    fieldSaving.value = false
  }
}

const deleteField = async (field: CompanyField) => {
  if (!confirm(`Ta bort "${field.label}"?`)) return

  try {
    await $fetch(`/api/company/fields/${field.id}`, { method: 'DELETE' })
    fields.value = fields.value.filter((f) => f.id !== field.id)
    if (editingFieldId.value === field.id) editingFieldId.value = null
  } catch (err: any) {
    fieldsError.value = err?.data?.statusMessage || 'Kunde inte ta bort'
  }
}

// --- Viktiga länkar ---
const links = ref<CompanyLink[]>([])
const linksLoading = ref(true)
const linksError = ref('')

const loadLinks = async () => {
  linksLoading.value = true
  linksError.value = ''

  try {
    const res = await $fetch<{ links: CompanyLink[] }>('/api/company/links')
    links.value = res.links
  } catch (err: any) {
    linksError.value = err?.data?.statusMessage || 'Kunde inte hämta länkar'
  } finally {
    linksLoading.value = false
  }
}

onMounted(loadLinks)

const showAddLink = ref(false)
const newLink = ref({ title: '', url: '' })
const addLinkSaving = ref(false)
const addLinkError = ref('')

const submitAddLink = async () => {
  addLinkSaving.value = true
  addLinkError.value = ''

  try {
    const { link } = await $fetch<{ link: CompanyLink }>('/api/company/links', {
      method: 'POST',
      body: newLink.value
    })
    links.value.push(link)
    newLink.value = { title: '', url: '' }
    showAddLink.value = false
  } catch (err: any) {
    addLinkError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    addLinkSaving.value = false
  }
}

const editingLinkId = ref<string | null>(null)
const editLinkDraft = ref({ title: '', url: '' })
const linkSaving = ref(false)
const linkError = ref('')

const startEditLink = (link: CompanyLink) => {
  editingLinkId.value = link.id
  editLinkDraft.value = { title: link.title, url: link.url }
  linkError.value = ''
}

const saveLink = async (id: string) => {
  linkSaving.value = true
  linkError.value = ''

  try {
    const { link } = await $fetch<{ link: CompanyLink }>(`/api/company/links/${id}`, {
      method: 'PATCH',
      body: editLinkDraft.value
    })
    const idx = links.value.findIndex((l) => l.id === id)
    if (idx !== -1) links.value[idx] = link
    editingLinkId.value = null
  } catch (err: any) {
    linkError.value = err?.data?.statusMessage || 'Kunde inte spara'
  } finally {
    linkSaving.value = false
  }
}

const deleteLink = async (link: CompanyLink) => {
  if (!confirm(`Ta bort "${link.title}"?`)) return

  try {
    await $fetch(`/api/company/links/${link.id}`, { method: 'DELETE' })
    links.value = links.value.filter((l) => l.id !== link.id)
    if (editingLinkId.value === link.id) editingLinkId.value = null
  } catch (err: any) {
    linksError.value = err?.data?.statusMessage || 'Kunde inte ta bort'
  }
}
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Företag</h1>

    <div class="mb-10">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-lyktan-ink">Företagsuppgifter</h2>
        <button
          v-if="canEditCompany"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showAddField = !showAddField"
        >
          {{ showAddField ? 'Avbryt' : '+ Ny uppgift' }}
        </button>
      </div>

      <form
        v-if="showAddField"
        class="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
        @submit.prevent="submitAddField"
      >
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
          <input v-model="newField.label" required placeholder="T.ex. Organisationsnummer" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Värde</span>
          <input v-model="newField.value" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <p v-if="addFieldError" class="sm:col-span-2 text-sm text-red-600">{{ addFieldError }}</p>

        <div class="sm:col-span-2">
          <button
            type="submit"
            :disabled="addFieldSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ addFieldSaving ? 'Sparar…' : 'Spara uppgift' }}
          </button>
        </div>
      </form>

      <p v-if="fieldsLoading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="fieldsError" class="text-sm text-red-600">{{ fieldsError }}</p>
      <p v-else-if="!fields.length" class="text-sm text-lyktan-mute">Inga företagsuppgifter ännu.</p>

      <div v-else class="overflow-hidden rounded-2xl border border-black/8 bg-lyktan-paper">
        <div
          v-for="field in fields"
          :key="field.id"
          class="border-b border-black/6 px-4 py-3 last:border-0"
        >
          <div v-if="editingFieldId === field.id" class="grid gap-3 sm:grid-cols-2">
            <input v-model="editFieldDraft.label" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            <input v-model="editFieldDraft.value" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            <p v-if="fieldError" class="text-sm text-red-600 sm:col-span-2">{{ fieldError }}</p>
            <div class="flex items-center gap-3 sm:col-span-2">
              <button
                type="button"
                :disabled="fieldSaving"
                class="inline-flex min-h-8 items-center justify-center rounded-full bg-lyktan-ink px-4 text-[0.8rem] font-medium text-white transition hover:bg-black disabled:opacity-40"
                @click="saveField(field.id)"
              >
                {{ fieldSaving ? 'Sparar…' : 'Spara' }}
              </button>
              <button type="button" class="text-[0.8rem] text-lyktan-mute hover:text-lyktan-ink" @click="editingFieldId = null">Avbryt</button>
              <button type="button" class="ml-auto text-[0.8rem] text-red-600 hover:underline" @click="deleteField(field)">Ta bort</button>
            </div>
          </div>

          <div v-else class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-[0.72rem] font-medium text-lyktan-mute">{{ field.label }}</p>
              <p class="truncate text-sm font-medium text-lyktan-ink">{{ field.value }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="inline-flex min-h-8 items-center justify-center rounded-full border border-black/15 px-3 text-[0.78rem] font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
                @click="copy(field.value, field.id)"
              >
                {{ copiedId === field.id ? 'Kopierat!' : 'Kopiera' }}
              </button>
              <button
                v-if="canEditCompany"
                type="button"
                class="inline-flex min-h-8 items-center justify-center rounded-full border border-black/15 px-3 text-[0.78rem] font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
                @click="startEditField(field)"
              >
                Ändra
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-lyktan-ink">Viktiga länkar</h2>
        <button
          v-if="canEditCompany"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showAddLink = !showAddLink"
        >
          {{ showAddLink ? 'Avbryt' : '+ Ny länk' }}
        </button>
      </div>

      <form
        v-if="showAddLink"
        class="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
        @submit.prevent="submitAddLink"
      >
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Titel</span>
          <input v-model="newLink.title" required placeholder="T.ex. Bankgiro-inloggning" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Länk</span>
          <input v-model="newLink.url" required placeholder="https://…" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <p v-if="addLinkError" class="sm:col-span-2 text-sm text-red-600">{{ addLinkError }}</p>

        <div class="sm:col-span-2">
          <button
            type="submit"
            :disabled="addLinkSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ addLinkSaving ? 'Sparar…' : 'Spara länk' }}
          </button>
        </div>
      </form>

      <p v-if="linksLoading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="linksError" class="text-sm text-red-600">{{ linksError }}</p>
      <p v-else-if="!links.length" class="text-sm text-lyktan-mute">Inga länkar ännu.</p>

      <div v-else class="overflow-hidden rounded-2xl border border-black/8 bg-lyktan-paper">
        <div
          v-for="link in links"
          :key="link.id"
          class="border-b border-black/6 px-4 py-3 last:border-0"
        >
          <div v-if="editingLinkId === link.id" class="grid gap-3 sm:grid-cols-2">
            <input v-model="editLinkDraft.title" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            <input v-model="editLinkDraft.url" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            <p v-if="linkError" class="text-sm text-red-600 sm:col-span-2">{{ linkError }}</p>
            <div class="flex items-center gap-3 sm:col-span-2">
              <button
                type="button"
                :disabled="linkSaving"
                class="inline-flex min-h-8 items-center justify-center rounded-full bg-lyktan-ink px-4 text-[0.8rem] font-medium text-white transition hover:bg-black disabled:opacity-40"
                @click="saveLink(link.id)"
              >
                {{ linkSaving ? 'Sparar…' : 'Spara' }}
              </button>
              <button type="button" class="text-[0.8rem] text-lyktan-mute hover:text-lyktan-ink" @click="editingLinkId = null">Avbryt</button>
              <button type="button" class="ml-auto text-[0.8rem] text-red-600 hover:underline" @click="deleteLink(link)">Ta bort</button>
            </div>
          </div>

          <div v-else class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-lyktan-ink">{{ link.title }}</p>
              <a :href="link.url" target="_blank" rel="noopener" class="block truncate text-[0.8rem] text-lyktan-accent hover:underline">{{ link.url }}</a>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="inline-flex min-h-8 items-center justify-center rounded-full border border-black/15 px-3 text-[0.78rem] font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
                @click="copy(link.url, link.id)"
              >
                {{ copiedId === link.id ? 'Kopierat!' : 'Kopiera' }}
              </button>
              <button
                v-if="canEditCompany"
                type="button"
                class="inline-flex min-h-8 items-center justify-center rounded-full border border-black/15 px-3 text-[0.78rem] font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
                @click="startEditLink(link)"
              >
                Ändra
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
