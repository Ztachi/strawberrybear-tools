/**
 * @description: 难度配置
 */
export const DIFFICULTIES = [
  { key: 'easy', label: '简单', labelEn: 'Easy', cols: 4, rows: 3 },
  { key: 'normal', label: '普通', labelEn: 'Normal', cols: 4, rows: 4 },
  { key: 'hard', label: '困难', labelEn: 'Hard', cols: 5, rows: 4 },
  { key: 'expert', label: '超难', labelEn: 'Expert', cols: 6, rows: 4 },
] as const

export type DifficultyKey = typeof DIFFICULTIES[number]['key']

/**
 * @description: 获取难度配置
 * @param {DifficultyKey} key 难度key
 * @return {Object} 难度配置 { cols, rows }
 */
export function getDifficulty(key: DifficultyKey) {
  return DIFFICULTIES.find(d => d.key === key)!
}

/**
 * @description: 根据难度获取总格子数
 * @param {DifficultyKey} key 难度key
 * @return {number} 总格子数
 */
export function getTotalCells(key: DifficultyKey): number {
  const { cols, rows } = getDifficulty(key)
  return cols * rows
}
