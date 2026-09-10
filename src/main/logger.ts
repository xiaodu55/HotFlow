import { appendFile, mkdir, readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

const LOG_RETENTION_DAYS = 7

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

let pruneScheduled = false

/** 轻量主进程日志（userData/logs/main.log，保留最近 7 天）。
 *  供静默兜底的 catch 记录现场：绝不上抛、绝不影响主流程。 */
export function logWarn(scope: string, err: unknown): void {
  void (async () => {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const detail = err instanceof Error ? err.stack ?? err.message : String(err)
    await appendFile(join(dir, 'main.log'), `[${new Date().toISOString()}] [WARN] [${scope}] ${detail}\n`, 'utf-8')
    if (!pruneScheduled) {
      pruneScheduled = true
      await pruneOldLogs(dir)
    }
  })().catch(() => undefined)
}

async function pruneOldLogs(dir: string): Promise<void> {
  try {
    const files = await readdir(dir)
    for (const f of files) {
      if (!f.endsWith('.log')) continue
      const full = join(dir, f)
      const s = await stat(full)
      if (Date.now() - s.mtimeMs > LOG_RETENTION_DAYS * 86400000) await unlink(full)
    }
  } catch {
    // 清理失败不影响主流程
  }
}
