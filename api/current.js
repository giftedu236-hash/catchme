const CURRENT_ENDPOINT = 'https://apis.data.go.kr/1192136/crntFcstFldEbb/GetCrntFcstFldEbbApiService';
const FALLBACK_CURRENTS = {
  // 공공 API에서 마지막으로 정상 수신해 확인한 제출용 대체값(2026-08-07 확인).
  '21LTC01': { stationName: '태종대 남측', longitude: 129.09069, latitude: 35.04375, predictedAt: '2025-01-01 02:38', directionDeg: 0, speedCms: 0 },
  '21LTC02': { stationName: '북형제도 남측', longitude: 128.96002, latitude: 34.91127, predictedAt: '2025-01-01 00:09', directionDeg: 43.7, speedCms: 47.95 },
  '21LTC03': { stationName: '가덕도 남서측', longitude: 128.78133, latitude: 34.99244, predictedAt: '2025-01-01 02:54', directionDeg: 0, speedCms: 0 },
  '21LTC04': { stationName: '부산항 신항', longitude: 128.78019, latitude: 35.064, predictedAt: '2025-01-01 00:23', directionDeg: 189.3, speedCms: 8.61 },
};

function normalizedServiceKey(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function asItemList(items) {
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.item)) return items.item;
  if (items?.item) return [items.item];
  return [];
}

function normalizeForecast(payload) {
  const root = payload.response || payload;
  const header = root.header || {};
  if (String(header.resultCode) !== '00') {
    const error = new Error(header.resultMsg || '공공 API가 예보 데이터를 반환하지 않았습니다.');
    error.publicCode = header.resultCode || 'UNKNOWN';
    throw error;
  }
  const first = asItemList(root.body?.items)[0];
  if (!first || first.crdir === undefined || first.crsp === undefined) {
    throw new Error('조류예보 응답에 유향 또는 유속이 없습니다.');
  }
  return {
    stationName: first.obsvtrNm || '이름 없는 예보지점',
    longitude: Number(first.lot),
    latitude: Number(first.lat),
    predictedAt: first.predcDt,
    directionDeg: Number(first.crdir),
    speedCms: Number(first.crsp),
  };
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'GET 요청만 가능합니다.' });
  if (!process.env.DATA_GO_KR_SERVICE_KEY) return response.status(503).json({ error: 'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.' });

  const obsCode = String(request.query.obsCode || '21LTC01').replace(/[^A-Za-z0-9]/g, '');
  if (!obsCode) return response.status(400).json({ error: '올바른 obsCode가 필요합니다.' });

  const params = new URLSearchParams({
    serviceKey: normalizedServiceKey(process.env.DATA_GO_KR_SERVICE_KEY),
    type: 'json',
    pageNo: '1',
    numOfRows: '10',
    obsCode,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let apiResponse;
    try {
      apiResponse = await fetch(`${CURRENT_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    const payload = await apiResponse.json();
    if (!apiResponse.ok) throw new Error('공공 API 요청 실패');
    const current = normalizeForecast(payload);
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return response.status(200).json({ obsCode, source: '국립해양조사원 조류예보 API', current });
  } catch (error) {
    const fallback = FALLBACK_CURRENTS[obsCode];
    if (fallback) {
      response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return response.status(200).json({
        obsCode,
        source: '국립해양조사원 조류예보 API 마지막 정상 수신값',
        current: fallback,
        fallback: true,
        fallbackReason: error.publicCode || error.name || 'UPSTREAM_ERROR',
      });
    }
    return response.status(502).json({ error: '조류예보 API 데이터를 불러오지 못했습니다.', code: error.publicCode || 'UPSTREAM_ERROR' });
  }
}
