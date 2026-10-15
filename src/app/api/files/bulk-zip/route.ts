import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { jsonError, readJson } from '@/lib/api-helpers'
import { buildZipResponse, MAX_ZIP_BYTES, MAX_ZIP_FILES, type ZipItem } from '@/lib/zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/files/bulk-zip  { ids: string[] }
 * Streams a ZIP archive of the selected files.
 */
export async function POST(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return jsonError('Unauthorized', 401)

  const body = await readJson<{ ids?: string[] }>(req)
  const ids = Array.isArray(body.ids) ? body.ids.filter(i => typeof i === 'string').slice(0, MAX_ZIP_FILES) : []
  if (ids.length === 0) return jsonError('Select at least one file.', 400)

  const files = await db.file.findMany({
    where: { id: { in: ids }, ownerId: session.id, status: 'READY', deletedAt: null },
    select: { id: true, name: true, size: true, parts: true },
  })
  if (files.length === 0) return jsonError('No downloadable files found in your selection.', 404)

  const totalBytes = files.reduce((a, f) => a + f.size, 0)
  if (totalBytes > MAX_ZIP_BYTES) {
    return jsonError(`Selection too large (${(totalBytes / 1024 ** 3).toFixed(2)} GB). Limit is 2 GB per ZIP.`, 413)
  }

  const items: ZipItem[] = files.map(f => ({ entryPath: f.name, name: f.name, size: f.size, parts: f.parts }))
  const stamp = new Date().toISOString().slice(0, 10)
  return buildZipResponse(items, `valencystudio-${files.length}-files-${stamp}.zip`)
}
