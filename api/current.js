const CURRENT_ENDPOINT = 'https://apis.data.go.kr/1192136/crntFcstFldEbb/GetCrntFcstFldEbbApiService';

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
    const apiResponse = await fetch(`${CURRENT_ENDPOINT}?${params.toString()}`);
    const payload = await apiResponse.json();
    if (!apiResponse.ok) throw new Error('공공 API 요청 실패');
    const current = normalizeForecast(payload);
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return response.status(200).json({ obsCode, source: '국립해양조사원 조류예보 API', current });
  } catch (error) {
    return response.status(502).json({ error: '조류예보 API 데이터를 불러오지 못했습니다.', code: error.publicCode || 'UPSTREAM_ERROR' });
  }
}
