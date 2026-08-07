const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const JSON_INSTRUCTIONS = `
You are assisting with reports of suspected invasive marine species in Busan, South Korea.
First identify the actual animal, plant, or organism shown in the image, even when it is terrestrial, not marine, or not an invasive species. Analyze only what is visually supported by the image. Do not identify with certainty.
Return strict JSON with this exact shape:
{
  "candidates": [
    {"name_ko":"Korean common name or a broad Korean taxon", "scientific_name":"scientific name if known", "confidence":0, "features":["visible feature 1", "visible feature 2"]},
    {"name_ko":"second candidate", "scientific_name":"", "confidence":0, "features":[]},
    {"name_ko":"third candidate", "scientific_name":"", "confidence":0, "features":[]}
  ],
  "needs_expert_review": true,
  "safety_message":"Short Korean safety guidance"
}
Use Korean text. Confidence must be an INTEGER PERCENTAGE from 0 to 100, never a decimal probability from 0 to 1. Confidence means visual similarity to the named candidate only; do not lower it merely because the animal is terrestrial, not marine, or may not be an invasive species. Use 80 to 95 for a clear, distinctive species photo, 50 to 79 when the taxon is reasonably supported but not certain, and below 50 only when key visual details are missing. If the image is truly unclear or does not contain an organism, say "미확인 생물" as the first name and set confidence to 0. Never say a species is confirmed. For a clearly visible capybara, name it "카피바라" and use a visual confidence appropriate to the image, normally 85 or higher.`;

function extractImage(payload) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(payload || '');
  if (!match) return null;
  const bytes = Buffer.byteLength(match[2], 'base64');
  if (bytes > MAX_IMAGE_BYTES) return { tooLarge: true };
  return { mimeType: match[1], data: match[2] };
}

function parseModelJson(text) {
  const withoutFence = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(withoutFence);
  } catch {
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('Gemini 결과에서 판별 JSON을 찾지 못했습니다.');
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeConfidence(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  // Gemini occasionally returns a 0–1 probability even when asked for a percentage.
  const percentage = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(Math.max(0, Math.min(100, percentage)));
}

function normalizeIdentification(result) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  return {
    ...result,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      confidence: normalizeConfidence(candidate?.confidence),
    })),
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'POST 요청만 가능합니다.' });
  if (!process.env.GEMINI_API_KEY) return response.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });

  const image = extractImage(request.body?.image);
  if (!image) return response.status(400).json({ error: 'JPG, PNG, WebP 사진을 보내 주세요.' });
  if (image.tooLarge) return response.status(413).json({ error: '사진은 3MB 이하로 올려 주세요.' });

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  try {
    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: JSON_INSTRUCTIONS }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    let geminiResponse;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      geminiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
      if (geminiResponse.ok || ![429, 500, 502, 503, 504].includes(geminiResponse.status) || attempt === 1) break;
      await wait(700);
    }
    if (!geminiResponse.ok) {
      const providerError = await geminiResponse.json().catch(() => ({}));
      const providerMessage = String(providerError?.error?.message || 'Google Gemini가 요청을 거절했습니다.')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 280);
      throw new Error(`Gemini ${geminiResponse.status}: ${providerMessage}`);
    }
    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) throw new Error('Gemini가 판별 결과를 반환하지 않았습니다.');
    return response.status(200).json(normalizeIdentification(parseModelJson(text)));
  } catch (error) {
    const message = String(error?.message || 'AI 판별 중 오류가 발생했습니다.').slice(0, 320);
    console.error('Gemini identification failed:', message);
    return response.status(502).json({ error: message });
  }
}
