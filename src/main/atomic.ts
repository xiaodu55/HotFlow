import { rename, writeFile } from 'fs/promises'

/** 原子写：先写同目录 .tmp 再 rename 覆盖目标文件，避免崩溃/断电截断 JSON。
 *  Windows 上 Node 的 rename 走 MOVEFILE_REPLACE_EXISTING，可覆盖已存在目标。 */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`
  await writeFile(tmp, data, 'utf-8')
  await rename(tmp, file)
}
