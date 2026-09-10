/**
 * 运营标注数据：视频自定义标签 + 选题库。纯 JSON 存 userData，原子写。
 * 标签键为 matchKeyOf（标题+发布日），跨期导入标签跟着视频走。
 */
import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { writeFileAtomic } from './atomic'
import { logWarn } from './logger'
import type { Topic, TopicStatus, VideoTagMap } from '@shared/types'

function tagsFile(): string {
  return join(app.getPath('userData'), 'tags.json')
}

function topicsFile(): string {
  return join(app.getPath('userData'), 'topics.json')
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'ENOENT'
}

export async function getVideoTags(): Promise<VideoTagMap> {
  try {
    const parsed = JSON.parse(await readFile(tagsFile(), 'utf-8')) as VideoTagMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    if (!isNotFound(err)) logWarn('annotations:getVideoTags', err)
    return {}
  }
}

/** 设置一个视频键的标签：清洗去重，清空即删除该键 */
export async function setVideoTags(key: string, tags: string[]): Promise<VideoTagMap> {
  const all = await getVideoTags()
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  if (clean.length === 0) delete all[key]
  else all[key] = clean
  await writeFileAtomic(tagsFile(), JSON.stringify(all))
  return all
}

export async function listTopics(): Promise<Topic[]> {
  try {
    const list = JSON.parse(await readFile(topicsFile(), 'utf-8')) as Topic[]
    return Array.isArray(list) ? list : []
  } catch (err) {
    if (!isNotFound(err)) logWarn('annotations:listTopics', err)
    return []
  }
}

/** 新增选题：同文本已存在（任意状态）时不重复入库 */
export async function addTopic(text: string, source: 'ai' | 'manual' = 'manual'): Promise<Topic[]> {
  const trimmed = text.trim()
  const list = await listTopics()
  if (!trimmed || list.some((t) => t.text === trimmed)) return list
  const topic: Topic = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: trimmed,
    source,
    createdAt: new Date().toISOString(),
    status: 'open'
  }
  const next = [topic, ...list]
  await writeFileAtomic(topicsFile(), JSON.stringify(next))
  return next
}

export async function updateTopic(id: string, status: TopicStatus): Promise<Topic[]> {
  const next = (await listTopics()).map((t) => (t.id === id ? { ...t, status } : t))
  await writeFileAtomic(topicsFile(), JSON.stringify(next))
  return next
}

export async function deleteTopic(id: string): Promise<Topic[]> {
  const next = (await listTopics()).filter((t) => t.id !== id)
  await writeFileAtomic(topicsFile(), JSON.stringify(next))
  return next
}
