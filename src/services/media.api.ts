// Media upload API layer: two-step direct-to-R2 image upload.
// 1) `presignUpload` asks the backend for a short-lived R2 presigned PUT (`uploadUrl`) plus the
//    object's final public URL. 2) The browser PUTs the raw bytes straight to `uploadUrl` — via the
//    native `fetch`, NOT the app's Axios instance, so it doesn't inherit the API baseURL/Bearer auth.
// The presigned URL only accepts the content-type it was signed for (image/png|jpeg|webp|gif).
import { http } from '@/lib/http'

export interface PresignResult {
  uploadUrl: string
  publicUrl: string
}

export async function presignUpload(
  filename: string,
  contentType: string,
): Promise<PresignResult> {
  return (await http.post<PresignResult>('/media/presign', { filename, contentType })).data
}

// Presigns, then uploads the file directly to R2 and resolves its final public URL. Throws on any
// failure (presign error, non-2xx PUT, network error — the cross-origin PUT needs R2 bucket CORS).
export async function uploadImageToR2(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await presignUpload(file.name, file.type)
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!res.ok) {
    throw new Error(`R2 upload failed with status ${res.status}`)
  }
  return publicUrl
}
