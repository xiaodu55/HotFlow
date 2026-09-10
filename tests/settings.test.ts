import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmConfig } from '../src/shared/types'

let dir: string

const canEncrypt = vi.fn(() => true)
// 简单可逆的假加密：内容加前缀，验证调用链即可
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => dir) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => canEncrypt()),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => {
      const s = b.toString('utf-8')
      if (!s.startsWith('enc:')) throw new Error('bad payload')
      return s.slice(4)
    })
  }
}))

const { loadSettings, saveSettings } = await import('../src/main/settings')

const llm = (apiKey: string): LlmConfig => ({ provider: 'deepseek', baseURL: 'https://api.test', apiKey, model: 'm1' })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hotflow-settings-'))
  canEncrypt.mockReturnValue(true)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('settings（API Key 加密存储）', () => {
  it('保存后文件不含明文 Key，读取时解密还原', async () => {
    await saveSettings({ llm: llm('sk-secret-123') })
    const raw = await readFile(join(dir, 'settings.json'), 'utf-8')
    expect(raw).not.toContain('sk-secret-123')
    expect(JSON.parse(raw).llm.apiKeyEncrypted).toBeTruthy()
    const loaded = await loadSettings()
    expect(loaded.llm.apiKey).toBe('sk-secret-123')
    expect(loaded.llm.model).toBe('m1')
  })

  it('safeStorage 不可用时回退明文，读取原样返回', async () => {
    canEncrypt.mockReturnValue(false)
    await saveSettings({ llm: llm('sk-plain') })
    const raw = await readFile(join(dir, 'settings.json'), 'utf-8')
    expect(JSON.parse(raw).llm.apiKey).toBe('sk-plain')
    const loaded = await loadSettings()
    expect(loaded.llm.apiKey).toBe('sk-plain')
  })

  it('加密负载损坏时解密失败不抛出，Key 置空兜底', async () => {
    await saveSettings({ llm: llm('sk-x') })
    // 手动破坏密文
    const file = join(dir, 'settings.json')
    const j = JSON.parse(await readFile(file, 'utf-8'))
    j.llm.apiKeyEncrypted = Buffer.from('corrupted', 'utf-8').toString('base64')
    await writeFile(file, JSON.stringify(j))
    const loaded = await loadSettings()
    expect(loaded.llm.apiKey).toBe('')
  })

  it('无设置文件时返回默认配置', async () => {
    const loaded = await loadSettings()
    expect(loaded.llm.apiKey).toBe('')
  })
})
