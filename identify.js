const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const JSON_INSTRUCTIONS = `
You are assisting with reports of suspected invasive marine species in Busan, South Korea.
Analyze only what is visually supported by the image. Do not identify with certainty.
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
Use Korean text. If the image is not a marine organism or is unclear, say "판별 불가" as the first name and set confidence to 0. Never say a species is confirmed.`;

function extractImage(payload) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(payload || '');
  if (!match) return null;
  const bytes = Buffer.byteLength(match[2], 'base64');
  if (bytes > MAX_IMAGE_BYTES) return { tooLarge: true };
  return { mimeType: match[1], data: match[2] };
}

function parseModelJson(text) {
  const withoutFence = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(withoutFence);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'POST 요청만 가능합니다.' });
  if (!process.env.GEMINI_API_KEY) return response.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });

  const image = extractImage(request.body?.image);
  if (!image) return response.status(400).json({ error: 'JPG, PNG, WebP 사진을 보내 주세요.' });
  if (image.tooLarge) return response.status(413).json({ error: '사진은 3MB 이하로 올려 주세요.' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  try {
    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: JSON_INSTRUCTIONS }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    });
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
    return response.status(200).json(parseModelJson(text));
  } catch (error) {
    const message = String(error?.message || 'AI 판별 중 오류가 발생했습니다.').slice(0, 320);
    return response.status(502).json({ error: message });
  }
}
