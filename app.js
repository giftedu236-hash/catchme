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
const forecastSection = document.querySelector('#forecast');
const elapsedValue = document.querySelector('#elapsedValue');
const foundAtInput = document.querySelector('#foundAt');
const rolePortal = document.querySelector('#rolePortal');
const roleButtons = document.querySelectorAll('[data-role]');
const homeButton = document.querySelector('#homeButton');
const adminNav = document.querySelector('#adminNav');
const adminDashboard = document.querySelector('#adminDashboard');
const adminBack = document.querySelector('#adminBack');
const adminReportList = document.querySelector('#adminReportList');
const adminReportCount = document.querySelector('#adminReportCount');
const adminPriorityCount = document.querySelector('#adminPriorityCount');
const adminLatestTime = document.querySelector('#adminLatestTime');
const clearReports = document.querySelector('#clearReports');
const receiptModal = document.querySelector('#receiptModal');
const receiptDescription = document.querySelector('#receiptDescription');
const receiptHome = document.querySelector('#receiptHome');
const receiptAdmin = document.querySelector('#receiptAdmin');
const mainView = document.querySelector('main');
const REPORT_STORAGE_KEY = 'badaJikimiBusanReportsV1';
let reportElapsedTimer;
let activeReportCreatedAt;

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

function getStoredReports() {
  try {
    const reports = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) || '[]');
    return Array.isArray(reports) ? reports : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function formatReportTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function updateReportElapsedClock() {
  if (!activeReportCreatedAt) {
    elapsedValue.textContent = '신고 전';
    return;
  }
  const submittedAt = new Date(activeReportCreatedAt).getTime();
  const totalSeconds = Number.isFinite(submittedAt)
    ? Math.max(0, Math.floor((Date.now() - submittedAt) / 1000))
    : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  elapsedValue.textContent = `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
}

function startReportElapsedClock(createdAt) {
  activeReportCreatedAt = createdAt || null;
  window.clearInterval(reportElapsedTimer);
  updateReportElapsedClock();
  if (activeReportCreatedAt) reportElapsedTimer = window.setInterval(updateReportElapsedClock, 1000);
}

function renderAdminDashboard() {
  const reports = getStoredReports();
  startReportElapsedClock(reports[0]?.createdAt);
  const priorityReports = reports.filter((report) => Number(report.confidence) >= 70);
  adminReportCount.textContent = reports.length;
  adminPriorityCount.textContent = priorityReports.length;
  adminLatestTime.textContent = reports[0] ? formatReportTime(reports[0].createdAt) : '-';
  if (!reports.length) {
    adminReportList.innerHTML = '<div class="admin-empty"><b>아직 접수된 신고가 없습니다.</b><span>신고자 화면에서 사진 분석 후 신고를 접수하면 이곳에 표시됩니다.</span></div>';
    return;
  }
  const latestLocatedReport = reports.find((report) => Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude)));
  if (latestLocatedReport) restoreLatestReportSearch(latestLocatedReport);
  adminReportList.innerHTML = reports.map((report) => {
    const priority = Number(report.confidence) >= 70;
    const coordinates = Number.isFinite(Number(report.latitude)) ? `${Number(report.latitude).toFixed(5)}, ${Number(report.longitude).toFixed(5)}` : '좌표 미선택';
    return `<article class="admin-report"><div class="admin-report-id"><span>${escapeHtml(report.id)}</span><b>${formatReportTime(report.createdAt)}</b></div><div class="admin-report-main"><h3>${escapeHtml(report.species)} <small>AI 후보 ${Number(report.confidence || 0)}%</small></h3><p><b>발견 장소</b> ${escapeHtml(report.location)}</p><p><b>수색 기준</b> ${escapeHtml(report.station || '조류 정보 계산 전')}</p><div class="admin-report-meta"><span>좌표 ${coordinates}</span><span>발견 ${escapeHtml(report.foundAt || '-')}</span><span>${escapeHtml(report.current || '조류 정보 없음')}</span></div></div><span class="${priority ? 'priority-tag' : 'review-tag'}">${priority ? '우선 확인' : '전문가 검토'}</span></article>`;
  }).join('');
}

function saveReport(result) {
  const first = Array.isArray(result.candidates) ? result.candidates[0] || {} : {};
  const reports = getStoredReports();
  const report = {
    id: `BM-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
    species: first.name_ko || primarySpecies.textContent.trim() || '판별 불가',
    confidence: Number(first.confidence) || 0,
    location: locationState?.label || locationInput.value.trim() || '장소 미입력',
    latitude: locationState?.latitude,
    longitude: locationState?.longitude,
    foundAt: foundAtInput.value,
    station: forecastStation.textContent.trim(),
    current: document.querySelector('#currentValue').textContent.trim(),
  };
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify([report, ...reports].slice(0, 30)));
  startReportElapsedClock(report.createdAt);
  return report;
}

