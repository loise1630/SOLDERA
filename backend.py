"""SolderVision local HTTP API and static frontend server."""

from __future__ import annotations

import base64
import json
import os
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent


def load_local_env():
    """Load local secrets from .env without overriding process environment."""
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("\"").strip("'")
        key = key.strip()
        if key and not os.environ.get(key):
            os.environ[key] = value


load_local_env()


def configured_api_key(override: str | None = None) -> str:
    """Resolve the API key from the request, process environment, or local .env."""
    if override and str(override).strip():
        return str(override).strip()
    key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    if key:
        return key
    env_path = ROOT / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            name, separator, value = line.partition("=")
            if separator and name.strip() == "ROBOFLOW_API_KEY":
                return value.strip().strip("\"").strip("'")
    return ""

WORKSPACE_NAME = os.environ.get("ROBOFLOW_WORKSPACE", "raizas-workspace")
WORKFLOW_ID = os.environ.get(
    "ROBOFLOW_WORKFLOW_ID",
    "automated-optical-inspection-yolo-vautomated-optical-inspection-yolo-cbab0-1-rfdetr-small-t2-logic",
)
GOOD_CLASS = os.environ.get("ROBOFLOW_GOOD_CLASS", "GoodSoldering")
CLASS_METADATA = {
    "insufficient_solder": {"name": "Insufficient Solder"},
    "spike": {"name": "Solder Spike"},
    "Short": {"name": "Solder Bridge / Short"},
    "excess_solder": {"name": "Excess Solder"},
    "missing_component": {"name": "Missing Component"},
    "Missing_solder": {"name": "Missing Solder"},
    "BadSoldering": {"name": "Bad Soldering"},
    "TooBigSoldering": {"name": "Too Big Solder"},
    "NoSoldering": {"name": "No Solder"},
    "GoodSoldering": {"name": "Good Soldering"},
}
SAMPLES = {
    "test_image3.jpg": "Sample 1: Multi-joint Header",
    "test_image2.jpg": "Sample 2: Solder Spike Board",
    "test_image.jpg": "Sample 3: High-Density PCB",
}
EDUCATION_IMAGES = {"bad-solder.png", "good-solder.png", "howto.png"}
PUBLIC_IMAGE_PATHS = {f"/images/{name}" for name in EDUCATION_IMAGES} | {
    "/images/solderiron.png",
    "/images/assets/mainbg.png",
    "/images/assets/soldera.png",
    "/images/assets/soldering.png",
    "/images/assets/team/geraldsample1.jpg",
    "/images/assets/team/geraldsample2.jpg",
    "/images/assets/team/geraldsample3.jpg",
    "/images/assets/team/geraldsample4.jpg",
    "/images/assets/team/geraldsample5.jpg",
    "/images/assets/team/geraldsample6.jpg",
}


