export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = any>(
  path: string,
  opts?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method || 'GET',
    headers: opts?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts?.signal,
    cache: 'no-store',
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {}
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export function downloadFile(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** POST-based download (streams a blob, then triggers a save dialog) */
export async function downloadPost(url: string, body: unknown, fallbackName = 'download.zip') {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    let message = `Download failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {}
    throw new ApiError(message, res.status)
  }
  const blob = await res.blob()
  const dispo = res.headers.get('Content-Disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(dispo) || /filename="([^"]+)"/i.exec(dispo)
  const name = m ? decodeURIComponent(m[1]) : fallbackName
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
}
