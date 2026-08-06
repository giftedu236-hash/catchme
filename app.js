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
  resultLabel.textContent = source === 'Gemini' ? 'Gemini가 사진 특징을 분석했어요' : '시연용 사진 특징 분석 결과입니다';
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
  if (!response.ok) throw new Error('판별 API를 사용할 수 없습니다.');
  return response.json();
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
    showToast('AI 후보를 받았습니다. 신고 전 전문가 검토가 필요합니다.');
  } catch (error) {
    renderAiResult({
      candidates: [
        { name_ko: '붉은불가사리', confidence: 78, features: ['붉은 주황색', '두꺼운 팔', '거친 표면'] },
        { name_ko: '불가사리류' }, { name_ko: '해변말미잘류' },
      ],
      needs_expert_review: true,
      safety_message: '배포 전에는 시연용 결과가 표시됩니다.',
    });
    showToast('AI 서버를 찾지 못해 시연용 결과를 표시했습니다.');
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

const forecasts = [
  ['북동 1.4 kt', '6시간', '4.8 km'],
  ['동북동 1.1 kt', '4시간', '3.1 km'],
  ['남동 0.8 kt', '8시간', '4.2 km'],
];
let forecastIndex = 0;

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

function resizeSearchRange(distanceKm) {
  const scale = Math.min(1.65, Math.max(0.65, distanceKm / 5));
  document.querySelector('.range-one').style.transform = `rotate(-36deg) scale(${scale})`;
  document.querySelector('.range-two').style.transform = `rotate(-36deg) scale(${scale})`;
}

async function loadLiveCurrent() {
  const response = await fetch('/api/current?obsCode=21LTC01');
  if (!response.ok) throw new Error('실시간 조류 API를 사용할 수 없습니다.');
  return response.json();
}

recalculate.addEventListener('click', async () => {
  recalculate.disabled = true;
  recalculate.textContent = '불러오는 중…';
  forecastIndex = (forecastIndex + 1) % forecasts.length;
  const [current, elapsed, distance] = forecasts[forecastIndex];
  try {
    const liveData = await loadLiveCurrent();
    const calculation = calculateSearchDistance(liveData.current);
    document.querySelector('#currentValue').textContent = `${calculation.direction} ${Number(liveData.current.speedCms).toFixed(1)} cm/s`;
    document.querySelector('#elapsedValue').textContent = `${calculation.elapsedHours}시간`;
    document.querySelector('#distanceValue').textContent = `${calculation.distanceKm.toFixed(1)} km`;
    forecastStation.textContent = `${liveData.current.stationName} · ${liveData.current.predictedAt} 기준`;
    document.querySelector('.direction-label').textContent = `${calculation.direction} 방향`;
    forecastDisclaimer.textContent = `※ 공공 API 유향·유속으로 계산했습니다. ${calculation.profile.label}(${Math.round(calculation.profile.driftRatio * 100)}% 표류)와 발견 시각부터 현재까지 ${calculation.elapsedHours.toFixed(1)}시간 경과를 적용한 수색 우선 범위입니다.`;
    resizeSearchRange(calculation.distanceKm);
    showToast('공공 API가 제공한 유향·유속으로 수색 범위를 계산했습니다.');
  } catch (error) {
    document.querySelector('#currentValue').textContent = current;
    document.querySelector('#elapsedValue').textContent = elapsed;
    document.querySelector('#distanceValue').textContent = distance;
    forecastStation.textContent = '태종대 남측 예보지점 기준';
    forecastDisclaimer.textContent = '※ 공공 API가 현재 값을 반환하지 않아 예시 값을 표시 중입니다. API가 정상 응답하면 실제 유향·유속으로 자동 계산됩니다.';
    showToast('공공 API가 현재 값을 반환하지 않아 예시 값을 표시합니다.');
  } finally {
    recalculate.disabled = false;
    recalculate.textContent = '공공 API 값 불러오기 ↻';
  }
});

locationButton.addEventListener('click', () => {
  document.querySelector('#location').value = '부산광역시 기장군 대변항 인근 (예시 위치)';
  showToast('시연용 위치를 입력했습니다. 실제 서비스에서는 사용자 동의 후 GPS를 사용합니다.');
});

uploadZone.addEventListener('dragover', (event) => { event.preventDefault(); uploadZone.style.borderColor = '#168c83'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
