/** 按空格、中英文逗号、中英文分号拆分识别用词 */
export function splitRecognitionKeywords(raw: string): string[] {
  return raw
    .split(/[\s,，;；]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}
