/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:50
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:24:51
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/services/KeyboardMouseInput.ts
 * @Description:
 */
/**
 * @fileOverview 键鼠输入服务
 * @description 实现 IInputService，将键盘/鼠标设备事件映射为语义化 InputState
 * @description 后续扩展：实现 IInputService 即可接入 Gamepad/Touch，无需修改 MovementSystem
 */
import type { IInputService } from '../interfaces/IInputService'
import type { InputState } from '../interfaces/InputState'

export class KeyboardMouseInput implements IInputService {
  private readonly _pressedKeys = new Set<string>()
  private _lookDeltaAccum = { x: 0, y: 0 }
  private _isLocked = false
  private _canvas: HTMLCanvasElement | null = null

  // Bound handlers stored as class properties for removeEventListener
  private readonly _onKeyDown = (e: KeyboardEvent) => this._pressedKeys.add(e.code)
  private readonly _onKeyUp = (e: KeyboardEvent) => this._pressedKeys.delete(e.code)
  private readonly _onCanvasClick = () => {
    this._canvas?.requestPointerLock()
  }
  private readonly _onPointerLockChange = () => {
    this._isLocked = document.pointerLockElement === this._canvas
  }
  private readonly _onMouseMove = (e: MouseEvent) => {
    if (!this._isLocked) return
    this._lookDeltaAccum.x += e.movementX
    this._lookDeltaAccum.y += e.movementY
  }

  /** @description: 绑定到 Canvas 和 DOM 事件 */
  attach(canvas: HTMLCanvasElement): void {
    this._canvas = canvas
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    canvas.addEventListener('click', this._onCanvasClick)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    document.addEventListener('mousemove', this._onMouseMove)
  }

  /**
   * @description: 读取当前帧语义化输入状态，调用后重置 lookDelta
   * @return {InputState} 语义化输入状态
   */
  getState(): InputState {
    const state: InputState = {
      moveForward: 0,
      moveRight: 0,
      moveUp: 0,
      lookDelta: { ...this._lookDeltaAccum },
      boost: this._pressedKeys.has('ShiftLeft') || this._pressedKeys.has('ShiftRight'),
    }

    if (this._pressedKeys.has('KeyW') || this._pressedKeys.has('ArrowUp')) state.moveForward = 1
    if (this._pressedKeys.has('KeyS') || this._pressedKeys.has('ArrowDown')) state.moveForward = -1
    if (this._pressedKeys.has('KeyA') || this._pressedKeys.has('ArrowLeft')) state.moveRight = -1
    if (this._pressedKeys.has('KeyD') || this._pressedKeys.has('ArrowRight')) state.moveRight = 1
    if (this._pressedKeys.has('KeyQ')) state.moveUp = 1
    if (this._pressedKeys.has('KeyE')) state.moveUp = -1

    // Reset look delta after reading — prevents accumulated drift
    this._lookDeltaAccum = { x: 0, y: 0 }
    return state
  }

  /** @description: 解绑所有事件监听器 */
  dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onCanvasClick)
    }
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    document.removeEventListener('mousemove', this._onMouseMove)
    this._pressedKeys.clear()
  }
}