function openPortal() {
  receiptModal.hidden = true;
  adminDashboard.hidden = true;
  mainView.dataset.view = 'portal';
  rolePortal.hidden = false;
  document.body.classList.add('portal-open');
  window.location.hash = '#home';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function refreshVisibleMaps({ discovery = false, search = false } = {}) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (discovery && discoveryMap) discoveryMap.invalidateSize({ pan: false });
      if (search && searchMap) searchMap.invalidateSize({ pan: false });
    });
  });
}

function openReporter(target = '#report') {
  rolePortal.hidden = true;
  receiptModal.hidden = true;
  adminDashboard.hidden = true;
  mainView.dataset.view = 'reporter';
  document.body.classList.remove('portal-open');
  if (target) window.location.hash = target;
  refreshVisibleMaps({ discovery: true });
}

function openManager() {
  rolePortal.hidden = true;
  receiptModal.hidden = true;
  adminDashboard.hidden = false;
  mainView.dataset.view = 'admin';
  document.body.classList.remove('portal-open');
  renderAdminDashboard();
  window.location.hash = '#admin';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshVisibleMaps({ search: true });
}

function showReceipt(report) {
  receiptDescription.textContent = `${report.id} · ${report.species} 신고가 접수되었습니다. 관리자 분석 화면에서 우선순위를 확인할 수 있습니다.`;
  receiptModal.hidden = false;
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
    if (locationState) await refreshSearchForecast(true);
    const report = saveReport(result);
    showReceipt(report);
    showToast('신고가 접수되었습니다.');
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
    submitButton.innerHTML = 'AI 분석 후 신고 접수하기 <span>→</span>';
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
let discoverySearchCircle;
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
  const originLatLng = [location.latitude, location.longitude];
  const destinationLatLng = [destination.latitude, destination.longitude];
  window.L.marker(originLatLng, { icon: markerIcon('발') }).addTo(searchLayers).bindPopup('<b>발견 지점</b>');
  window.L.marker([station.latitude, station.longitude], { icon: markerIcon('조', 'station') }).addTo(searchLayers)
    .bindPopup(`<b>사용 조류예보 지점</b><br />${station.name} · ${station.distanceKm.toFixed(1)} km`);
  window.L.polyline([originLatLng, destinationLatLng], { color: '#0a7187', weight: 4, dashArray: '8 8' }).addTo(searchLayers);
  const destinationRangeRadius = Math.max(3000, calculation.distanceKm * 750);
  const searchRangeCircle = window.L.circle(destinationLatLng, {
    radius: destinationRangeRadius,
    color: '#e75847',
    weight: 2,
    fillColor: '#f28a7c',
    fillOpacity: 0.32,
  }).addTo(searchLayers)
    .bindPopup(`<b>예상 수색 위치</b><br />중심에서 약 ${(destinationRangeRadius / 1000).toFixed(1)} km 범위`);
  searchRangeCircle.bringToFront();
  if (discoveryMap) {
    if (discoverySearchCircle) discoverySearchCircle.remove();
    discoverySearchCircle = window.L.circle(destinationLatLng, {
      radius: destinationRangeRadius,
      color: '#e75847',
      weight: 2,
      fillColor: '#f28a7c',
      fillOpacity: 0.32,
    }).addTo(discoveryMap)
      .bindPopup(`<b>예상 수색 위치</b><br />중심에서 약 ${(destinationRangeRadius / 1000).toFixed(1)} km 범위`);
    discoverySearchCircle.bringToFront();
    discoveryMap.fitBounds(discoverySearchCircle.getBounds(), { padding: [28, 28], maxZoom: 14 });
  }
  const mapBounds = window.L.latLngBounds([originLatLng, [station.latitude, station.longitude]]);
  mapBounds.extend(searchRangeCircle.getBounds());
  searchMap.fitBounds(mapBounds, { padding: [35, 35], maxZoom: 14 });
}

