/** 将毫秒时长格式化为分钟与秒，供曲库和卷帘工具栏统一使用。 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
