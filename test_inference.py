"""Run each bundled sample through the same backend path used by the website."""

import os
from pathlib import Path

from backend import WORKSPACE_NAME, WORKFLOW_ID, inspect_image

if not (os.environ.get("es97dbNXOpNwQi2SbhxV") or "").strip():
    raise RuntimeError("Set es97dbNXOpNwQi2SbhxV before running this Roboflow connection check.")

print(f"Roboflow workflow: {WORKSPACE_NAME}/{WORKFLOW_ID}")
for filename in ("test_image3.jpg", "test_image2.jpg", "test_image.jpg"):
    image_path = Path(__file__).parent / filename
    if not image_path.is_file():
        raise FileNotFoundError(f"Sample image missing: {image_path}")
    result = inspect_image(
        image_path.read_bytes(),
        {"confidence": 35},
    )
    classes = {row["class"]: row["count"] for row in result["classCounts"]}
    print(
        f"{filename}: detections={result['total']}, good_class={result['good']}, "
        f"known_defect_class={result['defects']}, other_class={result['other']}, board_grade=NOT_VALIDATED, "
        f"mean_model_confidence={result['meanConfidence']}, classes={classes}"
    )
