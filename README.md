# SolderVision

The interface is a standalone HTML/CSS/JavaScript frontend. `backend.py` serves it and provides the local Roboflow inference API; no Streamlit runtime is used.

## Run locally

1. Install the backend dependency: `& 'C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe' -m pip install -r requirements.txt`
2. Start the server: `& 'C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe' backend.py`
3. Open <http://127.0.0.1:8000>.

The backend calls the configured Roboflow workflow for every image. It reads `ROBOFLOW_API_KEY` from a local `.env` file or process environment; the website Settings key overrides it. `ROBOFLOW_WORKSPACE`, `ROBOFLOW_WORKFLOW_ID`, and `ROBOFLOW_GOOD_CLASS` can override the default workflow and its good-class label. Inspection history and preferences are stored in the browser. Keep `.env` private; it is excluded by `.gitignore` and the web server does not serve it.

The application reports filtered model detections and their classes only. It never turns class counts or model confidence into a board quality percentage or PASS/FAIL result. Model confidence is the inference model's score, not a measured probability that its finding is correct. No detections means only that the workflow returned none above the selected confidence filter; it does not mean the board is defect-free. The included photos have no ground-truth annotations, so the model's accuracy cannot be established from them. Establishing accuracy requires a representative, independently labeled validation set and comparison of model outputs against those annotations; a reliable board grade also requires validating that the workflow measures all relevant joints and defects. Roboflow supports uploading images with annotations for dataset curation and validation ([Roboflow dataset documentation](https://docs.roboflow.com/adding-data/object-detection)). Until that work is done, the UI marks board grade as unavailable.

To check the live Roboflow connection and run all three bundled sample images, set `ROBOFLOW_API_KEY` and run `python test_inference.py`. It prints the class counts actually returned by the workflow for each sample.
