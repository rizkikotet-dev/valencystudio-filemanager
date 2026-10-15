'use client'

import { create } from 'zustand'
import { toast } from 'sonner'

export type UploadStatus = 'queued' | 'initializing' | 'uploading' | 'finalizing' | 'done' | 'error' | 'canceled'

export interface UploadItem {
  key: string
  name: string
  size: number
  mimeType: string
  folderId?: string | null
  status: UploadStatus
  progress: number // 0..1
  speed: number // bytes/s
  uploadedParts: number
  totalParts: number
  error?: string
  fileId?: string
}

interface UploadState {
  items: UploadItem[]
  addFiles: (files: File[], folderId?: string | null) => void
  cancel: (key: string) => void
  retry: (key: string) => void
  clearFinished: () => void
  removeItem: (key: string) => void
}

// internal (non-reactive) machinery
const controllers = new Map<string, AbortController>()
const partProgress = new Map<string, Map<number, number>>() // key -> (partIndex -> 0..1)
let activeCount = 0
const queue: string[] = []
let files: Map<string, File> = new Map()
let folderTargets: Map<string, string | null> = new Map()
let onFinished: ((item: UploadItem) => void) | null = null
let onFinishError: ((item: UploadItem) => void) | null = null

const MAX_FILE_CONCURRENCY = 2
const MAX_PART_CONCURRENCY = 3
const readStore = () => useUploadStore.getState()

function update(key: string, patch: Partial<UploadItem>) {
  useUploadStore.setState(state => ({
    items: state.items.map(it => (it.key === key ? { ...it, ...patch } : it)),
  }))
}

function recalcProgress(key: string) {
  const parts = partProgress.get(key)
  const item = readStore().items.find(i => i.key === key)
  if (!item || !parts) return
  let sum = 0
  let completed = 0
  parts.forEach(v => {
    sum += v
    if (v >= 1) completed++
  })
  update(key, {
    progress: item.totalParts === 0 ? 1 : Math.min(0.999, sum / item.totalParts),
    uploadedParts: completed,
  })
}

function setPartProgress(key: string, index: number, value: number) {
  const parts = partProgress.get(key) || new Map<number, number>()
  parts.set(index, Math.min(1, Math.max(0, value)))
  partProgress.set(key, parts)
  recalcProgress(key)
}

function pump() {
  while (activeCount < MAX_FILE_CONCURRENCY && queue.length > 0) {
    const key = queue.shift()
    if (!key) break
    const item = readStore().items.find(i => i.key === key)
    if (!item || item.status !== 'queued') continue
    activeCount++
    processFile(key).finally(() => {
      activeCount--
      pump()
    })
  }
}

