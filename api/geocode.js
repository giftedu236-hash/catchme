const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function normalizeQuery(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'GET 요청만 가능합니다.' });
  const query = normalizeQuery(request.query.q);
  if (query.length < 2) return response.status(400).json({ error: '두 글자 이상 장소를 입력해 주세요.' });

  const params = new URLSearchParams({
    q: query.includes('부산') ? `${query}, 대한민국` : `${query}, 부산광역시, 대한민국`,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'kr',
    'accept-language': 'ko',
  });

  try {
    const upstream = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
      headers: { 'User-Agent': 'BadaJikimiBusan-school-demo/1.0 (+https://catchme-plum.vercel.app)' },
    });
    if (!upstream.ok) throw new Error('주소 검색 서비스 응답 오류');
    const places = await upstream.json();
    const first = Array.isArray(places) ? places[0] : null;
    if (!first || !Number.isFinite(Number(first.lat)) || !Number.isFinite(Number(first.lon))) {
      return response.status(404).json({ error: '부산 지역에서 해당 장소를 찾지 못했습니다. 지도를 클릭해 위치를 지정해 주세요.' });
    }
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (latitude < 34.8 || latitude > 35.4 || longitude < 128.7 || longitude > 129.4) {
      return response.status(404).json({ error: '부산 연안 주변 장소만 검색할 수 있습니다.' });
    }
    response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return response.status(200).json({ latitude, longitude, displayName: first.display_name });
  } catch {
    return response.status(502).json({ error: '주소 검색 서비스를 불러오지 못했습니다. 지도에서 직접 위치를 선택해 주세요.' });
  }
}
