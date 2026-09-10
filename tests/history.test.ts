import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot, VideoRecord } from '../src/shared/types'

let dir: string

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => dir) }
}))

const { deleteSnapshot, listSnapshots, saveSnapshot } = await import('../src/main/history')

/** 与 paths.historyDir() 对应：mock 的 userData 下再拼一级 history */
function hist(): string {
  return join(dir, 'history')
}

function rec(partial: Partial<VideoRecord>): VideoRecord {
  return {
    id: 'v1',
    title: '测试视频',
    publishTime: null,
    durationSec: null,
    plays: 1,
    likes: 0,
    comments: 0,
    shares: 0,
    collects: 0,
    followsGained: null,
    completionRate: null,
    avgWatchSec: null,
    ...partial
  }
}

function snap(id: string, records: VideoRecord[] = [rec({})]): Snapshot {
  return {
    id,
    platform: 'douyin',
    platformLabel: '抖音',
    account: '',
    note: '',
    fileName: `${id}.xlsx`,
    importedAt: id,
    recordCount: records.length,
    warnings: [],
    unmappedColumns: [],
    records
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hotflow-history-'))
  await mkdir(hist(), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('history 快照存储（meta 索引）', () => {
  it('保存后列表只出现一次（meta 与全量快照不重复），且 meta 字段完整', async () => {
    await saveSnapshot(snap('a'))
    const metas = await listSnapshots()
    expect(metas).toHaveLength(1)
    expect(metas[0].id).toBe('a')
    expect(metas[0].recordCount).toBe(1)
    expect(metas[0].platformLabel).toBe('抖音')
  })

  it('旧版无 meta 文件的快照仍能列出（兼容回退）', async () => {
    await writeFile(join(hist(), 'legacy.json'), JSON.stringify(snap('legacy')), 'utf-8')
    const metas = await listSnapshots()
    expect(metas).toHaveLength(1)
    expect(metas[0].id).toBe('legacy')
  })

  it('诊断与诊断归档文件不会混入快照列表', async () => {
    await saveSnapshot(snap('a'))
    await writeFile(join(hist(), 'a.diagnosis.json'), '{}', 'utf-8')
    await writeFile(join(hist(), 'a.diagnosis-archive.json'), '[]', 'utf-8')
    const metas = await listSnapshots()
    expect(metas).toHaveLength(1)
    expect(metas[0].id).toBe('a')
  })

  it('删除快照同时清理 meta 与诊断文件', async () => {
    await saveSnapshot(snap('a'))
    await writeFile(join(hist(), 'a.diagnosis.json'), '{}', 'utf-8')
    await deleteSnapshot('a')
    expect(await listSnapshots()).toHaveLength(0)
  })

  it('损坏的快照文件不影响整体列表', async () => {
    await saveSnapshot(snap('good'))
    await writeFile(join(hist(), 'broken.json'), '{oops', 'utf-8')
    const metas = await listSnapshots()
    expect(metas.map((m) => m.id)).toEqual(['good'])
  })
})