function xhrUploadPart(key: string, fileId: string, blob: Blob, index: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = `/api/files/${fileId}/part?index=${index}`
    xhr.open('POST', url)
    xhr.responseType = 'json'
    let lastLoaded = 0
    let lastTs = Date.now()
    let speedEma = 0

    xhr.upload.onprogress = e => {
      const now = Date.now()
      const dt = (now - lastTs) / 1000
      if (dt > 0.2) {
        const inst = (e.loaded - lastLoaded) / dt
        speedEma = speedEma === 0 ? inst : speedEma * 0.7 + inst * 0.3
        lastLoaded = e.loaded
        lastTs = now
        update(key, { speed: speedEma })
      }
      setPartProgress(key, index, e.total > 0 ? e.loaded / e.total : 0)
    }

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      xhr.abort()
    }
    signal.addEventListener('abort', onAbort)

    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        setPartProgress(key, index, 1)
        resolve()
      } else {
        let msg = `Part ${index + 1} failed (HTTP ${xhr.status})`
        try {
          const body = xhr.response || JSON.parse(xhr.responseText)
          if (body?.error) msg = body.error
        } catch {}
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => {
      cleanup()
      reject(new Error('Network error during upload'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(blob)
  })
}

function xhrUploadStream(
  key: string,
  file: File,
  folderId: string | null,
  signal: AbortSignal
): Promise<{ id: string; name: string; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/files/upload-stream')
    xhr.responseType = 'json'
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.setRequestHeader('X-File-Size', String(file.size))
    if (folderId) xhr.setRequestHeader('X-Folder-Id', folderId)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    let lastLoaded = 0
    let lastTs = Date.now()
    let speedEma = 0

    xhr.upload.onprogress = e => {
      const now = Date.now()
      const dt = (now - lastTs) / 1000
      if (dt > 0.2) {
        const inst = (e.loaded - lastLoaded) / dt
        speedEma = speedEma === 0 ? inst : speedEma * 0.7 + inst * 0.3
        lastLoaded = e.loaded
        lastTs = now
        update(key, { speed: speedEma })
      }
      const progress = e.total > 0 ? Math.min(0.999, e.loaded / e.total) : 0
      update(key, { progress, uploadedParts: 1, totalParts: 1 })
    }

    const onAbort = () => {
      xhr.abort()
    }
    signal.addEventListener('abort', onAbort)

    xhr.onload = () => {
      signal.removeEventListener('abort', onAbort)
      if (xhr.status >= 200 && xhr.status < 300) {
        const res = xhr.response?.file || xhr.response
        update(key, { progress: 1 })
        resolve(res)
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`
        try {
          const body = xhr.response || (xhr.responseText ? JSON.parse(xhr.responseText) : null)
          if (body?.error) msg = body.error
        } catch {}
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('Network error during upload'))
    }
    xhr.onabort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(file)
  })
}

async function processFile(key: string) {
  const file = files.get(key)
  const item = readStore().items.find(i => i.key === key)
  if (!file || !item) return
  const controller = new AbortController()
  controllers.set(key, controller)
  partProgress.set(key, new Map())

  try {
    const folderId = folderTargets.get(key) ?? null

    // Try direct Telethon streaming upload first if this is not a resume
    if (!item.fileId) {
      update(key, { status: 'uploading', totalParts: 1, uploadedParts: 0, progress: 0 })
      try {
        const streamRes = await xhrUploadStream(key, file, folderId, controller.signal)
        update(key, { status: 'done', progress: 1, speed: 0, fileId: streamRes.id })
        onFinished?.(readStore().items.find(i => i.key === key)!)
        return
      } catch (streamErr: any) {
        if (streamErr?.name === 'AbortError') throw streamErr
        const msg = streamErr?.message || ''
        if (msg.includes('413') || msg.includes('quota') || msg.includes('exceeds') || msg.includes('Quota')) {
          throw streamErr
        }
        console.warn('[uploader] Telethon streaming upload failed, trying chunked upload:', msg)
      }
    }

    update(key, { status: 'initializing' })
    // resume reuse: retry() keeps item.fileId — reuse the same PENDING row
    // so already-uploaded parts are kept instead of orphaned by a fresh init
    let fileId = item.fileId
    let partSize = 16 * 1024 * 1024
    if (fileId) {
      try {
        const check = await fetch(`/api/files/${fileId}/part`, { signal: controller.signal }).then(r => (r.ok ? r.json() : null))
        if (!check || check.status === undefined) {
          fileId = undefined // row gone (swept/deleted) — fall through to fresh init
        }
      } catch {
        fileId = undefined
      }
    }
    if (!fileId) {
      const init = await fetch('/api/files/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream', folderId }),
        signal: controller.signal,
      }).then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error || `Init failed (${r.status})`)
        return body as { id: string; partSize: number; duplicate?: boolean }
      })

      if (init.duplicate) {
        toast.warning(`"${file.name}" already exists in this folder`, {
          description: 'Uploading a duplicate copy anyway — cancel from the upload panel if this was unintentional.',
          duration: 7000,
        })
      }

      partSize = init.partSize || 16 * 1024 * 1024
      fileId = init.id
      update(key, { fileId })
    }
    const activeId = fileId as string
    const totalParts = file.size === 0 ? 0 : Math.ceil(file.size / partSize)
    update(key, { fileId: activeId, totalParts, status: 'uploading' })
    for (let i = 0; i < totalParts; i++) setPartProgress(key, i, 0)

    // resume support
    let done = new Set<number>()
    if (totalParts > 0) {
      try {
        const resume = await fetch(`/api/files/${activeId}/part`, { signal: controller.signal }).then(r => (r.ok ? r.json() : null))
        if (resume?.done) done = new Set<number>(resume.done)
        done.forEach(i => setPartProgress(key, i, 1))
      } catch {}
    }

    const pending: number[] = []
    for (let i = 0; i < totalParts; i++) if (!done.has(i)) pending.push(i)

    let cursor = 0
    let lastErr: Error | null = null
    const workers = Array.from({ length: Math.min(MAX_PART_CONCURRENCY, pending.length) }, async () => {
      while (cursor < pending.length && !controller.signal.aborted) {
        const index = pending[cursor++]
        const start = index * partSize
        const blob = file.slice(start, Math.min(start + partSize, file.size))
        try {
          await xhrUploadPart(key, activeId, blob, index, controller.signal)
        } catch (err: any) {
          if (err?.name === 'AbortError') return
          lastErr = err
          return
        }
      }
    })
    await Promise.all(workers)
    if (lastErr) throw lastErr
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

    update(key, { status: 'finalizing', progress: 1 })
    const completeRes = await fetch(`/api/files/${activeId}/complete`, {
      method: 'POST',
      signal: controller.signal,
    }).then(async r => {
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Finalize failed')
      return body
    })

    update(key, { status: 'done', progress: 1, speed: 0 })
    onFinished?.(readStore().items.find(i => i.key === key)!)
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      update(key, { status: 'canceled', speed: 0 })
      // cleanup server-side record
      const fileId = readStore().items.find(i => i.key === key)?.fileId
      if (fileId) fetch(`/api/files/${fileId}`, { method: 'DELETE' }).catch(() => {})
      onFinishError?.(readStore().items.find(i => i.key === key)!)
    } else {
      update(key, { status: 'error', error: err?.message || 'Upload failed', speed: 0 })
      onFinishError?.(readStore().items.find(i => i.key === key)!)
    }
  } finally {
    controllers.delete(key)
    partProgress.delete(key)
    const finalStatus = readStore().items.find(i => i.key === key)?.status
    if (finalStatus === 'done' || finalStatus === 'canceled') {
      files.delete(key)
      folderTargets.delete(key)
    }
  }
}

export const useUploadStore = create<UploadState>((set, get) => ({
  items: [],
  addFiles: (newFiles, folderId = null) => {
    const items = newFiles.map(f => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: f.name,
      size: f.size,
      mimeType: f.type || 'application/octet-stream',
      folderId,
      status: 'queued' as UploadStatus,
      progress: 0,
      speed: 0,
      uploadedParts: 0,
      totalParts: f.size === 0 ? 0 : Math.ceil(f.size / (16 * 1024 * 1024)),
    }))
    newFiles.forEach((f, idx) => {
      files.set(items[idx].key, f)
      folderTargets.set(items[idx].key, folderId)
      queue.push(items[idx].key)
    })
    set(state => ({ items: [...items, ...state.items] }))
    pump()
  },
  cancel: key => {
    controllers.get(key)?.abort()
  },
  retry: key => {
    const item = get().items.find(i => i.key === key)
    if (!item || !files.has(key)) return
    update(key, { status: 'queued', error: undefined, progress: 0, speed: 0, uploadedParts: 0 })
    queue.push(key)
    pump()
  },
  clearFinished: () => {
    set(state => ({ items: state.items.filter(i => !['done', 'canceled'].includes(i.status)) }))
  },
  removeItem: key => {
    set(state => ({ items: state.items.filter(i => i.key !== key) }))
  },
}))

export function setUploadCallbacks(cb: { onFinished?: (i: UploadItem) => void; onFinishError?: (i: UploadItem) => void }) {
  onFinished = cb.onFinished || null
  onFinishError = cb.onFinishError || null
}
