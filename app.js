const photoInput = document.querySelector('#photo');
const previewImage = document.querySelector('#previewImage');
const uploadZone = document.querySelector('#uploadZone');
const aiEmpty = document.querySelector('#aiEmpty');
const aiResult = document.querySelector('#aiResult');
const reportForm = document.querySelector('#reportForm');
const toast = document.querySelector('#toast');
const filters = document.querySelectorAll('.filter');
const pins = document.querySelectorAll('.report-pin');
const recalculate = document.querySelector('#recalculate');
const locationButton = document.querySelector('#locationButton');
const primarySpecies = document.querySelector('#primarySpecies');
const confidenceValue = document.querySelector('#confidenceValue');
const confidenceBar = document.querySelector('#confidenceBar');
const featureTags = document.querySelector('#featureTags');
const alternativeOne = document.querySelector('#alternativeOne');
const alternativeTwo = document.querySelector('#alternativeTwo');
const expertNote = document.querySelector('#expertNote');
const resultLabel = document.querySelector('#resultLabel');
const forecastStation = document.querySelector('#forecastStation');
const forecastDisclaimer = document.querySelector('#forecastDisclaimer');
const foundAtInput = document.querySelector('#foundAt');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function showAiResult() {
  aiEmpty.hidden = true;
  aiResult.hidden = false;
}

function localDateTimeValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

foundAtInput.value = localDateTimeValue(new Date());

function renderAiResult(result, source = 'AI') {
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const first = candidates[0] || {};
  const alternatives = candidates.slice(1, 3);
  const confidence = Math.max(0, Math.min(100, Number(first.confidence) || 0));
  primarySpecies.textContent = first.name_ko || '판별 불가';
  confidenceValue.textContent = `${confidence}%`;
  confidenceBar.style.width = `${confidence}%`;
  resultLabel.textContent = source === 'Gemini'
    ? 'Gemini가 사진 특징을 분석했어요'
    : source === 'Error'
      ? 'Gemini 연결 오류를 확인해 주세요'
      : '시연용 사진 특징 분석 결과입니다';
  featureTags.replaceChildren(...(first.features || ['특징을 분석 중']).slice(0, 4).map((feature) => {
    const item = document.createElement('li');
    item.textContent = feature;
    return item;
  }));
  alternativeOne.textContent = alternatives[0]?.name_ko || '전문가 확인 필요';
  alternativeTwo.textContent = alternatives[1]?.name_ko || '기타 해양생물';
  expertNote.innerHTML = `⚑ ${result.safety_message || '유사 토착종과 혼동될 수 있어'} <b>${result.needs_expert_review === false ? '현장 기록을 남겨 주세요.' : '전문가 확인이 필요합니다.'}</b>`;
  showAiResult();
}

async function requestSpeciesIdentification(file) {
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', reject);
    reader.readAsDataURL(file);
  });
  const response = await fetch('/api/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `AI 서버 응답 오류 (${response.status})`);
  }
  return payload;
}

