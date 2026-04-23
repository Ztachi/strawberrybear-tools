/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:25:30
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 20:02:36
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/entities/Ship.ts
 * @Description: 飞船实体
 */
/**
 * @fileOverview 飞船实体
 * @description 玩家飞船，扁平 Box 网格 + UP/DOWN 标签 + 品牌文字
 * @description 移动由 MovementSystem → PlayerMoveSpaceService 处理，Ship 本身只持有网格
 */
import { MeshBuilder, StandardMaterial, Color3, DynamicTexture } from '@babylonjs/core'
import type { Mesh, Scene } from '@babylonjs/core'
import { Entity } from './Entity'

/** Canvas 2D 绘图上下文类型 */
type Canvas2D = CanvasRenderingContext2D

export class Ship extends Entity {
  override readonly mesh: Mesh
  private readonly _upLabel!: Mesh
  private readonly _downLabel!: Mesh
  private readonly _brandLabel!: Mesh

  /**
   * @description: 创建飞船网格并应用材质
   * @param {Scene} scene - Babylon.js 场景
   */
  constructor(scene: Scene) {
    super()
    // 扁平长方体模拟飞船轮廓（宽2 x 高0.5 x 深3）
    this.mesh = MeshBuilder.CreateBox('ship', { width: 2, height: 0.5, depth: 3 }, scene)

    const mat = new StandardMaterial('shipMaterial', scene)
    mat.diffuseColor = new Color3(0.3, 0.7, 1)
    mat.emissiveColor = new Color3(0.05, 0.3, 0.6) // 自发光，配合 Bloom 效果发光
    mat.specularColor = new Color3(1, 1, 1)
    this.mesh.material = mat

    // 上方标签：UP（贴在飞船顶面，朝下以便从上方可见）
    this._upLabel = this._createTextPlane('upLabel', 'UP', scene)
    this._upLabel.position.y = 0.26
    this._upLabel.rotation.x = Math.PI / 2
    this._upLabel.parent = this.mesh

    // 下方标签：DOWN（贴在飞船底面，朝上以便从下方可见）
    this._downLabel = this._createTextPlane('downLabel', 'DOWN', scene)
    this._downLabel.position.y = -0.26
    this._downLabel.rotation.x = -Math.PI / 2
    this._downLabel.parent = this.mesh

    // 品牌标签：ztachi ship（贴在飞船后方，单独大号醒目文字）
    this._brandLabel = this._createBrandPlane('brandLabel', scene)
    this._brandLabel.position.z = -1.52
    this._brandLabel.rotation.y = Math.PI
    this._brandLabel.rotation.z = Math.PI
    this._brandLabel.rotation.x = Math.PI
    this._brandLabel.parent = this.mesh
  }

  /**
   * @description: 创建带文字的平面（UP/DOWN 简约版）
   */
  private _createTextPlane(name: string, text: string, scene: Scene): Mesh {
    const plane = MeshBuilder.CreatePlane(name, { width: 0.8, height: 0.3 }, scene)

    const tex = new DynamicTexture(`${name}Tex`, { width: 128, height: 48 }, scene, false)
    const ctx = tex.getContext() as Canvas2D
    ctx.clearRect(0, 0, 128, 48)
    ctx.font = 'bold 24px Arial'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 24)
    tex.update()

    const mat = new StandardMaterial(`${name}Mat`, scene)
    mat.diffuseTexture = tex
    mat.emissiveTexture = tex
    mat.backFaceCulling = false
    plane.material = mat

    return plane
  }

  /**
   * @description: 创建华丽品牌文字平面（ztachi ship）
   */
  private _createBrandPlane(name: string, scene: Scene): Mesh {
    const texWidth = 512
    const texHeight = 128
    const plane = MeshBuilder.CreatePlane(name, { width: 2.0, height: 0.5 }, scene)

    const tex = new DynamicTexture(
      `${name}Tex`,
      { width: texWidth, height: texHeight },
      scene,
      false
    )
    tex.hasAlpha = true
    const ctx = tex.getContext() as Canvas2D

    // 透明背景
    ctx.clearRect(0, 0, texWidth, texHeight)

    const centerX = texWidth / 2
    const centerY = texHeight / 2

    // 纯色发光文字（无阴影块）
    ctx.font = 'bold 56px Arial'
    ctx.fillStyle = '#00d4ff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#00d4ff'
    ctx.shadowBlur = 8
    ctx.fillText('ztachi ship', centerX, centerY)

    // 最上层白色文字
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.fillText('ztachi ship', centerX, centerY)

    tex.update()

    const mat = new StandardMaterial(`${name}Mat`, scene)
    mat.diffuseTexture = tex
    mat.emissiveTexture = tex
    mat.useAlphaFromDiffuseTexture = true
    mat.backFaceCulling = false
    plane.material = mat

    return plane
  }

  /**
   * @description: 飞船自身每帧逻辑
   * @param {number} _deltaTime - 距上一帧时间差（秒）
   */
  update(_deltaTime: number): void {
    // 移动由 MovementSystem 通过 ISpaceService 处理
  }
}
