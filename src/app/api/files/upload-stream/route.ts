import { db } from '@/lib/db'
import { getSessionUser, logActivity, getClientIp } from '@/lib/auth'
import { jsonError } from '@/lib/api-helpers'
import { getUsedBytes, publicFile } from '@/lib/files'
import { ownedFolder } from '@/lib/folders'
import { emitChanged, ROOM } from '@/lib/realtime-emit'
import { uploadToTelethon } from '@/lib/telethon'
import { getSettings } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 2_000_000_000

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return jsonError('Unauthorized', 401)

  const rawName = req.headers.get('x-file-name')
  const rawSize = req.headers.get('x-file-size')
  const folderIdHeader = req.headers.get('x-folder-id')
  const mimeType = req.headers.get('content-type') || 'application/octet-stream'

  if (!rawName || !rawSize) {
    return jsonError('Missing x-file-name or x-file-size header.', 400)
  }

  const name = decodeURIComponent(rawName).trim().slice(0, 255)
  const size = parseInt(rawSize)

  if (isNaN(size) || size <= 0 || size > MAX_BYTES) {
    return jsonError(`File size must be between 1 and ${MAX_BYTES} bytes.`, 413)
  }

  const settings = await getSettings()
  if (size > settings.maxFileSize) {
    return jsonError(`File exceeds maximum allowed size of ${settings.maxFileSize} bytes.`, 413)
  }

  let folderId: string | null = null
  if (folderIdHeader) {
    const f = await ownedFolder(folderIdHeader, user.id)
    if (!f) return jsonError('Target folder not found.', 404)
    folderId = f.id
  }

  if (user.quota !== -1) {
    const used = await getUsedBytes(user.id)
    if (used + size > user.quota) {
      return jsonError('Storage quota exceeded. Delete files or contact an admin.', 413)
    }
  }

  if (!req.body) {
    return jsonError('Missing request body stream.', 400)
  }

  // Create PENDING file record
  const file = await db.file.create({
    data: {
      ownerId: user.id,
      name,
      size,
      mimeType,
      status: 'PENDING',
      folderId,
    },
  })

  emitChanged(['files'], { rooms: [ROOM.user(user.id)] })

  try {
    const { messageId, checksum, size: uploadedBytes } = await uploadToTelethon(
      req.body,
      name,
      size,
      mimeType
    )

    const parts = JSON.stringify([{ ref: `telethon:${messageId}`, size: uploadedBytes }])

    const updated = await db.file.update({
      where: { id: file.id },
      data: {
        status: 'READY',
        size: uploadedBytes,
        parts,
      },
    })

    await logActivity(
      user.id,
      'FILE_UPLOAD',
      `Uploaded "${name}" (${uploadedBytes} bytes via Telethon MTProto, SHA256: ${checksum})`,
      getClientIp(req)
    )
    emitChanged(['files', 'activity'], { rooms: [ROOM.user(user.id), ROOM.admins] })

    return Response.json({ ok: true, file: publicFile(updated) })
  } catch (err: any) {
    await db.file.update({
      where: { id: file.id },
      data: { status: 'FAILED' },
    }).catch(() => {})
    return jsonError(err.message || 'Streaming upload failed', 500)
  }
}