function drawFallbackSearchMap(location) {
  if (!window.L || !searchMap || !searchLayers) return;
  const originLatLng = [location.latitude, location.longitude];
  const fallbackRadius = 3000;
  searchLayers.clearLayers();
  window.L.marker(originLatLng, { icon: markerIcon('발') }).addTo(searchLayers)
    .bindPopup('<b>발견 지점</b>');
  const fallbackCircle = window.L.circle(originLatLng, {
    radius: fallbackRadius,
    color: '#e75847',
    weight: 2,
    fillColor: '#f28a7c',
    fillOpacity: 0.32,
  }).addTo(searchLayers)
    .bindPopup('<b>예상 수색 위치</b><br />발견 지점 주변 약 3.0 km 범위');
  fallbackCircle.bringToFront();
  searchMap.fitBounds(fallbackCircle.getBounds(), { padding: [35, 35], maxZoom: 14 });
  forecastSection.hidden = false;
  forecastStation.textContent = '발견 지점 주변 임시 수색 범위';
  document.querySelector('#currentValue').textContent = '조류 계산 중';
  document.querySelector('#distanceValue').textContent = '3.0 km 범위';
  forecastDisclaimer.textContent = '※ 조류 계산 전에도 현장 확인을 시작할 수 있도록 발견 지점 주변 3 km를 임시 수색 범위로 표시합니다.';
}

function restoreLatestReportSearch(report) {
  const latitude = Number(report.latitude);
  const longitude = Number(report.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (report.foundAt) foundAtInput.value = report.foundAt;
  if (report.species) primarySpecies.textContent = report.species;
  setDiscoveryLocation(
    { latitude, longitude },
    report.location || '최근 신고 위치',
  );
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
  drawFallbackSearchMap(locationState);
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
    forecastSection.hidden = false;
    const calculation = calculateSearchDistance(liveData.current);
    calculation.directionDeg = Number(liveData.current.directionDeg);
    const actualStation = { ...station, name: liveData.current.stationName || station.name, latitude: liveData.current.latitude || station.latitude, longitude: liveData.current.longitude || station.longitude };
    const speedCms = Number(liveData.current.speedCms);
    const isSlackWater = speedCms < 0.05;
    document.querySelector('#currentValue').textContent = isSlackWater
      ? `정조 ${speedCms.toFixed(1)} cm/s`
      : `${calculation.direction} ${speedCms.toFixed(1)} cm/s`;
    updateReportElapsedClock();
    document.querySelector('#distanceValue').textContent = `${calculation.distanceKm.toFixed(1)} km`;
    forecastStation.textContent = `${actualStation.name} (${station.distanceKm.toFixed(1)} km)`;
    forecastDisclaimer.textContent = `※ 발견 좌표에서 가장 가까운 공공 조류예보 지점(${actualStation.name}, ${station.distanceKm.toFixed(1)} km)의 유향·유속을 적용했습니다.${isSlackWater ? ' 현재 응답은 정조(유속 0 cm/s)이므로 넓은 불확실성 범위만 표시합니다.' : ''} ${calculation.profile.label}(${Math.round(calculation.profile.driftRatio * 100)}% 표류)와 ${calculation.elapsedHours.toFixed(1)}시간 경과를 반영한 수색 우선 위치이며, 실제 이동 경로를 확정하지 않습니다.`;
    drawSearchMap(locationState, actualStation, calculation);
    if (!silent) showToast('발견 좌표와 가장 가까운 조류예보 지점으로 수색 위치를 계산했습니다.');
  } catch (error) {
    drawFallbackSearchMap(locationState);
    forecastDisclaimer.textContent = '※ 조류 API 값을 불러오지 못해 발견 지점 주변 3 km를 임시 수색 범위로 표시합니다.';
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

roleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.role === 'manager') openManager();
    else openReporter('#report');
  });
});

homeButton.addEventListener('click', (event) => {
  event.preventDefault();
  openPortal();
});

adminNav.addEventListener('click', (event) => {
  event.preventDefault();
  openManager();
});

document.querySelectorAll('nav a[href="#report"], nav a[href="#map"], nav a[href="#guide"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openReporter(link.getAttribute('href'));
  });
});

adminBack.addEventListener('click', () => openReporter('#report'));
receiptHome.addEventListener('click', openPortal);
receiptAdmin.addEventListener('click', openManager);
clearReports.addEventListener('click', () => {
  if (!window.confirm('이 브라우저에 저장된 제출용 신고 기록을 모두 비울까요?')) return;
  localStorage.removeItem(REPORT_STORAGE_KEY);
  renderAdminDashboard();
  showToast('제출용 신고 기록을 비웠습니다.');
});

mainView.dataset.view = 'reporter';
document.body.classList.add('portal-open');
forecastSection.hidden = true;

uploadZone.addEventListener('dragover', (event) => { event.preventDefault(); uploadZone.style.borderColor = '#168c83'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
