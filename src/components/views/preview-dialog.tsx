'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes, formatDate, fileKind, isPreviewable } from '@/lib/format'
import { downloadFile } from '@/lib/client-api'
import { Download, FileWarning, Binary } from 'lucide-react'
import type { FileRow } from '@/components/views/files-view'

const TEXT_LIMIT = 512 * 1024 // 512 KB preview cap

/** Self-contained text/code preview — remounted per file via key */
function TextPreview({ file }: { file: FileRow }) {
  const [content, setContent] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`/api/files/${file.id}/download?inline=1`)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('Preview failed'))))
      .then(t => {
        if (!alive) return
        if (t.length > TEXT_LIMIT) {
          setContent(t.slice(0, TEXT_LIMIT))
          setTruncated(true)
        } else {
          setContent(t)
        }
      })
      .catch(() => {
        if (alive) setContent('Could not load preview.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [file.id])

  if (loading) {
    return (
      <div className="w-full p-6 space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${55 + ((i * 13) % 40)}%` }} />
        ))}
      </div>
    )
  }
  return (
    <div className="w-full h-full overflow-auto">
      <pre className="p-4 text-[12.5px] leading-relaxed font-mono text-foreground/90 whitespace-pre-wrap break-words min-h-60">
        {content ?? ''}
      </pre>
      {truncated && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border/60 bg-muted/80 backdrop-blur px-4 py-2 text-xs text-muted-foreground">
          <Binary className="size-3.5 shrink-0" /> Preview truncated at 512 KB — download to view the full file.
        </div>
      )}
    </div>
  )
}

export function PreviewDialog({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  if (!file) return null
  const kind = fileKind(file.mimeType, file.name)
  const previewable = isPreviewable(file.mimeType, file.name)
  const src = `/api/files/${file.id}/download?inline=1`
  const isText = kind === 'text' || kind === 'code'

  return (
    <Dialog open={!!file} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate pr-6 text-[15px]" title={file.name}>{file.name}</DialogTitle>
          <div className="text-[11px] font-mono tnum text-muted-foreground font-normal">
            {formatBytes(file.size)} · {file.mimeType} · {formatDate(file.createdAt)} ·{' '}
            {file.partCount === 1 ? 'MTProto Document' : `${file.partCount} parts on Telegram`}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border/60 bg-muted/30 grid place-items-center">
          {!previewable ? (
            <div className="p-10 text-center">
              <FileWarning className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground max-w-xs">
                No inline preview for this file type. Download it to open on your device.
              </p>
              <Button className="mt-4 gap-2" onClick={() => downloadFile(`/api/files/${file.id}/download`)}>
                <Download className="size-4" /> Download file
              </Button>
            </div>
          ) : isText ? (
            <TextPreview key={file.id} file={file} />
          ) : kind === 'image' ? (
            <img src={src} alt={file.name} className="max-h-[60vh] w-auto object-contain" />
          ) : kind === 'video' ? (
            <video src={src} controls className="max-h-[60vh] w-full" preload="metadata" />
          ) : kind === 'audio' ? (
            <div className="p-8 w-full max-w-md">
              <audio src={src} controls className="w-full" preload="metadata" />
            </div>
          ) : kind === 'pdf' ? (
            <iframe src={src} title={file.name} className="w-full h-[60vh]" />
          ) : (
            <iframe src={src} title={file.name} className="w-full h-[60vh] bg-white" />
          )}
        </div>

        {previewable && (
          <div className="shrink-0 pt-3 flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadFile(`/api/files/${file.id}/download`)}>
              <Download className="size-3.5" /> Download original
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
