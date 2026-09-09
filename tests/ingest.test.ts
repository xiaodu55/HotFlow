import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { inspectTable } from '../src/main/ingest'

const SAMPLES = join(__dirname, '..', 'samples')

describe.skipIf(!existsSync(join(SAMPLES, 'sample_douyin_period1.xlsx')))('inspectTable 列映射预检', () => {
  it('返回表头、行数与字段识别结果，不落库', async () => {
    const inspect = await inspectTable(join(SAMPLES, 'sample_douyin_period1.xlsx'), 'douyin')
    expect(inspect.fileName).toBe('sample_douyin_period1.xlsx')
    expect(inspect.rowCount).toBeGreaterThan(20)
    expect(inspect.fieldColumns['title']).toBe('作品名称')
    expect(inspect.fieldColumns['plays']).toBe('播放量')
    expect(inspect.fieldColumns['publishTime']).toBe('发布时间')
    expect(inspect.unmappedColumns).toEqual([])
    expect(inspect.samples['作品名称']).toBeTruthy()
  })
})
