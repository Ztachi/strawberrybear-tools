/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:26:43
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:26:44
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/GameManager.ts
 * @Description:
 */
/**
 * @fileOverview 游戏管理器（调度中心）
 * @description 负责系统注册、初始化顺序、渲染循环调度
 * @description WebGPU 优先，不支持时自动降级至 WebGL
 */
import { WebGPUEngine, Engine, Scene, Color4 } from '@babylonjs/core'
import type { ISystem } from './interfaces/ISystem'
import { KeyboardMouseInput } from './services/KeyboardMouseInput'
import { WebAudioService } from './services/DummyAudioService'
import { PlayerMoveSpaceService } from './services/PlayerMoveSpaceService'
import { Ship } from './entities/Ship'
import { InputSystem } from './systems/InputSystem'
import { MovementSystem } from './systems/MovementSystem'
import { RenderSystem } from './systems/RenderSystem'
import { AudioSystem } from './systems/AudioSystem'
import { useGameStore } from '../stores/game'

export class GameManager {
  private static _instance: GameManager | null = null

  /** @description: 获取单例实例 */
  static get instance(): GameManager {
    if (!GameManager._instance) {
      GameManager._instance = new GameManager()
    }
    return GameManager._instance
  }

  private _engine!: WebGPUEngine | Engine
  private _scene!: Scene
  private _systems: ISystem[] = []
  private _inputService!: KeyboardMouseInput
  private _initialized = false

  private constructor() {}

  /**
   * @description: 初始化引擎、场景和所有系统
   * @description 尝试 WebGPUEngine，失败则降级至 WebGL Engine
   * @param {HTMLCanvasElement} canvas - 游戏画布
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (this._initialized) return

    // WebGPU with WebGL fallback
    const supported = await WebGPUEngine.IsSupportedAsync
    if (supported) {
      try {
        const webGPUEngine = new WebGPUEngine(canvas)
        await webGPUEngine.initAsync()
        this._engine = webGPUEngine
        console.info('[GameManager] Renderer: WebGPU ✓')
      } catch {
        this._engine = new Engine(canvas, true)
        console.info('[GameManager] Renderer: WebGL (WebGPU init failed)')
      }
    } else {
      this._engine = new Engine(canvas, true)
      console.info('[GameManager] Renderer: WebGL (WebGPU not supported)')
    }

    // Scene setup
    this._scene = new Scene(this._engine)
    this._scene.clearColor = new Color4(0.008, 0.008, 0.04, 1) // Deep space

    // --- 依赖创建（仅 GameManager 持有具体类型）---

    // Services
    this._inputService = new KeyboardMouseInput()
    const audioService = new WebAudioService()
    const gameStore = useGameStore()

    // Entities（PlayerMoveSpaceService 是唯一知道 Ship 的地方之一）
    const ship = new Ship(this._scene)
    const spaceService = new PlayerMoveSpaceService(ship)

    // --- 系统注册（顺序：Input → Movement → Render → Audio）---
    this.registerSystem(new InputSystem(this._inputService, canvas))
    this.registerSystem(new MovementSystem(this._inputService, spaceService))
    this.registerSystem(new RenderSystem(this._scene, spaceService))
    this.registerSystem(new AudioSystem(audioService, () => gameStore.getAudioState()))

    // 初始化所有系统
    for (const system of this._systems) {
      system.init()
    }

    // 响应窗口缩放
    window.addEventListener('resize', this._onResize)

    this._initialized = true
  }

  /**
   * @description: 注册游戏系统
   * @param {ISystem} system - 需要注册的系统
   */
  registerSystem(system: ISystem): void {
    this._systems.push(system)
  }

  /**
   * @description: 启动渲染循环，统一驱动所有系统 update
   */
  start(): void {
    this._engine.runRenderLoop(() => {
      // getDeltaTime 返回毫秒，转换为秒传递给各系统
      const deltaTime = this._engine.getDeltaTime() / 1000
      for (const system of this._systems) {
        system.update(deltaTime)
      }
      this._scene.render()
    })
  }

  /**
   * @description: 销毁引擎和所有系统，释放资源
   */
  dispose(): void {
    window.removeEventListener('resize', this._onResize)
    this._engine.stopRenderLoop()

    // 调用所有系统的 dispose（从后往前，与注册顺序相反）
    for (let i = this._systems.length - 1; i >= 0; i--) {
      const system = this._systems[i]
      if ('dispose' in system && typeof system.dispose === 'function') {
        system.dispose()
      }
    }

    this._inputService?.dispose()
    this._scene.dispose()
    this._engine.dispose()
    this._systems = []
    this._initialized = false
    GameManager._instance = null
  }

  private readonly _onResize = () => this._engine.resize()
}