photoInput.addEventListener('change', () => {
  const [file] = photoInput.files;
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    photoInput.value = '';
    showToast('사진은 3MB 이하로 올려 주세요.');
    return;
  }
  previewImage.src = URL.createObjectURL(file);
  previewImage.hidden = false;
  showToast('사진이 준비되었습니다. “AI로 종 후보 확인하기”를 눌러 분석하세요.');
});

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const [file] = photoInput.files;
  if (!file) {
    showToast('먼저 발견 사진을 올려 주세요.');
    return;
  }
  const submitButton = reportForm.querySelector('.submit-button');
  submitButton.disabled = true;
  submitButton.textContent = '사진을 분석하고 있습니다…';
  try {
    const result = await requestSpeciesIdentification(file);
    renderAiResult(result, 'Gemini');
    if (locationState) refreshSearchForecast(true);
    showToast('AI 후보를 받았습니다. 신고 전 전문가 검토가 필요합니다.');
  } catch (error) {
    renderAiResult({
      candidates: [
        { name_ko: 'AI 판별을 완료하지 못했습니다', confidence: 0, features: [error.message] },
      ],
      needs_expert_review: true,
      safety_message: 'API 키 또는 Gemini 모델 설정을 확인한 뒤 다시 시도해 주세요.',
    }, 'Error');
    showToast(`AI 판별 오류: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'AI로 종 후보 확인하기 <span>→</span>';
  }
  document.querySelector('#aiCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

filters.forEach((filter) => {
  filter.addEventListener('click', () => {
    filters.forEach((button) => button.classList.remove('active'));
    filter.classList.add('active');
    const selected = filter.dataset.filter;
    pins.forEach((pin) => {
      pin.classList.toggle('hidden-pin', selected !== 'all' && pin.dataset.type !== selected);
    });
  });
});

const locationInput = document.querySelector('#location');
const locationSearch = document.querySelector('#locationSearch');
const locationStatus = document.querySelector('#locationStatus');
const BUSAN_STATIONS = [
  // 공공 API 응답의 예보지점 좌표(2026-08 확인)입니다.
  { code: '21LTC01', name: '태종대 남측', latitude: 35.04375, longitude: 129.09069 },
  { code: '21LTC02', name: '북형제도 남측', latitude: 34.91127, longitude: 128.96002 },
  { code: '21LTC03', name: '가덕도 남서측', latitude: 34.99244, longitude: 128.78133 },
  { code: '21LTC04', name: '부산항 신항', latitude: 35.064, longitude: 128.78019 },
];
const MAP_CENTER = [35.1796, 129.0756];
let discoveryMap;
let searchMap;
let discoveryMarker;
let searchLayers;
let locationState;

const speciesProfiles = {
  '붉은불가사리': { driftRatio: 0.8, selfMoveKmh: 0.03, label: '저서성 불가사리 잠정 계수' },
  '빗살무늬담치': { driftRatio: 0.9, selfMoveKmh: 0, label: '부착성 패류 잠정 계수' },
  '유령멍게': { driftRatio: 0.9, selfMoveKmh: 0, label: '부착성 피낭류 잠정 계수' },
  default: { driftRatio: 0.75, selfMoveKmh: 0.02, label: '미확정 종 기본 잠정 계수' },
};

function compassDirection(degrees) {
  const names = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  return names[Math.round((Number(degrees) % 360) / 22.5) % 16];
}

function haversineKm(from, to) {
  const earthRadiusKm = 6371;
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function destinationPoint(start, bearingDeg, distanceKm) {
  const earthRadiusKm = 6371;
  const toRadians = (value) => value * Math.PI / 180;
  const toDegrees = (value) => value * 180 / Math.PI;
  const bearing = toRadians(bearingDeg);
  const latitude = toRadians(start.latitude);
  const longitude = toRadians(start.longitude);
  const angularDistance = distanceKm / earthRadiusKm;
  const targetLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance)
    + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
  const targetLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
  );
  return { latitude: toDegrees(targetLatitude), longitude: ((toDegrees(targetLongitude) + 540) % 360) - 180 };
}

function nearestStation(location) {
  return BUSAN_STATIONS
    .map((station) => ({ ...station, distanceKm: haversineKm(location, station) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function markerIcon(label, type = '') {
  return window.L.divIcon({
    className: '',
    html: `<span class="map-marker ${type}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function addBaseMap(map) {
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function initializeMaps() {
  if (!window.L) {
    locationStatus.textContent = '지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';
    return;
  }
  discoveryMap = window.L.map('discoveryMap', { scrollWheelZoom: false }).setView(MAP_CENTER, 11);
  searchMap = window.L.map('searchMap', { scrollWheelZoom: false }).setView(MAP_CENTER, 10);
  addBaseMap(discoveryMap);
  addBaseMap(searchMap);
  searchLayers = window.L.layerGroup().addTo(searchMap);
  BUSAN_STATIONS.forEach((station) => {
    window.L.marker([station.latitude, station.longitude], { icon: markerIcon('조', 'station') })
      .addTo(discoveryMap)
      .bindPopup(`<b>${station.name}</b><br />조류예보 지점 (${station.code})`);
  });
  discoveryMap.on('click', (event) => {
    setDiscoveryLocation({ latitude: event.latlng.lat, longitude: event.latlng.lng }, '지도에서 선택한 지점');
  });
}

function calculateSearchDistance(current) {
  const profile = speciesProfiles[primarySpecies.textContent.trim()] || speciesProfiles.default;
  const reportedAt = new Date(foundAtInput.value);
  const elapsedHours = Number.isNaN(reportedAt.getTime()) ? 0 : Math.max(0, (Date.now() - reportedAt.getTime()) / 3_600_000);
  const speedKmh = Number(current.speedCms) * 0.036;
  const currentDistance = speedKmh * elapsedHours * profile.driftRatio;
  const activeDistance = profile.selfMoveKmh * elapsedHours;
  return {
    elapsedHours,
    direction: compassDirection(current.directionDeg),
    distanceKm: currentDistance + activeDistance,
    profile,
  };
}

async function loadLiveCurrent(stationCode) {
  const response = await fetch(`/api/current?obsCode=${encodeURIComponent(stationCode)}`);
  if (!response.ok) throw new Error('실시간 조류 API를 사용할 수 없습니다.');
  return response.json();
}

function drawSearchMap(location, station, calculation) {
  if (!searchMap || !searchLayers) return;
  searchLayers.clearLayers();
  const destination = destinationPoint(location, calculation.directionDeg, calculation.distanceKm);
  const firstSearchPoint = destinationPoint(location, calculation.directionDeg, calculation.distanceKm * 0.55);
  const originLatLng = [location.latitude, location.longitude];
  const destinationLatLng = [destination.latitude, destination.longitude];
  window.L.marker(originLatLng, { icon: markerIcon('발') }).addTo(searchLayers).bindPopup('<b>발견 지점</b>');
  window.L.marker([station.latitude, station.longitude], { icon: markerIcon('조', 'station') }).addTo(searchLayers)
    .bindPopup(`<b>사용 조류예보 지점</b><br />${station.name} · ${station.distanceKm.toFixed(1)} km`);
  window.L.polyline([originLatLng, destinationLatLng], { color: '#0a7187', weight: 4, dashArray: '8 8' }).addTo(searchLayers);
  const originRangeRadius = Math.max(3000, calculation.distanceKm * 900);
  const destinationRangeRadius = Math.max(2100, calculation.distanceKm * 650);
  window.L.circle(originLatLng, { radius: originRangeRadius, color: '#ef735f', weight: 1, fillColor: '#f48b78', fillOpacity: 0.2 }).addTo(searchLayers)
    .bindPopup(`<b>예상 이동 범위</b><br />출발 지점 주변 약 ${(originRangeRadius / 1000).toFixed(1)} km`);
  window.L.circle(destinationLatLng, { radius: destinationRangeRadius, color: '#ef735f', weight: 1, fillColor: '#f48b78', fillOpacity: 0.15 }).addTo(searchLayers);
  window.L.marker([firstSearchPoint.latitude, firstSearchPoint.longitude], { icon: markerIcon('1', 'search') }).addTo(searchLayers)
    .bindPopup('<b>1차 수색 우선 지점</b><br />발견 지점과 예상 도착 지점 사이 구간');
  window.L.marker(destinationLatLng, { icon: markerIcon('2', 'search') }).addTo(searchLayers)
    .bindPopup(`<b>2차 수색 우선 지점</b><br />예상 이동 거리 ${calculation.distanceKm.toFixed(1)} km`);
  searchMap.fitBounds(window.L.latLngBounds([originLatLng, destinationLatLng, [station.latitude, station.longitude]]), { padding: [35, 35], maxZoom: 14 });
}

function setDiscoveryLocation(location, label) {
  locationState = { ...location, label };
  const nearest = nearestStation(locationState);
  locationInput.value = label === '지도에서 선택한 지점'
    ? `지도 선택: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
    : label;
  locationStatus.textContent = `선택 좌표 ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} · 가장 가까운 조류예보 지점: ${nearest.name} (${nearest.distanceKm.toFixed(1)} km)`;
  if (discoveryMap) {
    if (discoveryMarker) discoveryMarker.remove();
    discoveryMarker = window.L.marker([location.latitude, location.longitude], { icon: markerIcon('발') }).addTo(discoveryMap).bindPopup('<b>발견 지점</b>').openPopup();
    discoveryMap.setView([location.latitude, location.longitude], 14);
  }
  refreshSearchForecast(true);
}

async function refreshSearchForecast(silent = false) {
  if (!locationState) {
    if (!silent) showToast('먼저 지도에서 발견 지점을 선택하거나 주소를 검색해 주세요.');
    return;
  }
  const station = nearestStation(locationState);
  recalculate.disabled = true;
  recalculate.textContent = '계산 중…';
  try {
    const liveData = await loadLiveCurrent(station.code);
    const calculation = calculateSearchDistance(liveData.current);
    calculation.directionDeg = Number(liveData.current.directionDeg);
    const actualStation = { ...station, name: liveData.current.stationName || station.name, latitude: liveData.current.latitude || station.latitude, longitude: liveData.current.longitude || station.longitude };
    const speedCms = Number(liveData.current.speedCms);
    const isSlackWater = speedCms < 0.05;
    document.querySelector('#currentValue').textContent = isSlackWater
      ? `정조 ${speedCms.toFixed(1)} cm/s`
      : `${calculation.direction} ${speedCms.toFixed(1)} cm/s`;
    document.querySelector('#elapsedValue').textContent = `${calculation.elapsedHours.toFixed(1)}시간`;
    document.querySelector('#distanceValue').textContent = `${calculation.distanceKm.toFixed(1)} km`;
    forecastStation.textContent = `${actualStation.name} (${station.distanceKm.toFixed(1)} km) · ${liveData.current.predictedAt} 기준`;
    forecastDisclaimer.textContent = `※ 발견 좌표에서 가장 가까운 공공 조류예보 지점(${actualStation.name}, ${station.distanceKm.toFixed(1)} km)의 유향·유속을 적용했습니다.${isSlackWater ? ' 현재 응답은 정조(유속 0 cm/s)이므로 넓은 불확실성 범위만 표시합니다.' : ''} ${calculation.profile.label}(${Math.round(calculation.profile.driftRatio * 100)}% 표류)와 ${calculation.elapsedHours.toFixed(1)}시간 경과를 반영한 수색 우선 위치이며, 실제 이동 경로를 확정하지 않습니다.`;
    drawSearchMap(locationState, actualStation, calculation);
    if (!silent) showToast('발견 좌표와 가장 가까운 조류예보 지점으로 수색 위치를 계산했습니다.');
  } catch (error) {
    forecastDisclaimer.textContent = '※ 조류예보 API 값을 불러오지 못했습니다. 잠시 후 다시 계산해 주세요.';
    if (!silent) showToast('조류예보 API 값을 불러오지 못했습니다.');
  } finally {
    recalculate.disabled = false;
    recalculate.textContent = '공공 API 값 불러오기 ↻';
  }
}

recalculate.addEventListener('click', () => refreshSearchForecast());

locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('이 기기에서는 현재 위치 기능을 사용할 수 없습니다.');
    return;
  }
  locationStatus.textContent = '현재 위치 권한을 확인하고 있습니다…';
  navigator.geolocation.getCurrentPosition(
    (position) => setDiscoveryLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }, '현재 위치'),
    () => { locationStatus.textContent = '현재 위치를 받지 못했습니다. 지도 클릭 또는 주소 검색을 이용해 주세요.'; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

locationSearch.addEventListener('click', async () => {
  const query = locationInput.value.trim();
  if (!query) {
    showToast('검색할 발견 장소를 입력해 주세요.');
    return;
  }
  locationSearch.disabled = true;
  locationSearch.textContent = '검색 중…';
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const place = await response.json();
    if (!response.ok) throw new Error(place.error || '주소를 찾지 못했습니다.');
    setDiscoveryLocation({ latitude: place.latitude, longitude: place.longitude }, place.displayName);
  } catch (error) {
    locationStatus.textContent = '주소를 찾지 못했습니다. 지도에서 직접 발견 지점을 클릭해 주세요.';
    showToast(error.message);
  } finally {
    locationSearch.disabled = false;
    locationSearch.textContent = '주소 검색';
  }
});

initializeMaps();

uploadZone.addEventListener('dragover', (event) => { event.preventDefault(); uploadZone.style.borderColor = '#168c83'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
