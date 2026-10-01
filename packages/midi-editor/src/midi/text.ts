/**
 * midi-file 把文本按「一个字符一个字节」读写；这里在 UTF-8 字节与该二进制串之间转换，
 * 保证中文轨名可以无损写入并被其它解析器按 UTF-8 读回。
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: false })

/**
 * @description: 把 Unicode 文本编码为 midi-file 期待的字节字符串。
 * @param {string} text 原始文本
 * @return {string} 每个字符代表一个字节（0–255）的字符串
 */
export function toMidiText(text: string): string {
  let result = ''
  for (const byte of encoder.encode(text)) result += String.fromCharCode(byte)
  return result
}

/**
 * @description: 把 midi-file 读出的字节字符串按 UTF-8 解码。
 * @param {string} bytes 每个字符代表一个字节的字符串
 * @return {string} Unicode 文本；非法序列以替换字符呈现
 */
export function fromMidiText(bytes: string): string {
  const array = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index) & 0xff
  return decoder.decode(array)
}
