/** Read an image file into a data URI for storage and API content parts. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

/** Convert a data URI back to a Blob (for multipart uploads like /v1/images/edits). */
export function dataUriToBlob(dataUri: string): Blob {
  const [meta, b64] = dataUri.split(',')
  const mime = meta.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** Image files from a paste/drop event, if any. */
export function imageFiles(items: DataTransferItemList | null): File[] {
  if (!items) return []
  const files: File[] = []
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  return files
}
