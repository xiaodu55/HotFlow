import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => dir) }
}))

const { logWarn } = await import('../src/main/logger')

async function waitFor(cond: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 25))
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hotflow-log-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('logWarn（主进程轻量日志）', () => {
  it('写入 logs/main.log，包含 scope 与错误信息', async () => {
    logWarn('test:scope', new Error('出错了'))
    const file = join(dir, 'logs', 'main.log')
    await waitFor(async () => readFile(file, 'utf-8').then(Boolean).catch(() => false))
    const content = await readFile(file, 'utf-8')
    expect(content).toContain('[test:scope]')
    expect(content).toContain('出错了')
  })

  it('目录不可写时静默忽略、不上抛', async () => {
    // 用一个文件路径冒充 userData 目录，mkdir 必然失败
    const file = join(dir, 'not-a-dir')
    await writeFile(file, 'x', 'utf-8')
    dir = file
    expect(() => logWarn('test:broken', new Error('x'))).not.toThrow()
    await new Promise((r) => setTimeout(r, 50))
  })
})
