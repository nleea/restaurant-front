import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    post: (...a: unknown[]) => post(...a),
  },
}))

import * as api from '../media.api'

const fetchMock = vi.fn<(...a: unknown[]) => unknown>()

beforeEach(() => {
  post.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('media api layer', () => {
  it('presigns an upload against /media/presign with the filename + content type', async () => {
    post.mockResolvedValue({
      data: { uploadUrl: 'https://r2.example/put?sig=abc', publicUrl: 'https://cdn.example/logo.png' },
    })
    const result = await api.presignUpload('logo.png', 'image/png')
    expect(post).toHaveBeenCalledWith('/media/presign', {
      filename: 'logo.png',
      contentType: 'image/png',
    })
    expect(result.uploadUrl).toBe('https://r2.example/put?sig=abc')
    expect(result.publicUrl).toBe('https://cdn.example/logo.png')
  })

  it('presigns then PUTs the file directly to R2 and returns the public URL', async () => {
    post.mockResolvedValue({
      data: { uploadUrl: 'https://r2.example/put?sig=abc', publicUrl: 'https://cdn.example/logo.png' },
    })
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })

    const publicUrl = await api.uploadImageToR2(file)

    expect(post).toHaveBeenCalledWith('/media/presign', {
      filename: 'logo.png',
      contentType: 'image/png',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/put?sig=abc', {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'image/png' },
    })
    expect(publicUrl).toBe('https://cdn.example/logo.png')
  })

  it('throws when the R2 PUT responds with a non-2xx status', async () => {
    post.mockResolvedValue({
      data: { uploadUrl: 'https://r2.example/put?sig=abc', publicUrl: 'https://cdn.example/logo.png' },
    })
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })

    await expect(api.uploadImageToR2(file)).rejects.toThrow(/403/)
  })
})
