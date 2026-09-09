import { describe, expect, it } from 'vitest'
import { parseCount, parseDateTime, parseDurationSec, parsePercent } from '../src/shared/parse'

describe('parseCount', () => {
  it('解析普通数字与千分位', () => {
    expect(parseCount(456)).toBe(456)
    expect(parseCount('1,234')).toBe(1234)
    expect(parseCount(' 2,048 ')).toBe(2048)
  })
  it('解析中文单位', () => {
    expect(parseCount('1.2万')).toBe(12000)
    expect(parseCount('3亿')).toBe(300000000)
    expect(parseCount('456w')).toBe(4560000)
    expect(parseCount('2k')).toBe(2000)
  })
  it('空值与非法值返回 null', () => {
    expect(parseCount('-')).toBeNull()
    expect(parseCount('')).toBeNull()
    expect(parseCount(null)).toBeNull()
    expect(parseCount('abc')).toBeNull()
  })
})

describe('parsePercent', () => {
  it('带百分号的字符串', () => {
    expect(parsePercent('45.6%')).toBe(45.6)
    expect(parsePercent(' 8% ')).toBe(8)
  })
  it('小数形式自动按比例放大', () => {
    expect(parsePercent('0.45')).toBe(45)
    expect(parsePercent(0.3)).toBe(30)
  })
  it('不带百分号的大数视为已是百分数', () => {
    expect(parsePercent('45')).toBe(45)
    expect(parsePercent(45.6)).toBe(45.6)
  })
  it('空值返回 null', () => {
    expect(parsePercent('—')).toBeNull()
    expect(parsePercent(undefined)).toBeNull()
  })
})

describe('parseDurationSec', () => {
  it('解析时钟格式', () => {
    expect(parseDurationSec('00:01:23')).toBe(83)
    expect(parseDurationSec('01:23')).toBe(83)
    expect(parseDurationSec('1:02:03.5')).toBeCloseTo(3723.5)
  })
  it('解析中文时长', () => {
    expect(parseDurationSec('2分13秒')).toBe(133)
    expect(parseDurationSec('90秒')).toBe(90)
    expect(parseDurationSec('1.5分钟')).toBe(90)
    expect(parseDurationSec('1时30分')).toBe(5400)
  })
  it('纯数字视为秒', () => {
    expect(parseDurationSec(45)).toBe(45)
    expect(parseDurationSec('45')).toBe(45)
  })
  it('空值返回 null', () => {
    expect(parseDurationSec('-')).toBeNull()
    expect(parseDurationSec('')).toBeNull()
  })
})

describe('parseDateTime', () => {
  it('解析常见日期字符串', () => {
    expect(parseDateTime('2026/8/1 20:30')).toBe('2026-08-01 20:30:00')
    expect(parseDateTime('2026-08-01 20:30:00')).toBe('2026-08-01 20:30:00')
    expect(parseDateTime('2026年8月1日 20:30')).toBe('2026-08-01 20:30:00')
    expect(parseDateTime('2026.08.01')).toBe('2026-08-01 00:00:00')
  })
  it('解析 Date 对象', () => {
    expect(parseDateTime(new Date(2026, 7, 1, 9, 5))).toBe('2026-08-01 09:05:00')
  })
  it('空值与非法值返回 null', () => {
    expect(parseDateTime('')).toBeNull()
    expect(parseDateTime('不是日期')).toBeNull()
  })
})
