import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => dir) }
}))

const { addTopic, deleteTopic, getVideoTags, listTopics, setVideoTags, updateTopic } = await import(
  '../src/main/annotations'
)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hotflow-annotations-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('视频标签存储', () => {
  it('设置后可读回，键跨调用稳定', async () => {
    await setVideoTags('开学第一课|2026-09-01', ['活动款', '系列'])
    const tags = await getVideoTags()
    expect(tags['开学第一课|2026-09-01']).toEqual(['活动款', '系列'])
  })

  it('标签清洗：去首尾空白、去重、丢弃空串', async () => {
    await setVideoTags('k', [' 活动款 ', '活动款', '', '  '])
    expect((await getVideoTags())['k']).toEqual(['活动款'])
  })

  it('清空标签即删除该键', async () => {
    await setVideoTags('k', ['a'])
    await setVideoTags('k', [])
    expect(await getVideoTags()).toEqual({})
  })

  it('无标签文件时返回空对象（首启动正常路径）', async () => {
    expect(await getVideoTags()).toEqual({})
  })
})

describe('选题库', () => {
  it('新增选题去重：同文本不重复入库', async () => {
    await addTopic('做一期宿舍开箱续集', 'ai')
    await addTopic('做一期宿舍开箱续集', 'manual')
    const list = await listTopics()
    expect(list).toHaveLength(1)
    expect(list[0].source).toBe('ai')
    expect(list[0].status).toBe('open')
  })

  it('空白文本不入库', async () => {
    await addTopic('   ')
    expect(await listTopics()).toEqual([])
  })

  it('状态流转与删除', async () => {
    await addTopic('选题A')
    const id = (await listTopics())[0].id
    await updateTopic(id, 'published')
    expect((await listTopics())[0].status).toBe('published')
    await deleteTopic(id)
    expect(await listTopics()).toEqual([])
  })

  it('新选题排在前面（新→旧）', async () => {
    await addTopic('选题A')
    await addTopic('选题B')
    expect((await listTopics()).map((t) => t.text)).toEqual(['选题B', '选题A'])
  })
})