def grade_predictions(raw_predictions: list, confidence_percent: float) -> dict:
    """Filter and summarize model detections without claiming board quality."""
    threshold = float(confidence_percent) / 100
    if not 0 <= threshold <= 1:
        raise ValueError("Confidence threshold must be between 0 and 100 percent.")

    predictions = []
    for prediction in raw_predictions:
        if not isinstance(prediction, dict) or not isinstance(prediction.get("class"), str):
            continue
        try:
            confidence = float(prediction.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        if 0 <= confidence <= 1 and confidence >= threshold:
            predictions.append(prediction)

    counts = Counter(p["class"] for p in predictions)
    goods = counts.get(GOOD_CLASS, 0)
    defects = sum(n for cls, n in counts.items() if cls != GOOD_CLASS and cls in CLASS_METADATA)
    other = sum(n for cls, n in counts.items() if cls != GOOD_CLASS and cls not in CLASS_METADATA)
    total = len(predictions)
    # Prediction counts/confidence are not validated board-grade measurements.
    # Never infer PASS/FAIL or a quality percentage from them.
    score = None
    verdict = "NO DETECTIONS" if not total else "FINDINGS ONLY"
    confidences = [float(p["confidence"]) for p in predictions]
    return {
        "good": goods,
        "defects": defects,
        "other": other,
        "total": total,
        "qualityScore": score,
        "verdict": verdict,
        "gradeAvailable": score is not None,
        "gradeStatus": "unvalidated",
        "message": (
            "No detections returned. This does not confirm the board is defect-free."
            if not total else
            "Model detections only. Board-grade accuracy has not been validated."
        ),
        "confidenceThreshold": float(confidence_percent),
        "meanConfidence": round(sum(confidences) / len(confidences) * 100, 1) if confidences else None,
        "predictions": predictions,
        "classCounts": [
            {"class": cls, "name": CLASS_METADATA.get(cls, {}).get("name", cls), "count": count}
            for cls, count in counts.items()
        ],
    }


def inspect_image(image_bytes: bytes, settings: dict) -> dict:
    """Run the configured Roboflow workflow and return its scored detections."""
    try:
        from inference_sdk import InferenceConfiguration, InferenceHTTPClient
    except ImportError as exc:
        raise RuntimeError("Install the app requirements with: pip install -r requirements.txt") from exc

    api_key = configured_api_key(settings.get("apiKey"))
    if not api_key:
        raise ValueError("Roboflow API key is missing. Add it in Settings or set ROBOFLOW_API_KEY.")
    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com", api_key=api_key
    ).configure(InferenceConfiguration(api_key_transport="header"))

    # The SDK accepts a file path. A unique temporary file avoids collisions
    # between simultaneous browser requests.
    import tempfile

    if image_bytes.startswith(b"\xff\xd8\xff"):
        image_suffix = ".jpg"
    elif image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        image_suffix = ".png"
    elif image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        image_suffix = ".webp"
    else:
        raise ValueError("Image is not a valid JPG, PNG, or WEBP file.")

    tmp_name = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=image_suffix) as tmp:
            tmp.write(image_bytes)
            tmp_name = tmp.name
        result = client.run_workflow(
            workspace_name=WORKSPACE_NAME,
            workflow_id=WORKFLOW_ID,
            images={"image": tmp_name},
            use_cache=False,
        )
    finally:
        if tmp_name:
            Path(tmp_name).unlink(missing_ok=True)

    if not isinstance(result, list) or not result or not isinstance(result[0], dict):
        raise RuntimeError("Roboflow returned an empty or unexpected workflow response.")
    output = result[0].get("predictions")
    if not isinstance(output, dict) or not isinstance(output.get("predictions"), list):
        raise RuntimeError("Roboflow response has no predictions.predictions list; check the workflow output and ID.")
    raw = output["predictions"]
    return grade_predictions(raw, settings.get("confidence", 35))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, value: dict, status: int = 200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json({
                "ok": True,
                "roboflowKeyConfigured": bool(configured_api_key()),
                "workspaceConfigured": bool(WORKSPACE_NAME),
                "workflowConfigured": bool(WORKFLOW_ID),
            })
        if path == "/api/samples":
            return self.send_json({"samples": [{"file": f, "label": label} for f, label in SAMPLES.items()]})
        if path.startswith("/api/"):
            return self.send_json({"error": "Not found"}, 404)
        if path in PUBLIC_IMAGE_PATHS:
            self.path = path
        elif path == "/":
            self.path = "/index.html"
        elif path not in ("/index.html", "/styles.css", "/app.js") and Path(path).name not in SAMPLES:
            return self.send_error(404, "Not found")
        else:
            self.path = "/" + Path(path).name
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/analyze":
            return self.send_json({"error": "Not found"}, 404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 14 * 1024 * 1024:
                return self.send_json({"error": "Image request must be under 10 MB."}, 413)
            payload = json.loads(self.rfile.read(size))
            image_data = base64.b64decode(payload["image"].split(",", 1)[-1], validate=True)
            if len(image_data) > 10 * 1024 * 1024:
                return self.send_json({"error": "Image must be 10 MB or smaller."}, 413)
            valid_jpeg = image_data.startswith(b"\xff\xd8\xff")
            valid_png = image_data.startswith(b"\x89PNG\r\n\x1a\n")
            valid_webp = image_data.startswith(b"RIFF") and image_data[8:12] == b"WEBP"
            if not (valid_jpeg or valid_png or valid_webp):
                return self.send_json({"error": "Choose a JPG, PNG, or WEBP image."}, 400)
            return self.send_json(inspect_image(image_data, payload.get("settings", {})))
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 502)


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8016"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"SolderVision running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
