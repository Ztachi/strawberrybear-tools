import { expect, it, vi } from 'vitest'
import { createAppCloseController, type CloseChoice } from './controller'

function fixture() {
  const preferences = { action: 'tray' as 'tray' | 'quit', confirmed: false }
  const ports = {
    preferences: () => preferences,
    choose: vi.fn(async (): Promise<CloseChoice | null> => ({ action: 'tray', remember: true })),
    remember: vi.fn(async (action: 'tray' | 'quit', confirmed: boolean) => {
      Object.assign(preferences, { action, confirmed })
    }),
    prepareQuit: vi.fn(async () => true),
    hide: vi.fn(async () => {}),
    quit: vi.fn(async () => {}),
  }
  return { ports, controller: createAppCloseController(ports) }
}
it('asks on first close, remembers tray choice and hides without discarding editing state', async () => {
  const { ports, controller } = fixture()
  await controller.request()
  await controller.request()
  expect(ports.choose).toHaveBeenCalledTimes(1)
  expect(ports.remember).toHaveBeenCalledWith('tray', true)
  expect(ports.hide).toHaveBeenCalledTimes(2)
  expect(ports.prepareQuit).not.toHaveBeenCalled()
})
it('allows cancellation and asks again when remembering is disabled', async () => {
  const { ports, controller } = fixture()
  ports.choose.mockResolvedValueOnce(null).mockResolvedValue({ action: 'tray', remember: false })
  await controller.request()
  expect(ports.hide).not.toHaveBeenCalled()
  await controller.request()
  await controller.request()
  expect(ports.choose).toHaveBeenCalledTimes(3)
})
it('explicit quit bypasses close preference, but an editor veto prevents exiting', async () => {
  const { ports, controller } = fixture()
  ports.prepareQuit.mockResolvedValueOnce(false)
  await controller.request('quit')
  expect(ports.choose).not.toHaveBeenCalled()
  expect(ports.quit).not.toHaveBeenCalled()
  await controller.request('quit')
  expect(ports.quit).toHaveBeenCalledTimes(1)
})
it('a failed preference save prevents closing, and repeated close requests share one operation', async () => {
  const { ports, controller } = fixture()
  ports.remember.mockRejectedValueOnce(new Error('disk'))
  await expect(controller.request()).rejects.toThrow('disk')
  expect(ports.hide).not.toHaveBeenCalled()
  let resolve!: () => void
  ports.hide.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      })
  )
  const first = controller.request()
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
  const second = controller.request()
  resolve()
  await Promise.all([first, second])
  expect(ports.hide).toHaveBeenCalledTimes(1)
})
