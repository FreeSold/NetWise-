import * as FileSystem from "expo-file-system";

type OcrSpaceParsedResult = {
  ParsedText?: string;
};

type OcrSpaceResponse = {
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: OcrSpaceParsedResult[];
};

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const OCR_SPACE_API_KEY = "helloworld";

function guessMimeType(uri: string): "image/png" | "image/jpeg" | "image/webp" {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

export async function recognizeTextFromImage(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64
  });
  const mimeType = guessMimeType(uri);
  return recognizeTextFromBase64(base64, mimeType);
}

export async function recognizeTextFromBase64(
  base64: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp" = "image/png"
): Promise<string> {

  const form = new FormData();
  form.append("apikey", OCR_SPACE_API_KEY);
  form.append("language", "chs");
  form.append("isOverlayRequired", "false");
  form.append("OCREngine", "2");
  form.append("base64Image", `data:${mimeType};base64,${base64}`);

  const resp = await fetch(OCR_SPACE_ENDPOINT, {
    method: "POST",
    body: form
  });
  if (!resp.ok) {
    throw new Error(`OCR request failed: ${resp.status}`);
  }

  const data = (await resp.json()) as OcrSpaceResponse;
  if (data.IsErroredOnProcessing) {
    const message = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(", ")
      : data.ErrorMessage || "OCR processing error";
    throw new Error(message);
  }

  const text = data.ParsedResults?.map((r) => r.ParsedText || "").join("\n").trim();
  if (!text) {
    throw new Error("OCR returned empty text");
  }
  return text;
}
