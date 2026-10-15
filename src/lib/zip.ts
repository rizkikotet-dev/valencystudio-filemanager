import { Zip, ZipDeflate } from 'fflate'
import { Readable } from 'stream'
import { readPartBuffer } from '@/lib/storage'
import { parseParts } from '@/lib/download'

export const MAX_ZIP_FILES = 200
export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024 // 2GB total cap

export interface ZipItem {
  /** path inside the archive, e.g. "sub/dir/photo.jpg" */
  entryPath: string
  /** original file name (used for bytes lookup only) */
  name: string
  size: number
  /** raw parts JSON column */
  parts: string
}

function sanitizeSegment(segment: string): string {
  return (
    segment
      .split('/')
      .map(s => s.replace(/[\\:*?"<>|]+/g, '_').trim())
      .filter(Boolean)
      .join('/')
      .slice(0, 250) || 'file'
  )
}

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * Stream a ZIP archive (store mode, level 0 — parts are opaque blobs already,
 * compression would burn CPU for ~0% gain on encrypted Telegram blobs).
 * Entry names are de-duplicated automatically (foo.txt, "sub/foo.txt" kept distinct by path).
 */
export function buildZipResponse(items: ZipItem[], zipName: string): Response {
  const nodeStream = new Readable({ read() {} })
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', err => controller.error(err))
    },
    cancel() {
      nodeStream.destroy()
    },
  })

  ;(async () => {
    try {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          nodeStream.destroy(err instanceof Error ? err : new Error('zip failed'))
          return
        }
        if (chunk && chunk.length) nodeStream.push(Buffer.from(chunk))
        if (final) nodeStream.push(null)
      })

      const usedNames = new Map<string, number>()
      for (const item of items) {
        let base = sanitizeSegment(item.entryPath)
        const seen = usedNames.get(base) || 0
        usedNames.set(base, seen + 1)
        if (seen > 0) {
          const dot = base.lastIndexOf('.')
          const stem = dot > 0 ? base.slice(0, dot) : base
          const ext = dot > 0 ? base.slice(dot) : ''
          base = `${stem} (${seen + 1})${ext}`
        }

        const entry = new ZipDeflate(base, { level: 0 })
        zip.add(entry)
        const parts = parseParts(item.parts)
        for (const p of parts) {
          if (p.size <= 0) continue
          const buf = await readPartBuffer(p.ref)
          entry.push(new Uint8Array(buf))
        }
        entry.push(new Uint8Array(0), true)
      }
      zip.end()
    } catch (err) {
      nodeStream.destroy(err instanceof Error ? err : new Error('zip failed'))
    }
  })()

  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(zipName),
      'Cache-Control': 'no-store',
      'X-Archive-Count': String(items.length),
    },
  })
}
