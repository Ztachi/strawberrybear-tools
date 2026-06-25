/**
 * @fileOverview 自定义素材仓储测试
 * @description 使用 fake-indexeddb 验证自定义头像保存、查重和读取流程。
 * @author strawberrybear
 * @date 2026-06-20
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stylistOfficeDb } from '@/db/database'
import {
  createCustomAvatarAsset,
  createCustomImageAsset,
  deleteCustomAsset,
  getCustomAsset,
  listCustomAssets,
  updateCustomAvatarAsset,
  updateCustomImageAsset,
} from './customAssetRepository'

describe('custom asset repository', () => {
  beforeEach(async () => {
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1024,
      height: 1024,
      close: vi.fn(),
    }))
    await stylistOfficeDb.delete()
    await stylistOfficeDb.open()
  })

  afterEach(async () => {
    await stylistOfficeDb.delete()
    vi.unstubAllGlobals()
  })

  it('saves original and cropped avatar blobs', async () => {
    const originalBlob = new Blob(['original-avatar'], { type: 'image/png' })
    const croppedBlob = new Blob(['cropped-avatar'], { type: 'image/png' })
    const asset = await createCustomAvatarAsset({
      name: 'My Avatar',
      fallbackName: 'Custom Avatar',
      originalBlob,
      croppedBlob,
      cropSelection: { x: 12, y: 24, width: 320, height: 320 },
      cropTransform: [1.2, 0, 0, 1.2, -36, -48],
    })
    const assets = await listCustomAssets('avatar')

    expect(asset.name).toBe('My Avatar')
    expect(asset.originalBlob).toBe(originalBlob)
    expect(asset.blob).toBe(croppedBlob)
    expect(asset.cropSelection).toEqual({ x: 12, y: 24, width: 320, height: 320 })
    expect(asset.cropTransform).toEqual([1.2, 0, 0, 1.2, -36, -48])
    expect(asset.updatedAt).toBe(asset.createdAt)
    expect(assets).toHaveLength(1)
    expect(assets[0].id).toBe(asset.id)
  })

  it('reuses duplicated cropped avatar blobs', async () => {
    const originalBlob = new Blob(['original-avatar'], { type: 'image/png' })
    const croppedBlob = new Blob(['same-cropped-avatar'], { type: 'image/png' })
    const firstAsset = await createCustomAvatarAsset({
      name: 'First Avatar',
      fallbackName: 'Custom Avatar',
      originalBlob,
      croppedBlob,
    })
    const secondAsset = await createCustomAvatarAsset({
      name: 'Second Avatar',
      fallbackName: 'Custom Avatar',
      originalBlob,
      croppedBlob,
    })
    const assets = await listCustomAssets('avatar')

    expect(secondAsset.id).toBe(firstAsset.id)
    expect(assets).toHaveLength(1)
  })

  it('updates avatar name and cropped blob', async () => {
    const originalBlob = new Blob(['original-avatar'], { type: 'image/png' })
    const croppedBlob = new Blob(['cropped-avatar'], { type: 'image/png' })
    const asset = await createCustomAvatarAsset({
      name: 'Before',
      fallbackName: 'Custom Avatar',
      originalBlob,
      croppedBlob,
    })
    const nextOriginalBlob = new Blob(['next-original-avatar'], { type: 'image/png' })
    const nextCroppedBlob = new Blob(['next-cropped-avatar'], { type: 'image/png' })
    const updatedAsset = await updateCustomAvatarAsset({
      id: asset.id,
      name: 'After',
      fallbackName: 'Custom Avatar',
      originalBlob: nextOriginalBlob,
      croppedBlob: nextCroppedBlob,
      cropSelection: { x: 20, y: 30, width: 280, height: 280 },
      cropTransform: [1.45, 0, 0, 1.45, -72, -96],
    })

    expect(updatedAsset.name).toBe('After')
    expect(updatedAsset.blob).toBe(nextCroppedBlob)
    expect(updatedAsset.originalBlob).toBe(nextOriginalBlob)
    expect(updatedAsset.cropSelection).toEqual({ x: 20, y: 30, width: 280, height: 280 })
    expect(updatedAsset.cropTransform).toEqual([1.45, 0, 0, 1.45, -72, -96])
    expect(updatedAsset.updatedAt).not.toBeUndefined()
  })

  it('saves and updates custom signature blobs separately from avatars', async () => {
    const originalBlob = new Blob(['original-signature'], { type: 'image/png' })
    const croppedBlob = new Blob(['cropped-signature'], { type: 'image/png' })
    const asset = await createCustomImageAsset({
      kind: 'signature',
      name: 'My Signature',
      fallbackName: 'Custom Signature',
      originalBlob,
      croppedBlob,
      cropSelection: { x: 10, y: 12, width: 300, height: 100 },
      cropTransform: [1, 0, 0, 1, -10, -12],
    })
    const updatedBlob = new Blob(['updated-signature'], { type: 'image/png' })
    const updatedAsset = await updateCustomImageAsset({
      id: asset.id,
      kind: 'signature',
      name: 'Updated Signature',
      fallbackName: 'Custom Signature',
      originalBlob,
      croppedBlob: updatedBlob,
    })
    const signatures = await listCustomAssets('signature')
    const avatars = await listCustomAssets('avatar')

    expect(asset.id).toContain('custom-signature-')
    expect(updatedAsset.name).toBe('Updated Signature')
    expect(updatedAsset.blob).toBe(updatedBlob)
    expect(signatures).toHaveLength(1)
    expect(avatars).toHaveLength(0)
  })

  it('deletes custom assets', async () => {
    const asset = await createCustomAvatarAsset({
      name: 'Delete Me',
      fallbackName: 'Custom Avatar',
      originalBlob: new Blob(['original-avatar'], { type: 'image/png' }),
      croppedBlob: new Blob(['cropped-avatar'], { type: 'image/png' }),
    })

    await deleteCustomAsset(asset.id)

    expect(await getCustomAsset(asset.id)).toBeUndefined()
  })
})
