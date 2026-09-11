/** 发布故障回归：只使用本地资产和注入函数，不调用 GitHub 写接口。 */
/* global Buffer, structuredClone */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CHANNEL,
  PROXY,
  REPOSITORY,
  assetName,
  proxyManifest,
  publicManifest,
  publishChannel,
  readVersion,
  releaseMode,
  resolveRelease,
  validateManifest,
  versionChanged,
} from './updater-release.mjs'

const version = '1.2.1'
const sha = 'a'.repeat(40)
function fixture() {
  const entries = [
    ['darwin-aarch64', 'InfinityNikkiPlayer.app.tar.gz'],
    ['windows-x86_64', 'InfinityNikkiPlayer_1.2.1_x64-setup.exe'],
  ]
  const assets = new Map()
  const platforms = Object.fromEntries(
    entries.map(([platform, name]) => {
      assets.set(name, Buffer.from('仅用于发布校验的测试资产'))
      assets.set(`${name}.sig`, Buffer.from('fixture-signature\n'))
      return [
        platform,
        {
          signature: 'fixture-signature',
          url: `https://github.com/${REPOSITORY}/releases/download/infinity-nikki-player%40v${version}/${name}`,
        },
      ]
    })
  )
  return { manifest: { version, platforms }, assets }
}

test('版本来源一致，依赖字段修改不触发发布，使用 SemVer 比较', () => {
  assert.ok(readVersion().version)
  assert.equal(versionChanged('1.2.0', '1.2.0'), false)
  assert.equal(versionChanged('1.2.0', '1.10.0'), true)
  assert.throws(() => versionChanged('1.2.1', '1.2.0'))
})
test('同版本只能恢复同提交草稿或补清单，拒绝回退及改写公开产物', () => {
  assert.equal(releaseMode(version, null, '1.2.0', sha), 'build')
  assert.equal(releaseMode(version, { target_commitish: sha, draft: true }, version, sha), 'build')
  assert.equal(
    releaseMode(version, { target_commitish: sha, draft: false }, version, sha),
    'repair'
  )
  assert.throws(() =>
    releaseMode(version, { target_commitish: 'b'.repeat(40), draft: true }, version, sha)
  )
  assert.throws(() => releaseMode(version, null, '1.10.0', sha))
})
test('官方 API 地址映射到同一已上传资产，版本签名及额外字段均保留', () => {
  const { manifest, assets } = fixture()
  manifest.notes = '中文版本说明'
  const releaseAssets = Object.values(manifest.platforms).map((item, index) => ({
    name: assetName(item.url, version),
    url: `https://api.github.com/repos/${REPOSITORY}/releases/assets/${index + 1}`,
    browser_download_url: item.url,
  }))
  const official = structuredClone(manifest)
  Object.values(official.platforms).forEach((item, index) => {
    item.url = releaseAssets[index].url
  })
  const direct = publicManifest(official, version, releaseAssets)
  assert.deepEqual(direct, manifest)
  validateManifest(direct, version, assets)
  assert.deepEqual(publicManifest(direct, version, releaseAssets), direct)
  assert.throws(() => publicManifest(official, version, releaseAssets.slice(1)))
  assert.throws(() => publicManifest(official, '1.2.2', releaseAssets))
  assert.throws(() =>
    publicManifest(
      official,
      version,
      releaseAssets.map((asset) => ({ ...asset, name: '另一份安装包.exe' }))
    )
  )
})
test('tag 查询 404 后从完整列表恢复草稿，接口异常和重复记录直接失败', () => {
  const tag = `infinity-nikki-player@v${version}`
  const draft = { tag_name: tag, draft: true, target_commitish: sha }
  const notFound = Object.assign(new Error('未找到公开 tag'), { stderr: '(HTTP 404)' })
  const adapter = {
    readByTag: () => {
      throw notFound
    },
    listAll: () => [draft],
  }
  assert.equal(resolveRelease(tag, adapter), draft)
  assert.equal(resolveRelease('不存在的版本', adapter), null)
  assert.throws(() => resolveRelease(tag, { ...adapter, listAll: () => [draft, draft] }))
  assert.throws(() =>
    resolveRelease(tag, {
      ...adapter,
      readByTag: () => {
        throw new Error('网络失败')
      },
    })
  )
  assert.equal(
    resolveRelease(tag, {
      readByTag: () => draft,
      listAll: () => {
        throw new Error('不应重复查询')
      },
    }),
    draft
  )
})
test('代理变换只改地址，保留官方清单的所有字段及安装器平台键', () => {
  const { manifest, assets } = fixture()
  manifest.platforms['windows-x86_64-nsis'] = manifest.platforms['windows-x86_64']
  validateManifest(manifest, version, assets)
  const converted = proxyManifest(manifest)
  for (const [platform, item] of Object.entries(manifest.platforms)) {
    assert.deepEqual(converted.platforms[platform], { ...item, url: `${PROXY}${item.url}` })
  }
  assert.equal(converted.version, version)
  assert.equal(manifest.platforms['windows-x86_64'].url.startsWith(PROXY), false)
})
test('缺平台、缺包、缺签名、版本或链接不一致都阻止公开', () => {
  for (const mutate of [
    (f) => delete f.manifest.platforms['darwin-aarch64'],
    (f) => f.assets.delete('InfinityNikkiPlayer.app.tar.gz'),
    (f) => f.assets.delete('InfinityNikkiPlayer.app.tar.gz.sig'),
    (f) => {
      f.manifest.version = '1.2.0'
    },
    (f) => {
      f.manifest.platforms['windows-x86_64'].signature = '不同签名'
    },
    (f) => {
      f.manifest.platforms['windows-x86_64'].url =
        `https://github.com/${REPOSITORY}/releases/latest/download/app.exe`
    },
  ]) {
    const f = fixture()
    mutate(f)
    assert.throws(() => validateManifest(f.manifest, version, f.assets))
  }
  assert.throws(() => assetName('https://example.com/app.exe', version))
})
test('固定入口直连校验成功后才替换代理，部分失败不移除另一有效清单', async () => {
  const calls = []
  const options = {
    version,
    currentVersion: '1.2.0',
    direct: '直连清单',
    mirror: '代理清单',
    upload: async (name) => calls.push(`上传 ${name}`),
    verify: async (name) => calls.push(`校验 ${name}`),
  }
  await publishChannel(options)
  assert.deepEqual(calls, [
    '上传 latest.json',
    '校验 latest.json',
    '上传 latest-cn.json',
    '校验 latest-cn.json',
  ])
  calls.length = 0
  await assert.rejects(
    publishChannel({
      ...options,
      verify: async () => {
        throw new Error('公开下载不可达')
      },
    })
  )
  assert.deepEqual(calls, ['上传 latest.json'])
  calls.length = 0
  await assert.rejects(publishChannel({ ...options, currentVersion: '1.3.0' }))
  assert.equal(calls.length, 0)
})
test('其他应用发布不能抢占旧客户端入口，新入口独立于仓库 latest', () => {
  for (const app of [
    'sensitive-word-checker',
    'universe-explorer',
    'dq7-shuffle',
    'infinity-nikki-stylist-office',
  ]) {
    assert.match(readFileSync(`.github/workflows/release-${app}.yml`, 'utf8'), /make_latest: false/)
  }
  const config = JSON.parse(readFileSync('apps/infinity-nikki-player/src-tauri/tauri.conf.json'))
  assert.ok(config.plugins.updater.endpoints.every((url) => url.includes(`/download/${CHANNEL}/`)))
})

test('只剩直连入口时先修复备用，同内容重跑不删除有效资产', async () => {
  const { manifest } = fixture()
  const direct = `${JSON.stringify(manifest, null, 2)}\n`
  const mirror = `${JSON.stringify(proxyManifest(manifest), null, 2)}\n`
  const calls = []
  await publishChannel({
    version,
    currentVersion: version,
    direct,
    mirror,
    existingDirect: direct,
    upload: async (name) => calls.push(`上传 ${name}`),
    verify: async (name) => calls.push(`校验 ${name}`),
  })
  assert.deepEqual(calls, [
    '上传 latest-cn.json',
    '校验 latest-cn.json',
    '校验 latest.json',
    '校验 latest-cn.json',
  ])
})
