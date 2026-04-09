import TextRecognition, { TextRecognitionScript } from "@react-native-ml-kit/text-recognition";

export async function recognizeTextFromImage(uri: string): Promise<string> {
  const result = await TextRecognition.recognize(uri, TextRecognitionScript.CHINESE);
  const text = result.blocks
    .flatMap((block) => block.lines.map((line) => line.text.trim()))
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("OCR returned empty text");
  }
  return text;
}

export async function recognizeTextFromBase64(): Promise<string> {
  throw new Error("本地 OCR 仅支持文件路径，请先将图片写入本地缓存。");
}
