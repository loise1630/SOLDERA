# 1. Import the library
from inference_sdk import InferenceHTTPClient, InferenceConfiguration

# 2. Connect to your workflow
client = InferenceHTTPClient(
    api_url="https://serverless.roboflow.com",
    api_key="es97dbNXOpNwQi2SbhxV"
).configure(InferenceConfiguration(
    api_key_transport="header"  # header-based auth (inference v1.5.0+)
))

# 3. Run your workflow on an image
result = client.run_workflow(
    workspace_name="raiza-mae-digan",
    workflow_id="automated-optical-inspection-yolo-vautomated-optical-inspection-yolo-cbab0-1-rfdetr-small-t1-logic",
    images={
        "image": "YOUR_IMAGE.jpg" # Path to your image file
    },
    use_cache=True # Speeds up repeated requests
)

# 4. Get your results
print(result)
