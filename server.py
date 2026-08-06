"""바다지킴이 부산: Vercel 없이 로컬에서 실행하는 API 서버.

실행 전 .env.example을 복사해 .env.local을 만들고 API 키를 직접 입력하세요.
이 파일은 키를 저장하거나 외부로 전송하지 않으며, 브라우저가 요청한 사진만 Gemini에 전달합니다.
"""

from __future__ import annotations

import base64
import json
import os
import re
import urllib.parse
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 3 * 1024 * 1024
CURRENT_ENDPOINT = "https://apis.data.go.kr/1192136/crntFcstFldEbb/GetCrntFcstFldEbbApiService"
IDENTIFICATION_PROMPT = """
You are assisting with reports of suspected invasive marine species in Busan, South Korea.
Analyze only visually supported facts. Never say a species is confirmed.
Return strict JSON only with this shape:
{
  "candidates":[
    {"name_ko":"Korean common name or a broad Korean taxon","scientific_name":"scientific name if known","confidence":0,"features":["visible feature"]},
    {"name_ko":"second candidate","scientific_name":"","confidence":0,"features":[]},
    {"name_ko":"third candidate","scientific_name":"","confidence":0,"features":[]}
  ],
  "needs_expert_review":true,
  "safety_message":"Short Korean safety guidance"
}
Use Korean text. If the image is unclear or is not a marine organism, make the first name "판별 불가" and confidence 0.
"""


def load_local_env() -> None:
    """Reads only .env.local beside this script; it is excluded from Git."""
    env_file = PROJECT_DIR / ".env.local"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def json_response(handler: SimpleHTTPRequestHandler, status: int, data: dict) -> None:
    encoded = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(encoded)))
    handler.end_headers()
    handler.wfile.write(encoded)


def decode_data_url(value: str) -> tuple[str, str] | None:
    match = re.fullmatch(r"data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)", value or "")
    if not match:
        return None
    try:
        if len(base64.b64decode(match.group(2), validate=True)) > MAX_IMAGE_BYTES:
            return ("too_large", "")
    except ValueError:
        return None
    return match.group(1), match.group(2)


def model_json(text: str) -> dict:
    cleaned = re.sub(r"^```json\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    return json.loads(cleaned)


def as_item_list(items: object) -> list[dict]:
    if isinstance(items, list):
        return items
    if isinstance(items, dict) and isinstance(items.get("item"), list):
        return items["item"]
    if isinstance(items, dict) and isinstance(items.get("item"), dict):
        return [items["item"]]
    return []


def normalize_current(payload: dict) -> dict:
    root = payload.get("response", payload)
    header = root.get("header", {})
    if str(header.get("resultCode")) != "00":
        raise ValueError(f"API_{header.get('resultCode', 'UNKNOWN')}")
    body = root.get("body", {})
    items = as_item_list(body.get("items", {}))
    if not items or "crdir" not in items[0] or "crsp" not in items[0]:
        raise ValueError("FORECAST_FIELDS_MISSING")
    item = items[0]
    return {
        "stationName": item.get("obsvtrNm", "이름 없는 예보지점"),
        "longitude": float(item.get("lot", 0)),
        "latitude": float(item.get("lat", 0)),
        "predictedAt": item.get("predcDt", ""),
        "directionDeg": float(item["crdir"]),
        "speedCms": float(item["crsp"]),
    }


class AppHandler(SimpleHTTPRequestHandler):
    """Serves the static app and safely proxies the two secret-key APIs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:
        # Avoid writing uploaded image data or API keys into the terminal log.
        print("[바다지킴이] " + format % args)

    def read_json_body(self) -> dict | None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 4_500_000:
                return None
            return json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return None

    def do_POST(self) -> None:
        if self.path != "/api/identify":
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "찾을 수 없는 API입니다."})
            return

        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key or api_key.startswith("replace_"):
            json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": ".env.local에 GEMINI_API_KEY를 입력해 주세요."})
            return

        body = self.read_json_body()
        image = decode_data_url(body.get("image", "") if body else "")
        if image is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "JPG, PNG, WebP 사진을 보내 주세요."})
            return
        if image[0] == "too_large":
            json_response(self, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "사진은 3MB 이하로 올려 주세요."})
            return

        mime_type, image_data = image
        model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model, safe='')}:generateContent?key={urllib.parse.quote(api_key, safe='')}"
        payload = {
            "contents": [{"parts": [{"text": IDENTIFICATION_PROMPT}, {"inlineData": {"mimeType": mime_type, "data": image_data}}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
        }
        request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=40) as remote:
                response_data = json.loads(remote.read().decode("utf-8"))
            text = next(part["text"] for part in response_data["candidates"][0]["content"]["parts"] if "text" in part)
            json_response(self, HTTPStatus.OK, model_json(text))
        except Exception:
            json_response(self, HTTPStatus.BAD_GATEWAY, {"error": "Gemini 판별 중 오류가 발생했습니다. 키와 네트워크를 확인해 주세요."})

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/current":
            super().do_GET()
            return

        service_key = os.environ.get("DATA_GO_KR_SERVICE_KEY", "")
        if not service_key or service_key.startswith("replace_"):
            json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": ".env.local에 DATA_GO_KR_SERVICE_KEY를 입력해 주세요."})
            return

        query = urllib.parse.parse_qs(parsed.query)
        obs_code = re.sub(r"[^A-Za-z0-9]", "", query.get("obsCode", ["21LTC01"])[0])
        if not obs_code:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "올바른 obsCode가 필요합니다."})
            return

        params = urllib.parse.urlencode({
            "serviceKey": urllib.parse.unquote(service_key),
            "type": "json",
            "pageNo": "1",
            "numOfRows": "10",
            "obsCode": obs_code,
        })
        try:
            with urllib.request.urlopen(f"{CURRENT_ENDPOINT}?{params}", timeout=20) as remote:
                payload = json.loads(remote.read().decode("utf-8"))
            current = normalize_current(payload)
            json_response(self, HTTPStatus.OK, {"obsCode": obs_code, "source": "국립해양조사원 조류예보 API", "current": current})
        except urllib.error.HTTPError as error:
            # The public API's error body helps diagnose approval/parameter problems,
            # but the request URL (which contains the secret key) is never returned.
            try:
                provider_message = error.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                provider_message = ""
            json_response(self, HTTPStatus.BAD_GATEWAY, {
                "error": "조류예보 API가 요청을 거절했습니다.",
                "status": error.code,
                "providerMessage": provider_message,
            })
        except Exception as error:
            json_response(self, HTTPStatus.BAD_GATEWAY, {
                "error": "조류예보 API 데이터를 불러오지 못했습니다.",
                "code": str(error)[:80] if isinstance(error, ValueError) else type(error).__name__,
            })


if __name__ == "__main__":
    load_local_env()
    print("바다지킴이 부산을 http://localhost:8080 에서 엽니다.")
    print("종 판별을 사용하려면 .env.local에 GEMINI_API_KEY를 입력하세요.")
    ThreadingHTTPServer(("127.0.0.1", 8080), AppHandler).serve_forever()
