/** 播放器发布协调：官方 action 负责打包与清单，本脚本负责校验和串行推进固定入口。 */
/* global process, console, URL, Buffer, fetch, AbortSignal */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import semver from 'semver'
import { checkReleaseNotes } from './check-release-notes.mjs'

export const CHANNEL = 'infinity-nikki-player-updates'
export const REPOSITORY = 'Ztachi/strawberrybear-tools'
export const PROXY = 'https://gh-proxy.com/'
const APP = 'apps/infinity-nikki-player'
const PLATFORMS = { 'darwin-aarch64': '.app.tar.gz', 'windows-x86_64': '.exe' }

/** @param version 正式版本号；拒绝预发布版本进入正式更新入口。 */
export function requireVersion(version) {
  if (semver.valid(version) !== version || semver.prerelease(version))
    throw new Error(`正式版本号无效：${version}`)
  return version
}

/** @param root 仓库根目录；配置使用 package.json 作为版本来源。 */
export function readVersion(root = '.') {
  const version = requireVersion(JSON.parse(readFileSync(join(root, APP, 'package.json'))).version)
  const config = JSON.parse(readFileSync(join(root, APP, 'src-tauri/tauri.conf.json')))
  const cargo = readFileSync(join(root, APP, 'src-tauri/Cargo.toml'), 'utf8').match(
    /^\[package\]\s*([\s\S]*?)(?=^\[|$(?![\s\S]))/m
  )?.[1]
  const cargoVersion = cargo?.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  if (config.version !== '../package.json' || cargoVersion !== version)
    throw new Error('应用、Cargo 与 Tauri 版本来源不一致')
  return { version, config }
}

/** 已公开产物不可覆盖；只允许同一提交继续草稿或补齐清单入口。 */
export function releaseMode(version, existing, newestVersion, sha) {
  requireVersion(version)
  if (newestVersion && semver.lt(version, requireVersion(newestVersion)))
    throw new Error('禁止旧发布任务覆盖较新的更新入口')
  if (!existing) return 'build'
  if (existing.prerelease) throw new Error('正式版本 tag 不能复用预发布版本')
  if (existing.target_commitish !== sha)
    throw new Error('同版本只能恢复原发布提交；请新增 Changeset 升版')
  return existing.draft ? 'build' : 'repair'
}

/** 发布协调修复可继续校验原草稿；产物提交和应用代码不可替换。 */
export function releaseCommit(current, existing, changedPaths) {
  if (!existing || existing.target_commitish === current) return current
  const coordinatorPaths = new Set([
    `${APP}/scripts/updater-release.mjs`,
    `${APP}/scripts/updater-release.test.mjs`,
    `${APP}/docs/auto-update.md`,
    '.github/workflows/release-infinity-nikki-player.yml',
  ])
  if (
    !existing.draft ||
    !/^[a-f0-9]{40}$/.test(existing.target_commitish) ||
    !changedPaths.length ||
    changedPaths.some((path) => !coordinatorPaths.has(path))
  )
    throw new Error('同版本恢复仅允许修复发布协调代码，应用变化必须升版')
  return existing.target_commitish
}

/** 只接受同仓库、同版本的真实资产，清单不允许指向 latest 或其他应用。 */
export function assetName(url, version) {
  const parsed = new URL(url)
  const prefix = `/${REPOSITORY}/releases/download/infinity-nikki-player@v${version}/`
  const path = decodeURIComponent(parsed.pathname)
  if (
    parsed.origin !== 'https://github.com' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !path.startsWith(prefix)
  )
    throw new Error('更新链接不属于当前播放器版本')
  const name = path.slice(prefix.length)
  if (!name || name !== basename(name) || name.includes('\\')) throw new Error('更新资产名称无效')
  return name
}

/** 校验官方清单的两个支持平台及全部额外平台键，避免遗漏框架生成的安装器键。 */
export function validateManifest(manifest, version, assets) {
  if (requireVersion(manifest.version) !== version) throw new Error('更新清单版本与应用版本不一致')
  for (const [platform, extension] of Object.entries(PLATFORMS)) {
    const item = manifest.platforms?.[platform]
    if (!item || !assetName(item.url, version).endsWith(extension))
      throw new Error(`缺少平台或平台产物类型错误：${platform}`)
  }
  for (const item of Object.values(manifest.platforms)) {
    const name = assetName(item.url, version)
    if (!item.signature?.trim()) throw new Error(`缺少更新签名：${name}`)
    if (!assets.has(name) || !assets.has(`${name}.sig`))
      throw new Error(`产物或签名尚未上传：${name}`)
    if (assets.get(`${name}.sig`).toString().trim() !== item.signature.trim())
      throw new Error(`清单与签名文件不一致：${name}`)
  }
  return manifest
}

/** 代理清单只增加地址前缀，版本、平台、签名及其他字段保持官方输出。 */
export function proxyManifest(manifest) {
  return {
    ...manifest,
    platforms: Object.fromEntries(
      Object.entries(manifest.platforms).map(([platform, item]) => [
        platform,
        { ...item, url: `${PROXY}${item.url}` },
      ])
    ),
  }
}

/** 官方 action v1 使用资产 API 地址；按已上传的同一资产转换为无需 API 请求头的公开地址。 */
export function publicManifest(manifest, version, releaseAssets) {
  // 使用 GitHub 返回的资产身份匹配，不按平台猜文件名，防止签名与安装包意外错配。
  return {
    ...manifest,
    platforms: Object.fromEntries(
      Object.entries(manifest.platforms ?? {}).map(([platform, item]) => {
        const asset = releaseAssets.find(
          (asset) => asset.url === item.url || asset.browser_download_url === item.url
        )
        // 草稿在公开前使用 untagged 临时路径；仍按已匹配的资产验证仓库和文件名。
        const url = asset?.browser_download_url.replace(
          /\/releases\/download\/untagged-[^/]+\//,
          `/releases/download/infinity-nikki-player%40v${version}/`
        )
        if (!asset || assetName(url, version) !== asset.name)
          throw new Error(`清单链接无法对应当前版本已上传资产：${platform}`)
        return [platform, { ...item, url }]
      })
    ),
  }
}

/** @param args GitHub CLI 参数数组，禁用 shell 拼接；非 404 错误必须失败。 */
function gh(args, input) {
  return execFileSync('gh', args, {
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 180_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}
function api(path, body) {
  return JSON.parse(
    gh(
      ['api', `repos/${REPOSITORY}/${path}`, ...(body ? ['--method', 'POST', '--input', '-'] : [])],
      body ? JSON.stringify(body) : undefined
    )
  )
}
/** tag 接口无法找到草稿时，查询包含草稿的完整列表；其他 API 错误不得当成不存在。 */
export function resolveRelease(tag, { readByTag, listAll }) {
  try {
    return readByTag(tag)
  } catch (error) {
    if (!error.stderr?.toString().includes('(HTTP 404)')) throw error
    const matches = listAll().filter((release) => release.tag_name === tag)
    if (matches.length > 1) throw new Error(`发现重复发布记录，需要先核对草稿：${tag}`)
    return matches[0] ?? null
  }
}
function listReleases() {
  return JSON.parse(
    gh(['api', `repos/${REPOSITORY}/releases?per_page=100`, '--paginate', '--slurp'])
  ).flat()
}
function findRelease(tag) {
  return resolveRelease(tag, {
    readByTag: (tag) => api(`releases/tags/${encodeURIComponent(tag)}`),
    listAll: listReleases,
  })
}
function patchRelease(id, body) {
  return JSON.parse(
    gh(
      ['api', `repos/${REPOSITORY}/releases/${id}`, '--method', 'PATCH', '--input', '-'],
      JSON.stringify(body)
    )
  )
}
function downloadAsset(asset) {
  const bytes = gh([
    'api',
    `repos/${REPOSITORY}/releases/assets/${asset.id}`,
    '-H',
    'Accept: application/octet-stream',
  ])
  if (bytes.length !== asset.size) throw new Error(`资产长度不符：${asset.name}`)
  if (asset.digest && asset.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
    throw new Error(`资产摘要不符：${asset.name}`)
  return bytes
}
function newestVersion() {
  const versions = listReleases()
    .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith('infinity-nikki-player@v'))
    .map((r) => requireVersion(r.tag_name.slice('infinity-nikki-player@v'.length)))
  return versions.sort(semver.rcompare)[0]
}
function output(values) {
  for (const [key, value] of Object.entries(values))
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}
function changelog(version) {
  const text = readFileSync(`${APP}/CHANGELOG.md`, 'utf8')
  const sections = text.split(/^## /m).slice(1)
  return (
    sections
      .find((section) => section.split('\n')[0].trim() === version)
      ?.split('\n')
      .slice(1)
      .join('\n')
      .trim() || `播放器 ${version}`
  )
}

/** 比较版本值，任何 git show 错误直接失败，不能把失败当成“版本改变”。 */
export function versionChanged(before, current) {
  requireVersion(before)
  requireVersion(current)
  if (semver.lt(current, before)) throw new Error('播放器版本不能回退')
  return semver.gt(current, before)
}

function prepare() {
  const { version } = readVersion()
  checkReleaseNotes(join('.', APP))
  const sha = process.env.GITHUB_SHA
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('发布提交必须是完整 Git SHA')
  const tag = `infinity-nikki-player@v${version}`
  let release = findRelease(tag)
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    const previous = JSON.parse(
      execFileSync('git', ['show', `${process.env.BEFORE_SHA}:${APP}/package.json`], {
        encoding: 'utf8',
      })
    ).version
    if (!versionChanged(previous, version) && !release?.draft) {
      output({ mode: 'skip' })
      return
    }
  }
  // 协调脚本与安装包分离：修复草稿发布逻辑时，继续验证原构建提交的回执。
  const changedPaths =
    release && release.target_commitish !== sha
      ? execFileSync('git', ['diff', '--name-only', release.target_commitish, sha], {
          encoding: 'utf8',
        })
          .trim()
          .split('\n')
          .filter(Boolean)
      : []
  const releaseSha = releaseCommit(sha, release, changedPaths)
  const mode = releaseMode(version, release, newestVersion(), releaseSha)
  if (!release)
    release = api('releases', {
      tag_name: tag,
      target_commitish: sha,
      name: tag,
      body: changelog(version),
      draft: true,
      prerelease: false,
      make_latest: 'false',
    })
  output({
    mode: releaseSha !== sha ? 'repair' : mode,
    version,
    release_id: release.id,
    release_sha: releaseSha,
  })
}

/** 包内版本从平台原生产物读取，在 action 上传之后、公开之前生成验收凭据。 */
function verifyBundle() {
  const { version, config } = readVersion()
  let actual
  let platform
  if (process.platform === 'darwin') {
    platform = 'darwin-aarch64'
    const plist = `${APP}/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${config.productName}.app/Contents/Info.plist`
    actual = execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleShortVersionString', plist],
      { encoding: 'utf8' }
    ).trim()
    const identifier = execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleIdentifier', plist],
      { encoding: 'utf8' }
    ).trim()
    if (identifier !== config.identifier) throw new Error('macOS 包内应用标识错误')
  } else if (process.platform === 'win32') {
    platform = 'windows-x86_64'
    const executable = `${APP}/src-tauri/target/x86_64-pc-windows-msvc/release/infinity-nikki-player.exe`
    actual = execFileSync(
      'pwsh',
      ['-NoProfile', '-Command', `(Get-Item '${executable}').VersionInfo.ProductVersion`],
      { encoding: 'utf8' }
    ).trim()
  } else throw new Error('只能在构建目标平台读取包内版本')
  if (actual !== version) throw new Error(`包内版本不一致：${actual}，预期 ${version}`)
  const name = `bundle-verification-${platform}.json`
  writeFileSync(name, JSON.stringify({ version, platform, sha: process.env.GITHUB_SHA }))
  gh([
    'release',
    'upload',
    `infinity-nikki-player@v${version}`,
    name,
    '--clobber',
    '--repo',
    REPOSITORY,
  ])
}

/** 逐个替换并回读资产；旧文件只在替换自己的时候删除，另一清单始终保留。 */
export async function publishChannel({
  currentVersion,
  version,
  upload,
  verify,
  direct,
  mirror,
  existingDirect,
  existingMirror,
}) {
  // 工作流串行不能保证任务按版本先后执行，因此入口推进仍必须独立检查版本回退。
  if (currentVersion && semver.gt(requireVersion(currentVersion), requireVersion(version)))
    throw new Error('固定入口已有更新版本，拒绝覆盖')
  // 上次代理替换失败后可能只剩直连；先恢复备用，不能删除唯一有效入口。
  if (existingDirect && !existingMirror) {
    const restored = `${JSON.stringify(proxyManifest(JSON.parse(existingDirect)), null, 2)}\n`
    await upload('latest-cn.json', restored)
    await verify('latest-cn.json', restored)
    existingMirror = restored
  }
  if (existingDirect !== direct) await upload('latest.json', direct)
  await verify('latest.json', direct)
  if (existingMirror !== mirror) await upload('latest-cn.json', mirror)
  await verify('latest-cn.json', mirror)
}

async function publish() {
  const { version, config } = readVersion()
  const tag = `infinity-nikki-player@v${version}`
  const release = findRelease(tag)
  if (!release) throw new Error('待发布草稿不存在')
  const releaseSha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA
  releaseMode(version, release, newestVersion(), releaseSha)
  const directory = mkdtempSync(join(tmpdir(), 'nikki-release-'))
  try {
    const assets = new Map(release.assets.map((asset) => [asset.name, downloadAsset(asset)]))
    const manifest = validateManifest(
      publicManifest(JSON.parse(assets.get('latest.json') ?? 'null'), version, release.assets),
      version,
      assets
    )
    for (const platform of Object.keys(PLATFORMS)) {
      const verification = JSON.parse(assets.get(`bundle-verification-${platform}.json`) ?? 'null')
      if (
        verification?.version !== version ||
        verification?.sha !== releaseSha ||
        verification?.platform !== platform
      )
        throw new Error(`缺少对应提交的包内版本校验：${platform}`)
    }
    const publicKey = join(directory, 'updater.pub')
    writeFileSync(publicKey, Buffer.from(config.plugins.updater.pubkey, 'base64'))
    for (const item of Object.values(manifest.platforms)) {
      const name = assetName(item.url, version)
      const artifact = join(directory, name)
      writeFileSync(artifact, assets.get(name))
      writeFileSync(`${artifact}.minisig`, Buffer.from(item.signature, 'base64'))
      execFileSync('minisign', ['-Vm', artifact, '-p', publicKey, '-x', `${artifact}.minisig`], {
        stdio: 'pipe',
      })
    }
    const direct = `${JSON.stringify(manifest, null, 2)}\n`
    const mirror = `${JSON.stringify(proxyManifest(manifest), null, 2)}\n`
    let channel = findRelease(CHANNEL)
    let currentVersion
    const currentFiles = new Map()
    if (channel) {
      const versions = channel.assets
        .filter((asset) => ['latest.json', 'latest-cn.json'].includes(asset.name))
        .map((asset) => {
          const contents = downloadAsset(asset).toString()
          currentFiles.set(asset.name, contents)
          return requireVersion(JSON.parse(contents).version)
        })
      currentVersion = versions.sort(semver.rcompare)[0]
    }
    if (currentVersion && semver.gt(currentVersion, version))
      throw new Error('固定入口已有更新版本，禁止把旧版本标记为仓库最新')
    // 同版本重跑只补固定入口，禁止改动公开的安装包及旧版清单。
    if (release.draft) {
      for (const [name, contents] of [
        ['latest.json', direct],
        ['latest-cn.json', mirror],
      ]) {
        writeFileSync(join(directory, name), contents)
        gh(['release', 'upload', tag, join(directory, name), '--clobber', '--repo', REPOSITORY])
        const uploaded = findRelease(tag).assets.find((asset) => asset.name === name)
        if (!uploaded || downloadAsset(uploaded).toString() !== contents)
          throw new Error(`旧版清单上传校验失败：${name}`)
      }
      patchRelease(release.id, { draft: false, make_latest: 'true' })
    } else if (assets.get('latest-cn.json')?.toString() !== mirror)
      throw new Error('公开版本旧清单不完整，不允许同版本重写；请发布新版本')

    if (!channel)
      channel = api('releases', {
        tag_name: CHANNEL,
        target_commitish: process.env.GITHUB_SHA,
        name: '播放器自动更新入口',
        body: '供播放器检测更新使用；安装包位于各版本独立 Release。',
        draft: false,
        prerelease: false,
        make_latest: 'false',
      })
    await publishChannel({
      currentVersion,
      version,
      direct,
      mirror,
      existingDirect: currentFiles.get('latest.json'),
      existingMirror: currentFiles.get('latest-cn.json'),
      upload: (name, contents) => {
        writeFileSync(join(directory, name), contents)
        gh(['release', 'upload', CHANNEL, join(directory, name), '--clobber', '--repo', REPOSITORY])
      },
      verify: async (name, contents) => {
        const asset = findRelease(CHANNEL).assets.find((asset) => asset.name === name)
        if (!asset || downloadAsset(asset).toString() !== contents)
          throw new Error(`固定入口上传校验失败：${name}`)
        // 还要确认客户端使用的公开下载路径可达，避免仅凭认证 API 成功就宣布完成。
        const response = await fetch(
          `https://github.com/${REPOSITORY}/releases/download/${CHANNEL}/${name}`,
          { signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' } }
        )
        if (!response.ok || (await response.text()) !== contents)
          throw new Error(`固定入口公开下载校验失败：${name}`)
      },
    })
    patchRelease(channel.id, { make_latest: 'false' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/**
 * @description 校验正式版本并同步官网固定名称，两个包准备齐全后才开始覆盖。
 * @param {object} options 发布身份与下载、上传、回读端口；回读必须返回原始字节。
 * @return {Promise<void>} 两个平台上传并校验成功；任一失败立即拒绝。
 */
export async function syncR2Downloads({
  release,
  version,
  newestVersion,
  sha,
  download,
  upload,
  readBack,
}) {
  if (!release || release.draft || release.tag_name !== `infinity-nikki-player@v${version}`)
    throw new Error('仅允许同步当前播放器正式 Release')
  // 不能依赖全仓库 latest：其他应用可能同时发布；按播放器正式版本拒绝旧任务。
  releaseMode(version, release, newestVersion, sha)
  const files = [
    { source: `InfinityNikkiPlayer_${version}_aarch64.dmg`, name: 'InfinityNikkiPlayer.dmg' },
    { source: `InfinityNikkiPlayer_${version}_x64-setup.exe`, name: 'InfinityNikkiPlayer.exe' },
  ].map(({ source, name }) => {
    const matches = release.assets.filter((asset) => asset.name === source)
    if (matches.length !== 1 || matches[0].state !== 'uploaded' || matches[0].size <= 0)
      throw new Error(`官网安装包缺失、重复或上传未完成：${source}`)
    return { asset: matches[0], name }
  })
  // 先完整下载并校验 GitHub 资产，避免第二个平台缺包时已覆盖第一个平台。
  for (const file of files) file.bytes = await download(file.asset)
  for (const { name, bytes } of files) {
    await upload(name, bytes)
    if (!bytes.equals(await readBack(name))) throw new Error(`R2 回读校验失败：${name}`)
  }
}

/**
 * @description 使用官方 CLI 上传或回读远端对象，短暂网络失败最多尝试三次。
 * @param {string[]} args Wrangler 参数数组；凭据只通过进程环境传入。
 * @return {Promise<void>} 操作成功；三次失败后携带 CLI 错误拒绝。
 */
async function r2Command(args) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync('wrangler', ['r2', 'object', ...args, '--remote'], {
        timeout: 90_000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return
    } catch (error) {
      if (attempt === 3)
        throw new Error(`R2 ${args[0]} 失败：${error.stderr?.toString() || error.message}`)
      console.warn(`R2 ${args[0]} 暂未成功，准备第 ${attempt + 1} 次尝试`)
      await setTimeout(2000)
    }
  }
}

/**
 * @description 将本次已公开且校验通过的安装包映射到官网固定路径，不重建产物。
 * @return {Promise<void>} 官网安装包同步完成；临时下载目录始终清理。
 */
async function syncR2() {
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])
    if (!process.env[name]?.trim()) throw new Error(`缺少 GitHub Secret：${name}`)
  const { version } = readVersion()
  const release = findRelease(`infinity-nikki-player@v${version}`)
  const directory = mkdtempSync(join(tmpdir(), 'nikki-r2-'))
  try {
    await syncR2Downloads({
      release,
      version,
      newestVersion: newestVersion(),
      sha: process.env.RELEASE_SHA,
      download: downloadAsset,
      upload: async (name, bytes) => {
        const file = join(directory, name)
        writeFileSync(file, bytes)
        await r2Command([
          'put',
          `homepage/tools/downloads/${name}`,
          '--file',
          file,
          '--content-type',
          name.endsWith('.dmg') ? 'application/x-diskcopy' : 'application/octet-stream',
          '--content-disposition',
          `attachment; filename="${name}"`,
          // 固定名称每次覆盖，需要浏览器和 CDN 重新验证，不能沿用不可变资产的长缓存。
          '--cache-control',
          'no-cache, max-age=0, must-revalidate',
        ])
      },
      readBack: async (name) => {
        const file = join(directory, `verified-${name}`)
        await r2Command(['get', `homepage/tools/downloads/${name}`, '--file', file])
        return readFileSync(file)
      },
    })
    console.log(`官网 R2 安装包同步并回读校验通过：${version}`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2]
    if (command === 'prepare') prepare()
    else if (command === 'verify-bundle') verifyBundle()
    else if (command === 'publish') await publish()
    else if (command === 'sync-r2') await syncR2()
    else if (command === 'verify-version') console.log(`版本校验通过：${readVersion().version}`)
    else throw new Error('未知发布操作')
  } catch (error) {
    console.error(`播放器发布失败：${error.message}`)
    process.exitCode = 1
  }
}
