import { db } from '@/lib/db'
import { getSessionUser, logActivity } from '@/lib/auth'
import { jsonError } from '@/lib/api-helpers'
import { ownedFolder, descendantFolderIds } from '@/lib/folders'
import { buildZipResponse, MAX_ZIP_BYTES, MAX_ZIP_FILES, type ZipItem } from '@/lib/zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/folders/[id]/zip
 * Streams a ZIP of every READY, non-trashed file inside this folder and all
 * subfolders. Entry paths mirror the folder structure (e.g. "Photos/2024/a.jpg").
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return jsonError('Unauthorized', 401)
  const { id } = await params

  const folder = await ownedFolder(id, session.id)
  if (!folder) return jsonError('Folder not found.', 404)

  const folderIds = [folder.id, ...(await descendantFolderIds(folder.id, session.id))]
  const folders = await db.folder.findMany({
    where: { id: { in: folderIds }, ownerId: session.id },
    select: { id: true, name: true, parentId: true },
  })
  // relative path of each folder inside the archive (the root folder maps to '')
  const relOf = new Map<string, string>()
  const relFor = (fid: string, guard = 0): string => {
    if (relOf.has(fid)) return relOf.get(fid)!
    const f = folders.find(x => x.id === fid)
    if (!f || f.id === folder.id || !f.parentId || guard > 200) {
      relOf.set(fid, '')
      return ''
    }
    const parentRel = relFor(f.parentId, guard + 1)
    const rel = parentRel ? `${parentRel}/${f.name}` : f.name
    relOf.set(fid, rel)
    return rel
  }
  folders.forEach(f => relFor(f.id))

  const files = await db.file.findMany({
    where: { folderId: { in: folderIds }, ownerId: session.id, status: 'READY', deletedAt: null },
    select: { id: true, name: true, size: true, parts: true, folderId: true },
    orderBy: { name: 'asc' },
  })
  if (files.length === 0) return jsonError('This folder has no downloadable files yet.', 404)

  if (files.length > MAX_ZIP_FILES) {
    return jsonError(
      `Folder contains ${files.length} files — ZIP is limited to ${MAX_ZIP_FILES}. Download in smaller batches.`,
      413
    )
  }
  const totalBytes = files.reduce((a, f) => a + f.size, 0)
  if (totalBytes > MAX_ZIP_BYTES) {
    return jsonError(`Folder too large (${(totalBytes / 1024 ** 3).toFixed(2)} GB). Limit is 2 GB per ZIP.`, 413)
  }

  const items: ZipItem[] = files.map(f => {
    const dir = f.folderId ? relOf.get(f.folderId) || '' : ''
    return { entryPath: dir ? `${dir}/${f.name}` : f.name, name: f.name, size: f.size, parts: f.parts }
  })

  await logActivity(session.id, 'FILE_DOWNLOAD', `Downloaded folder "${folder.name}" as ZIP (${files.length} file(s))`)

  const safeName = folder.name.replace(/[^\x20-\x7E]/g, '_').replace(/[/\\]/g, '-') || 'folder'
  return buildZipResponse(items, `${safeName}.zip`)
}
