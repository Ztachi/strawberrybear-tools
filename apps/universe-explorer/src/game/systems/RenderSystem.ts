/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:26:11
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:26:12
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/systems/RenderSystem.ts
 * @Description:
 */
/**
 * @fileOverview 渲染系统
 * @description 管理 Babylon.js 相机、后处理管线和星空粒子
 * @description 通过 ISpaceService.getPlayerTransform() 获取玩家位置，不直接持有 Ship 引用
 */
import {
  UniversalCamera,
  DefaultRenderingPipeline,
  ParticleSystem,
  HemisphericLight,
  DirectionalLight,
  RawTexture,
  Vector3,
  Color3,
  Color4,
} from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { ISystem } from '../interfaces/ISystem'
import type { ISpaceService } from '../interfaces/ISpaceService'

export class RenderSystem implements ISystem {
  private _camera!: UniversalCamera
  private _pipeline!: DefaultRenderingPipeline

  /**
   * @param {Scene} _scene - Babylon.js 场景
   * @param {ISpaceService} _spaceService - 空间服务，用于获取玩家变换
   */
  constructor(
    private readonly _scene: Scene,
    private readonly _spaceService: ISpaceService
  ) {}

  /** @description: 初始化相机、后处理管线、灯光和星空 */
  init(): void {
    this._setupLights()
    this._setupCamera()
    this._setupPostProcessing()
    this._setupStarField()
  }

  /**
   * @description: 每帧更新相机位置，跟随玩家
   * @description 通过 ISpaceService.getPlayerTransform() 获取位置，不直接引用 Ship
   */
  update(_deltaTime: number): void {
    const transform = this._spaceService.getPlayerTransform()
    const playerPos = new Vector3(transform.position.x, transform.position.y, transform.position.z)
    const rotY = transform.rotation.y

    // 相机偏移（飞船后方 12 单位，上方 3 单位），随飞船 Y 轴旋转
    const cosY = Math.cos(rotY)
    const sinY = Math.sin(rotY)
    const offsetX = 0 * cosY + -12 * sinY
    const offsetZ = 0 * -sinY + -12 * cosY

    this._camera.position = playerPos.add(new Vector3(offsetX, 3, offsetZ))
    this._camera.setTarget(playerPos)
  }

  /** @description: 配置空间场景灯光 */
  private _setupLights(): void {
    // 微弱环境光，模拟深空散射
    const ambient = new HemisphericLight('ambientLight', new Vector3(0, 1, 0), this._scene)
    ambient.intensity = 0.2
    ambient.diffuse = new Color3(0.1, 0.15, 0.3)

    // 方向光模拟遥远恒星
    const sun = new DirectionalLight('sunLight', new Vector3(1, -0.3, 2), this._scene)
    sun.intensity = 0.9
    sun.diffuse = new Color3(1, 0.95, 0.85)
  }

  /** @description: 创建跟随相机 */
  private _setupCamera(): void {
    this._camera = new UniversalCamera('gameCamera', new Vector3(0, 3, -12), this._scene)
    this._camera.setTarget(Vector3.Zero())
    this._camera.fov = 1.1
    this._camera.minZ = 0.1
    this._camera.maxZ = 2000
  }

  /** @description: 配置 Bloom 后处理管线 */
  private _setupPostProcessing(): void {
    this._pipeline = new DefaultRenderingPipeline('mainPipeline', true, this._scene, [this._camera])
    this._pipeline.bloomEnabled = true
    this._pipeline.bloomThreshold = 0.6
    this._pipeline.bloomWeight = 0.3
    this._pipeline.bloomKernel = 64
    this._pipeline.bloomScale = 0.5
  }

  /** @description: 创建星空粒子系统（程序化白点纹理） */
  private _setupStarField(): void {
    // 程序生成 16x16 白色圆点纹理（无需外部资源）
    const size = 16
    const data = new Uint8Array(size * size * 4)
    const center = (size - 1) / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2)
        const alpha = Math.round(Math.max(0, 1 - dist / (size / 2)) * 255)
        const i = (y * size + x) * 4
        data[i] = data[i + 1] = data[i + 2] = 255
        data[i + 3] = alpha
      }
    }
    // 2 = Texture.BILINEAR_SAMPLINGMODE
    const starTexture = RawTexture.CreateRGBATexture(data, size, size, this._scene, false, false, 2)

    const ps = new ParticleSystem('starfield', 2000, this._scene)
    ps.particleTexture = starTexture
    ps.emitter = Vector3.Zero()
    ps.minEmitBox = new Vector3(-600, -600, -600)
    ps.maxEmitBox = new Vector3(600, 600, 600)
    ps.color1 = new Color4(1, 1, 1, 1)
    ps.color2 = new Color4(0.7, 0.85, 1, 0.6)
    ps.colorDead = new Color4(0, 0, 0, 0)
    ps.minSize = 0.4
    ps.maxSize = 1.4
    ps.minLifeTime = 99999
    ps.maxLifeTime = 99999
    ps.emitRate = 2000
    ps.gravity = Vector3.Zero()
    ps.minEmitPower = 0
    ps.maxEmitPower = 0
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.start()
  }

  /** @description: 销毁，释放渲染资源 */
  dispose(): void {
    this._pipeline.dispose()
    this._camera.dispose()
  }
}
