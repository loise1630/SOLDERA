const $ = (id) => document.getElementById(id);
const FILE_LIMIT = 10 * 1024 * 1024;

let selectedFile = null;
let selectedName = "";
let settings = readSettings();

const themeToggle = $("theme-toggle");
function setNightMode(enabled, persist = true) {
  const theme = enabled ? "night" : "day";
  document.documentElement.dataset.theme = theme;
  if (theme === "day") delete document.documentElement.dataset.theme;
  if (themeToggle) {
    const label = enabled ? "Turn off night mode" : "Turn on night mode";
    themeToggle.setAttribute("aria-pressed", String(enabled));
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", enabled ? "#10151a" : "#f5f6f7");
  if (persist) {
    try { localStorage.setItem("solderaTheme", theme); } catch { /* Storage can be unavailable in private browsing. */ }
  }
}

let savedTheme = "day";
try { savedTheme = localStorage.getItem("solderaTheme") || "day"; } catch { /* Use the light theme when storage is unavailable. */ }
setNightMode(savedTheme === "night", false);
themeToggle?.addEventListener("click", () => {
  setNightMode(document.documentElement.dataset.theme !== "night");
});

/* ---------- Intro sequence ---------- */
document.body.classList.add("splash-active");

(function runSplash() {
  const splash = $("splash-screen");
  if (!splash) {
    document.body.classList.remove("splash-active");
    document.body.classList.add("landing-reveal");
    return;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SHOW_MS = reduced ? 900 : 5400; // drawing ends ~4.7s, short hold, then fade
  const FLIGHT_MS = reduced ? 1 : 1350;
  const started = performance.now();
  let finished = false;

  async function finish() {
    if (finished) return;
    finished = true;

    const source = splash.querySelector(".splash-logo-frame");
    const target = document.querySelector(".site-brand img");
    const sourceImage = source?.querySelector("img");

    if (source && target && sourceImage) {
      const from = source.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const flight = document.createElement("div");
      const logo = sourceImage.cloneNode();

      flight.className = "logo-flight-frame";
      flight.setAttribute("aria-hidden", "true");
      logo.alt = "";
      flight.append(logo);
      Object.assign(flight.style, {
        left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`
      });
      document.body.append(flight);
      document.body.classList.add("cinematic-flight", "landing-reveal");
      splash.classList.add("is-leaving");

      try {
        if (typeof flight.animate === "function") {
          const movement = flight.animate([
            { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` },
            { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` }
          ], {
            duration: FLIGHT_MS,
            easing: "cubic-bezier(.22,.78,.22,1)",
            fill: "forwards"
          });
          movement.finished.catch(() => {});
          await new Promise((resolve) => window.setTimeout(resolve, FLIGHT_MS + 40));
        }
      } catch {
        // A cancelled animation still completes the transition into the real hero logo.
      }

      flight.remove();
      document.body.classList.remove("cinematic-flight", "splash-active");
      splash.remove();
      return;
    }

    document.body.classList.add("landing-reveal");
    splash.classList.add("is-leaving");
    window.setTimeout(() => {
      splash.remove();
      document.body.classList.remove("splash-active");
    }, FLIGHT_MS);
  }

  function schedule() {
    const wait = Math.max(0, SHOW_MS - (performance.now() - started));
    window.setTimeout(finish, wait);
  }

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule);
})();

/* ---------- Backend status ---------- */
fetch("/api/health")
  .then((response) => {
    if (!response.ok) throw new Error("Backend unavailable");
    return response.json();
  })
  .then((status) => {
    const label = $("engine-status-text");
    const dot = $("engine-status");
    if (label) label.textContent = status.roboflowKeyConfigured ? "Roboflow ready" : "API key required";
    if (dot) dot.style.background = status.roboflowKeyConfigured ? "#69bd8a" : "#e0a44e";
  })
  .catch(() => {
    const label = $("engine-status-text");
    if (label) label.textContent = "Backend unavailable";
  });

function readSettings() {
  const defaults = {
    confidence: 35,
    apiKey: "",
    showLabels: true,
    showConfidence: true,
    boxWidth: 3
  };

  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("solderVisionSettings") || "{}") };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  settings = {
    confidence: Number($("confidence").value),
    apiKey: $("api-key").value.trim(),
    showLabels: $("show-labels").checked,
    showConfidence: $("show-confidence").checked,
    boxWidth: Number($("box-width").value)
  };

  localStorage.setItem("solderVisionSettings", JSON.stringify(settings));
  $("saved-label").textContent = "Saved";
  window.setTimeout(() => {
    $("saved-label").textContent = "";
  }, 1800);
}

function showError(message = "") {
  $("error-message").textContent = message;
  $("error-message").classList.toggle("hidden", !message);
}

function setFile(file, name = file?.name || "") {
  showError();
  if (!file) return;

  const validType = /^image\/(jpeg|png|webp)$/i.test(file.type);
  const validExtension = /\.(jpe?g|png|webp)$/i.test(name);

  if (!validType && !validExtension) {
    showError("Choose a JPG, PNG, or WEBP image.");
    return;
  }

  if (file.size > FILE_LIMIT) {
    showError("Image must be 10 MB or smaller.");
    return;
  }

  selectedFile = file;
  selectedName = name;

  const preview = $("preview");
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  image.onload = () => {
    preview.width = image.naturalWidth;
    preview.height = image.naturalHeight;

    const ctx = preview.getContext("2d");
    ctx.clearRect(0, 0, preview.width, preview.height);
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(objectUrl);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    showError("This image could not be opened. Try another file.");
  };

  image.src = objectUrl;

  preview.classList.remove("hidden");
  $("drop-content").classList.add("hidden");
  $("file-caption").textContent = `${name} · ${(file.size / 1048576).toFixed(2)} MB`;
  $("file-caption").classList.remove("hidden");
  $("analyze-button").disabled = false;
  $("result-subtitle").textContent = "Ready when you are. Select analyze to inspect this board.";
}

$("file-input").addEventListener("change", (event) => {
  setFile(event.target.files[0]);
});

const cameraDialog = $("camera-dialog");
const cameraVideo = $("camera-video");
const cameraDeviceField = $("camera-device-field");
const cameraDeviceSelect = $("camera-device");
const cameraFileInput = $("camera-file-input");
let cameraStream = null;
let cameraRequest = 0;
let preferredCameraId = "";
const mobileCamera = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function stopCamera() {
  cameraRequest += 1;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
}
function resetCameraReview() {
  cameraVideo.hidden = false;
  $("camera-capture").hidden = true;
  $("camera-live-controls").hidden = false;
  $("camera-review-controls").hidden = true;
  cameraDeviceSelect.disabled = false;
}
function showCameraError(error) {
  const message = error?.name === "NotAllowedError"
    ? "Camera permission was denied. Allow camera access in your browser, then try again."
    : error?.name === "NotFoundError"
      ? "No camera was found on this device. You can still choose an image to upload."
      : error?.name === "NotReadableError"
        ? "The camera is already in use by another app. Close it and try again."
        : "Could not start this camera. Choose another device or check your camera permissions.";
  $("camera-error").textContent = message;
}
async function refreshCameraDevices(activeId) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
    cameraDeviceSelect.replaceChildren(...devices.map((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      return option;
    }));
    cameraDeviceField.hidden = devices.length < 2;
    if (activeId && devices.some((device) => device.deviceId === activeId)) cameraDeviceSelect.value = activeId;
  } catch {
    cameraDeviceField.hidden = true;
  }
}
async function startCamera(deviceId = "") {
  const selectedDeviceId = deviceId || preferredCameraId;
  const request = ++cameraRequest;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  $("camera-error").textContent = "";
  resetCameraReview();

  const video = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : mobileCamera ? { facingMode: { ideal: "environment" } } : {})
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    if (!cameraDialog.open || request !== cameraRequest) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = stream;
    cameraVideo.srcObject = stream;
    await cameraVideo.play();
    const activeId = stream.getVideoTracks()[0]?.getSettings?.().deviceId || selectedDeviceId;
    preferredCameraId = activeId || "";
    await refreshCameraDevices(activeId);
  } catch (error) {
    if (request === cameraRequest && cameraDialog.open) showCameraError(error);
  }
}

$("take-photo-button").addEventListener("click", async () => {
  $("camera-error").textContent = "";
  resetCameraReview();
  cameraDialog.showModal();
  if (!navigator.mediaDevices?.getUserMedia) {
    if (mobileCamera) {
      cameraDialog.close();
      cameraFileInput.value = "";
      cameraFileInput.click();
      return;
    }
    $("camera-error").textContent = "This browser blocks live camera access here. Open SOLDERA on HTTPS or localhost, or upload an image instead.";
    return;
  }
  await startCamera();
});

cameraDeviceSelect.addEventListener("change", () => {
  if (cameraDeviceSelect.value) startCamera(cameraDeviceSelect.value);
});
function useCapturedFile(file) {
  if (!file) return;
  const supported = /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (supported && file.size <= FILE_LIMIT) {
    setFile(file, file.name || `soldera-photo-${Date.now()}.jpg`);
    return;
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        showError("This camera photo could not be prepared. Try taking it again as JPG.");
        return;
      }
      const normalized = new File([blob], `soldera-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFile(normalized, normalized.name);
    }, "image/jpeg", 0.92);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showError("This photo format is not supported by the browser. Try JPG, PNG or WEBP.");
  };
  image.src = url;
}
cameraFileInput.addEventListener("change", () => useCapturedFile(cameraFileInput.files?.[0]));
$("capture-photo").addEventListener("click", () => {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    $("camera-error").textContent = "Camera is still starting. Try again in a moment.";
    return;
  }
  const canvas = $("camera-capture");
  const scale = Math.min(1, 1920 / Math.max(cameraVideo.videoWidth, cameraVideo.videoHeight));
  canvas.width = Math.round(cameraVideo.videoWidth * scale);
  canvas.height = Math.round(cameraVideo.videoHeight * scale);
  canvas.getContext("2d").drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  cameraVideo.hidden = true;
  canvas.hidden = false;
  $("camera-live-controls").hidden = true;
  $("camera-review-controls").hidden = false;
  cameraDeviceSelect.disabled = true;
  $("camera-error").textContent = "";
});
$("retake-photo").addEventListener("click", () => {
  resetCameraReview();
  $("camera-error").textContent = "";
});
$("use-photo").addEventListener("click", () => {
  $("camera-capture").toBlob((blob) => {
    if (!blob) {
      $("camera-error").textContent = "Could not prepare the photo. Please retake it.";
      return;
    }
    const photo = new File([blob], `soldera-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    stopCamera();
    cameraDialog.close();
    setFile(photo, photo.name);
  }, "image/jpeg", 0.92);
});
$("camera-close").addEventListener("click", () => cameraDialog.close());
cameraDialog.addEventListener("close", stopCamera);
$("dropzone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("dropzone").classList.add("dragover");
});

$("dropzone").addEventListener("dragleave", () => {
  $("dropzone").classList.remove("dragover");
});

$("dropzone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("dropzone").classList.remove("dragover");
  setFile(event.dataTransfer.files[0]);
});

$("sample-select").addEventListener("change", async (event) => {
  if (!event.target.value) return;

  try {
    const response = await fetch(`/${encodeURIComponent(event.target.value)}`);
    if (!response.ok) throw new Error("Sample image could not be loaded.");

    const blob = await response.blob();
    const file = new File([blob], event.target.value, {
      type: blob.type || "image/jpeg"
    });

    setFile(file, event.target.value);
  } catch (error) {
    showError(error.message);
  }
});

$("analyze-button").addEventListener("click", async () => {
  if (!selectedFile) return;

  const button = $("analyze-button");
  button.disabled = true;
  button.classList.add("loading");
  button.textContent = "Analyzing�";
  showError();

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Unable to read this image."));
      reader.readAsDataURL(selectedFile);
    });

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, settings })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed.");

    renderResult(result);
    drawAnnotations(result.predictions || []);
    saveHistory(result);
  } catch (error) {
    showError(error.message || "Analysis failed. Check the backend connection and API settings.");
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
    button.textContent = "Analyze Soldering Quality";
  }
});

function calculateOverallGrade(result) {
  const good = Math.max(0, Number(result.good) || 0);
  const defects = Math.max(0, Number(result.defects) || 0);
  const classified = good + defects;
  return classified ? Math.round((good / classified) * 100) : null;
}

function renderResult(result) {
  $("good-count").textContent = result.good ?? 0;
  $("defect-count").textContent = result.defects ?? 0;
  $("total-count").textContent = result.total ?? 0;
  const overallGrade = calculateOverallGrade(result);
  $("quality-score").textContent = overallGrade == null ? "N/A" : `${overallGrade}%`;
  $("summary-quality-score").textContent = overallGrade == null ? "N/A" : `${overallGrade}%`;
  $("summary-good-count").textContent = result.good ?? 0;
  $("summary-defect-count").textContent = result.defects ?? 0;
  $("summary-total-count").textContent = result.total ?? 0;
  $("summary-subtitle").textContent = `Inspection complete � ${selectedName}`;

  const verdict = $("verdict");
  const notice = result.total
    ? "Model detections only. Board-grade accuracy has not been validated."
    : "No detections returned. This does not confirm the board is defect-free.";

  const confidenceNote = result.meanConfidence == null
    ? ""
    : ` Mean detection confidence: ${result.meanConfidence}% (not measured accuracy).`;

  verdict.className = "verdict warning";
  verdict.textContent = `${result.verdict || "Analysis complete"}: ${notice}${confidenceNote}`;

  $("results-empty").classList.add("hidden");
  $("result-subtitle").textContent = `Inspection complete · ${selectedName}`;

  const details = $("details");

  if (Array.isArray(result.classCounts) && result.classCounts.length) {
    details.innerHTML = `
      <h3>Detected class breakdown</h3>
      <table class="detail-table">
        <thead><tr><th>Detection class</th><th>Count</th></tr></thead>
        <tbody>
          ${result.classCounts.map((row) => `
            <tr><td>${escapeHtml(row.name)}</td><td>${Number(row.count) || 0}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
    details.classList.remove("hidden");
  } else {
    details.classList.add("hidden");
    details.innerHTML = "";
  }
}

function drawAnnotations(predictions) {
  const canvas = $("preview");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  // Redraw the original image before adding boxes, preventing duplicate outlines.
  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const colors = {
      GoodSoldering: "#22c55e",
      Short: "#ef4444",
      insufficient_solder: "#0ecdb4",
      spike: "#875bff",
      excess_solder: "#ef4567",
      BadSoldering: "#ef4444",
      TooBigSoldering: "#f97316",
      NoSoldering: "#dc2626",
      Missing_solder: "#f97316",
      missing_component: "#06a6d2"
    };

    predictions.forEach((prediction) => {
      const boxWidth = Number(prediction.width || 0);
      const boxHeight = Number(prediction.height || 0);
      const x = Number(prediction.x || 0) - boxWidth / 2;
      const y = Number(prediction.y || 0) - boxHeight / 2;
      const color = colors[prediction.class] || "#477bff";

      ctx.lineWidth = Number(settings.boxWidth || 3);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, boxWidth, boxHeight);

      const label = [
        settings.showLabels ? prediction.class : "",
        settings.showConfidence
          ? `${Math.round(Number(prediction.confidence || 0) * 100)}%`
          : ""
      ].filter(Boolean).join(" · ");

      if (label) {
        ctx.font = `bold ${Math.max(12, Math.round(width / 90))}px Inter, sans-serif`;
        const labelHeight = Math.max(16, Math.round(width / 60));
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = color;
        ctx.fillRect(x, Math.max(0, y - labelHeight), textWidth + 10, labelHeight);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + 5, Math.max(labelHeight - 4, y - 4));
      }
    });

    const findingsPhoto = $("findings-photo");
    if (findingsPhoto) findingsPhoto.src = canvas.toDataURL("image/png");
  };

  image.src = canvas.toDataURL("image/png");
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function saveHistory(result) {
  let rows = [];

  try {
    rows = JSON.parse(localStorage.getItem("solderVisionHistory") || "[]");
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }

  rows.unshift({
    name: selectedName,
    date: new Date().toLocaleString(),
    score: calculateOverallGrade(result),
    verdict: result.verdict,
    defects: result.defects
  });

  localStorage.setItem("solderVisionHistory", JSON.stringify(rows.slice(0, 50)));
}

function renderHistory() {
  const list = $("history-list");
  let rows = [];

  try {
    rows = JSON.parse(localStorage.getItem("solderVisionHistory") || "[]");
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }

  list.innerHTML = rows.length
    ? rows.map((row) => {
        const status = row.verdict === "NO DETECTIONS" ? "NO DETECTIONS" : "FINDINGS ONLY";
        return `
          <div class="history-row">
            <span>
              <b>${escapeHtml(row.name || "Board inspection")}</b>
              <small>${escapeHtml(row.date)} · ${Number(row.defects) || 0} known defect-class detections · Overall grade: ${row.score == null ? "N/A" : `${Number(row.score)}% (detection ratio)`} · Not validated</small>
            </span>
            <span class="pill">${status}</span>
          </div>
        `;
      }).join("")
    : '<p class="results-empty">No inspections yet. Analyze a board to start your history.</p>';
}

/* ---------- Workspace navigation ---------- */
const homeView = $("home-view");
const uploadSection = $("inspection-view");
if (homeView && uploadSection) homeView.append(uploadSection);

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    const homeView = $("home-view");
    if (button.dataset.view === "inspection") {
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view === homeView));
      homeView?.classList.remove("upload-only");
      document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item === button));
      uploadSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    document.body.classList.remove("upload-view-active");
    if (button.dataset.sectionLink && button.dataset.forceView !== "true") {
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view === homeView));
      document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item === button));
      document.getElementById(button.dataset.sectionLink)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    document.querySelectorAll(".nav-link").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active", view.id === `${button.dataset.view}-view`);
    });

    if (button.dataset.view === "history") renderHistory();
    if (!button.dataset.scrollTo) window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

function updateLandingSectionNav() {
  const homeView = $("home-view");
  const uploadSection = $("inspection-view");
  if (!homeView?.classList.contains("active") || !uploadSection) return;

  const marker = window.innerHeight * 0.5;
  const uploadBounds = uploadSection.getBoundingClientRect();
  const uploadIsActive = uploadBounds.top <= marker && uploadBounds.bottom > marker;
  document.body.classList.toggle("upload-view-active", uploadIsActive);
  if (uploadIsActive) {
    document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === "inspection"));
    return;
  }

  const aboutSection = $("about-section");
  if (!aboutSection) return;
  const bounds = aboutSection.getBoundingClientRect();
  const aboutIsActive = bounds.top <= marker && bounds.bottom > marker;
  document.querySelectorAll(".nav-link[data-view='home'], .nav-link[data-section-link='about-section']").forEach((link) => {
    link.classList.toggle("active", link.dataset.sectionLink === "about-section" ? aboutIsActive : !aboutIsActive);
  });
}

window.addEventListener("scroll", updateLandingSectionNav, { passive: true });
window.addEventListener("resize", updateLandingSectionNav, { passive: true });
updateLandingSectionNav();

document.querySelectorAll("[data-scroll-to]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    window.setTimeout(() => document.getElementById(control.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  });
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const navigationButton = document.querySelector(`.nav-link[data-view="${button.dataset.openView}"]`);
    if (!navigationButton) return;
    if (button.dataset.forceView === "true") navigationButton.dataset.forceView = "true";
    navigationButton.click();
    delete navigationButton.dataset.forceView;
  });
});

const featureCards = document.querySelectorAll("[data-feature-card]");
if (featureCards.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.body.classList.add("feature-motion");
  const featureObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16 });
  featureCards.forEach((card) => featureObserver.observe(card));
}
/* ---------- Meet the Team carousel ---------- */
(function initTeamCarousel() {
  const root = document.getElementById("tm-carousel");
  if (!root) return;

  const view = document.getElementById("about-view");
  const stage = document.getElementById("tm-stage");
  const summary = document.getElementById("tm-summary");
  const details = document.getElementById("tm-details");
  const socials = document.getElementById("tm-socials");
  const prevBtn = document.getElementById("tm-prev");
  const nextBtn = document.getElementById("tm-next");
  const backBtn = document.getElementById("tm-back");

  /* Palitan dito ang names, roles, bios, skills at photos */
  const team = [
    { name: "Gerald Loise Garcia", role: "Capstone Leader", education: "Bachelor of Science in Information Technology", school: "Technological University of the Philippines - Taguig", bio: "An aspiring Cloud and Network Engineer with knowledge of networking fundamentals, database management, and SQL. Continuously learning and expanding my skills in Cisco networking, cloud computing, database technologies, and data management. Passionate about technology, problem-solving, and continuously improving my technical skills to grow in the IT industry.", skills: ["NETWORKING", "CISCO", "SQL", "CLOUD COMPUTING", "DATABASE MANAGEMENT"], photo: "/images/assets/team/geraldsample1.jpg" },
    { name: "Daniel Reyes", role: "Founder & CEO", education: "Technology and Product Leadership", school: "SOLDERA Team", bio: "Bringing the team together to make solder inspection more approachable. Focused on product direction, collaboration, and building useful tools for learners and makers.", skills: ["LEADERSHIP", "PRODUCT", "STRATEGY"], photo: "/images/assets/team/geraldsample2.jpg" },
    { name: "Maria Santos", role: "Chief Technology Officer", education: "Computer Science", school: "SOLDERA Team", bio: "Connecting software, hardware, and machine learning into a dependable solder inspection experience. Enjoys turning complex ideas into practical systems.", skills: ["SOFTWARE", "SYSTEMS", "MACHINE LEARNING"], photo: "/images/assets/team/geraldsample3.jpg" },
    { name: "Kevin Dela Cruz", role: "Lead Engineer", education: "Computer Engineering", school: "SOLDERA Team", bio: "Building and refining the tools behind image capture, inspection, and results. Values clear engineering, reliable systems, and thoughtful problem solving.", skills: ["ENGINEERING", "PYTHON", "QUALITY"], photo: "/images/assets/team/geraldsample4.jpg" },
    { name: "Anna Mendoza", role: "Product Designer", education: "Design and Human-Computer Interaction", school: "SOLDERA Team", bio: "Making technical workflows easier to understand through clear layouts and friendly interactions. Focused on useful details and accessible product experiences.", skills: ["UI DESIGN", "PROTOTYPING", "RESEARCH"], photo: "/images/assets/team/geraldsample5.jpg" },
    { name: "Rafael Aquino", role: "AI Specialist", education: "Data Science and Artificial Intelligence", school: "SOLDERA Team", bio: "Exploring computer vision and model feedback to help users learn from each inspection. Interested in practical AI and responsible, understandable results.", skills: ["COMPUTER VISION", "AI", "DATA"], photo: "/images/assets/team/geraldsample6.jpg" }
  ];

  const N = team.length;
  let active = 0;
  let expanded = false;
  let swapToken = 0;

  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pad = (n) => String(n).padStart(2, "0");
  const initials = (name) => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const capIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6"/></svg>';

  /* ----- build cards + summary once ----- */
  stage.innerHTML = team.map((p, i) => `
    <button class="tm-card" type="button" data-i="${i}" data-pos="out-right" aria-label="${esc(p.name)}">
      <span class="tm-inner">
        <img src="${esc(p.photo)}" alt="${esc(p.name)}" draggable="false">
        <span class="tm-fallback" aria-hidden="true">${esc(initials(p.name))}</span>
        <span class="tm-shine" aria-hidden="true"></span>
        <span class="tm-hint">VIEW PROFILE</span>
      </span>
    </button>`).join("");

  summary.innerHTML = `
    <div class="tm-ident"><h2 class="tm-name"></h2><p class="tm-role"></p></div>
    <div class="tm-dots">${team.map((p, i) => `<button class="tm-dot" type="button" data-go="${i}" aria-label="Show ${esc(p.name)}"></button>`).join("")}</div>`;

  const cards = [...stage.querySelectorAll(".tm-card")];
  const dots = [...summary.querySelectorAll(".tm-dot")];
  const ident = summary.querySelector(".tm-ident");
  const nameEl = summary.querySelector(".tm-name");
  const roleEl = summary.querySelector(".tm-role");

  cards.forEach((card) => {
    card.querySelector("img").addEventListener("error", () => card.classList.add("photo-unavailable"), { once: true });
  });

  /* ----- positions: only left / center / right are visible ----- */
  function offsetOf(i) {
    let d = (i - active) % N;
    if (d < 0) d += N;
    if (d > N / 2) d -= N;
    return d;
  }
  const posName = (d) => (d === 0 ? "center" : d === -1 ? "left" : d === 1 ? "right" : d < 0 ? "out-left" : "out-right");

  function update() {
    cards.forEach((card, i) => {
      const d = offsetOf(i);
      card.dataset.pos = posName(d);
      card.tabIndex = Math.abs(d) <= 1 ? 0 : -1;
      card.setAttribute("aria-hidden", String(Math.abs(d) > 1));
      card.setAttribute("aria-expanded", String(d === 0 && expanded));
      card.querySelector(".tm-hint").textContent = d === 0 ? (expanded ? "BACK" : "VIEW PROFILE") : "SELECT";
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-on", i === active);
      dot.setAttribute("aria-current", i === active ? "true" : "false");
    });
  }

  function setIdentity(dir) {
    ident.style.setProperty("--dir", dir);
    ident.classList.remove("tm-swap");
    void ident.offsetWidth; // restart animation
    nameEl.textContent = team[active].name;
    roleEl.textContent = team[active].role;
    ident.classList.add("tm-swap");
  }

  /* ----- profile (photo 2) ----- */
  function profileHTML(index, dir) {
    const p = team[index];
    return `
      <article class="tm-profile" style="--dir:${dir}">
        <p class="tm-kicker" style="--i:0">PROFILE</p>
        <h2 style="--i:1">${esc(p.name)}</h2>
        <p class="tm-edu" style="--i:2">${capIcon}<span>${esc(p.education)}<br>at ${esc(p.school)}</span></p>
        <p class="tm-bio" style="--i:3">${esc(p.bio)}</p>
        <div class="tm-skills" style="--i:4">${p.skills.map((s, k) => `<span style="--k:${k}">${esc(s)}</span>`).join("")}</div>
        <small class="tm-count" style="--i:5">${pad(index + 1)} / ${pad(N)} · ${esc(p.role.toUpperCase())}</small>
      </article>`;
  }

  function swapProfile(dir) {
    const token = ++swapToken;
    const old = details.querySelector(".tm-profile");
    if (old) {
      old.style.setProperty("--dir", dir);
      old.classList.add("is-out");
    }
    window.setTimeout(() => {
      if (token !== swapToken) return;
      details.innerHTML = profileHTML(active, dir);
    }, old ? 240 : 0);
  }

  function setExpanded(value) {
    expanded = value;
    root.classList.toggle("is-expanded", value);
    details.setAttribute("aria-hidden", String(!value));
    socials.setAttribute("aria-hidden", String(!value));
    details.inert = !value;
    backBtn.tabIndex = value ? 0 : -1;
    if (value) {
      swapToken += 1;
      details.innerHTML = profileHTML(active, 0);
    }
    update();
  }

  /* ----- navigation ----- */
  function goTo(target, dir) {
    const next = ((target % N) + N) % N;
    if (next === active) return;
    if (dir === undefined) {
      let d = next - active;
      if (d > N / 2) d -= N;
      if (d < -N / 2) d += N;
      dir = d > 0 ? 1 : -1;
    }
    active = next;
    setIdentity(dir);
    update();
    if (expanded) swapProfile(dir);
  }
  const move = (step) => goTo(active + step, step);

  prevBtn.addEventListener("click", () => move(-1));
  nextBtn.addEventListener("click", () => move(1));
  backBtn.addEventListener("click", () => setExpanded(false));
  summary.addEventListener("click", (e) => {
    const dot = e.target.closest(".tm-dot");
    if (dot) goTo(Number(dot.dataset.go));
  });

  let swallowClick = false;
  stage.addEventListener("click", (e) => {
    if (swallowClick) return;
    const card = e.target.closest(".tm-card");
    if (!card) return;
    const pos = card.dataset.pos;
    if (pos === "center") setExpanded(!expanded);
    else if (pos === "left") move(-1);
    else if (pos === "right") move(1);
  });

  /* keyboard */
  document.addEventListener("keydown", (e) => {
    if (!view.classList.contains("active")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "Escape" && expanded) setExpanded(false);
  });

  /* mouse wheel / trackpad */
  let wheelSum = 0;
  let wheelUnlockAt = 0;
  document.addEventListener("wheel", (e) => {
    if (!view.classList.contains("active") || e.ctrlKey) return;
    const phoneTextScroll = window.matchMedia("(max-width: 700px)").matches && e.target instanceof Element && e.target.closest(".tm-details") && details.scrollHeight > details.clientHeight && Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    if (phoneTextScroll) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelUnlockAt) return;
    wheelSum += delta;
    if (Math.abs(wheelSum) >= 40) {
      move(wheelSum > 0 ? 1 : -1);
      wheelSum = 0;
      wheelUnlockAt = now + 300;
    }
  }, { passive: false, capture: true });

  /* swipe (touch / mouse drag) */
  let start = null;
  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tm-arrow, .tm-back, .tm-dot, .tm-details")) return;
    start = { x: e.clientX, y: e.clientY };
  });
  root.addEventListener("pointerup", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swallowClick = true;
      window.setTimeout(() => { swallowClick = false; }, 0);
      move(dx < 0 ? 1 : -1);
    }
  });
  root.addEventListener("pointercancel", () => { start = null; });

  /* close profile when leaving the page */
  new MutationObserver(() => {
    if (!view.classList.contains("active") && expanded) setExpanded(false);
  }).observe(view, { attributes: true, attributeFilter: ["class"] });

  /* start */
  setIdentity(0);
  update();
})();
const revealGroups = document.querySelectorAll("[data-scroll-reveal-group]");
if (revealGroups.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.body.classList.add("scroll-reveal-ready");
  const revealTargets = new Map();
  revealGroups.forEach((group) => {
    const targets = Array.from(group.children);
    revealTargets.set(group, targets);
    targets.forEach((target, index) => {
      target.classList.add("scroll-reveal-item");
      target.style.setProperty("--reveal-delay", `${index * 0.08}s`);
    });
  });

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      revealTargets.get(entry.target)?.forEach((target) => target.classList.add("is-scroll-revealed"));
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });
  revealGroups.forEach((group) => revealObserver.observe(group));
}
const landingHero = document.querySelector(".landing-hero");
if (landingHero && window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
  landingHero.addEventListener("pointermove", (event) => {
    const bounds = landingHero.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    landingHero.style.setProperty("--bg-x", `${x * 7}px`);
    landingHero.style.setProperty("--bg-y", `${y * 5}px`);
  });
  landingHero.addEventListener("pointerleave", () => {
    landingHero.style.setProperty("--bg-x", "0px");
    landingHero.style.setProperty("--bg-y", "0px");
  });
}

/* ---------- Settings initialization ---------- */
/* Vertical scroll carries the camera across the pinned field journey. */
(function initHowtoJourney() {
  const section = document.querySelector("#howto-journey");
  const track = section?.querySelector(".journey-track");
  const scenes = [...(section?.querySelectorAll("[data-journey-scene]") || [])];
  if (!section || !track || !scenes.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 760px)");
  const siteHeader = document.querySelector(".site-header");
  const currentLabel = section.querySelector(".journey-current");
  const progressFill = section.querySelector(".journey-progress-fill");
  let target = 0;
  let shown = 0;
  let scrollProgress = 0;
  let frame = 0;
  let previous = 0;
  let previousTime = 0;

  function readProgress() {
    if (!mobile.matches && !reduced.matches) section.style.height = `${(scenes.length + 3) * 100}vh`;
    const bounds = section.getBoundingClientRect();
    const inFocus = bounds.top < window.innerHeight * 0.9 && bounds.bottom > window.innerHeight + 1;
    siteHeader?.classList.toggle("journey-away", inFocus);
    if (mobile.matches || reduced.matches) {
      track.style.transform = "none";
      track.style.filter = "none";
      section.style.height = "auto";
      const anchor = section.querySelector(".journey-anchor");
      if (anchor) anchor.style.cssText = "";
      return;
    }
    const rect = bounds;
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    scrollProgress = Math.max(0, Math.min(1, -rect.top / travel));
    const introHold = 0.10;
    const outroHold = 0.10;
    target = Math.max(0, Math.min(1, (scrollProgress - introHold) / (1 - introHold - outroHold)));
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function animate(time) {
    frame = 0;
    const delta = target - shown;
    const elapsed = previousTime ? Math.min(48, time - previousTime) : 16;
    shown += delta * (1 - Math.exp(-elapsed / 82));
    if (Math.abs(delta) < 0.0006) shown = target;
    const movement = Math.abs(shown - previous) * (scenes.length - 1) * window.innerWidth;
    const x = shown * (scenes.length - 1) * 25;
    track.style.transform = `translate3d(-${x}%, 0, 0)`;
    track.style.filter = `blur(${Math.min(0.9, movement / 90)}px)`;
    previous = shown;
    previousTime = time;
    const anchor = section.querySelector(".journey-anchor");
    if (anchor) {
      const introFade = Math.max(0, Math.min(1, scrollProgress / 0.085));
      anchor.style.opacity = String(1 - introFade);
      anchor.style.transform = `translate3d(${-((anchor.offsetWidth || 390) + window.innerWidth * 0.05) * introFade}px, ${-10 * introFade}px, 0)`;
      anchor.style.filter = "none";
    }
    const active = Math.min(scenes.length - 1, Math.round(shown * (scenes.length - 1)));
    scenes.forEach((scene, index) => scene.classList.toggle("is-active", index === active));
    if (currentLabel) currentLabel.textContent = String(active + 1).padStart(2, "0");
    if (progressFill) progressFill.style.transform = `scaleX(${Math.max(0.2, shown)})`;
    if (shown !== target) frame = requestAnimationFrame(animate);
  }

  window.addEventListener("scroll", readProgress, { passive: true });
  window.addEventListener("resize", readProgress, { passive: true });
  mobile.addEventListener?.("change", readProgress);
  reduced.addEventListener?.("change", readProgress);
  readProgress();
})();

$("confidence").value = settings.confidence;
$("api-key").value = settings.apiKey;
$("show-labels").checked = settings.showLabels;
$("show-confidence").checked = settings.showConfidence;
$("box-width").value = settings.boxWidth;
$("box-width-value").value = settings.boxWidth;
$("confidence-value").value = `${settings.confidence}%`;

$("confidence").addEventListener("input", (event) => {
  $("confidence-value").value = `${event.target.value}%`;
});

$("box-width").addEventListener("input", (event) => {
  $("box-width-value").value = event.target.value;
});

$("save-settings").addEventListener("click", saveSettings);

/* ---------- Soldering iron cursor (minimal, monochrome) ----------
   default  -> outline soldering iron
   hover    -> tip fills in + thin ring pulse + small wiggle
              (buttons, links, inputs, dropzone)
   click    -> dab + colored sparks
   hold     -> press and hold anywhere (not on buttons), then drag to draw a fading spark trail
   The tip of the iron is the pointer hotspot.
   Only runs on devices with a mouse/trackpad. */
(function initSolderCursor() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const HOT_SELECTOR = [
    "a[href]",
    "button:not(:disabled)",
    "[role='button']",
    "select",
    "label[for]",
    "summary",
    "input[type='range']",
    "input[type='checkbox']",
    ".dropzone",
    ".choose-button"
  ].join(",");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cursor = document.createElement("div");
  cursor.className = "solder-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = `
    <div class="sc-body">
      <svg class="sc-svg" viewBox="0 0 120 120" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(6 114) rotate(-40)">
          <circle class="sc-ring" cx="0" cy="0" r="14"/>
          <path class="sc-tip" d="M0,0 L4,-2.8 L20,-4.2 V4.2 L4,2.8 Z"/>
          <path class="sc-sleeve" d="M20,-5.5 H46 V5.5 H20 Z"/>
          <path class="sc-collar" d="M46,-10 H52 V10 H46 Z"/>
          <path class="sc-grip" d="M52,-8 H91 Q99,-8 99,0 Q99,8 91,8 H52 Z"/>
        </g>
      </svg>
    </div>`;
  document.body.append(cursor);
  document.documentElement.classList.add("solder-cursor-on");

  let x = -100;
  let y = -100;
  let frame = 0;
  let visible = false;
  let dabTimer = 0;

  function paint() {
    frame = 0;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function move(event) {
    x = event.clientX;
    y = event.clientY;
    if (!visible) {
      visible = true;
      cursor.classList.add("is-visible");
    }
    if (!frame) frame = window.requestAnimationFrame(paint);
  }

  function spawn(className, px, py, vars, life) {
    const node = document.createElement("span");
    node.className = className;
    node.style.left = `${px}px`;
    node.style.top = `${py}px`;
    Object.entries(vars).forEach(([key, value]) => node.style.setProperty(key, value));
    document.body.append(node);
    window.setTimeout(() => node.remove(), life);
  }

  function spawnSparks(px, py) {
    spawn("solder-flash", px, py, {}, 450);
    spawn("solder-blob", px, py, {}, 750);

    // colored sparks fanning upward from the contact point
    const colors = ["#fff3c4", "#ffd36b", "#ffb43c", "#ff8a3d"];
    const count = reduced ? 5 : 12;
    const spread = 160; // degrees
    for (let i = 0; i < count; i += 1) {
      const angle = -spread / 2 + (spread / (count - 1)) * i + (Math.random() * 10 - 5);
      spawn("solder-spark", px, py, {
        "--a": `${angle}deg`,
        "--d": `${16 + Math.random() * 20}px`,
        "--len": `${6 + Math.random() * 6}px`,
        "--dur": `${380 + Math.random() * 220}ms`,
        "--c": colors[Math.floor(Math.random() * colors.length)]
      }, 700);
    }
  }

  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("dragover", move);

  document.addEventListener("pointerover", (event) => {
    const target = event.target;
    const hot = !!(target && target.closest && target.closest(HOT_SELECTOR));
    cursor.classList.toggle("is-hot", hot);
  });

  document.documentElement.addEventListener("mouseleave", () => {
    visible = false;
    cursor.classList.remove("is-visible", "is-hot");
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    x = event.clientX;
    y = event.clientY;
    paint();

    cursor.classList.remove("is-soldering");
    void cursor.offsetWidth; // restart the dab animation on rapid clicks
    cursor.classList.add("is-soldering");
    window.clearTimeout(dabTimer);
    dabTimer = window.setTimeout(() => cursor.classList.remove("is-soldering"), 500);

    spawnSparks(event.clientX, event.clientY);
  });

  /* ----- Hold-to-draw -----
     Press and hold anywhere (except buttons, links and inputs), then drag
     to draw a glowing spark trail. The trail fades away on its own. */
  const NO_DRAW_SELECTOR = `${HOT_SELECTOR}, input, textarea, [contenteditable='true']`;
  const HOLD_MS = 350;        // how long to hold before drawing starts
  const HOLD_TOLERANCE = 10;  // px of movement allowed while holding
  const TRAIL_LIFE = reduced ? 500 : 1000; // ms before the trail disappears
  const EMBER_COLORS = ["255,243,196", "255,211,107", "255,180,60", "255,138,61"];
  const LAYERS = [
    { color: "255,138,61", alpha: 0.32, width: 9 },   // soft outer glow
    { color: "255,190,70", alpha: 0.85, width: 4 },   // amber body
    { color: "255,246,205", alpha: 1, width: 1.6 }    // hot core
  ];

  const trail = document.createElement("canvas");
  trail.className = "solder-trail";
  trail.setAttribute("aria-hidden", "true");
  document.body.append(trail);
  const tctx = trail.getContext("2d");

  function sizeTrail() {
    const ratio = window.devicePixelRatio || 1;
    trail.width = Math.round(window.innerWidth * ratio);
    trail.height = Math.round(window.innerHeight * ratio);
    tctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  sizeTrail();
  window.addEventListener("resize", sizeTrail);

  const points = [];
  const embers = [];
  let drawing = false;
  let needBreak = true;
  let holdTimer = 0;
  let pressX = 0;
  let pressY = 0;
  let trailFrame = 0;
  let lastTick = 0;

  function addPoint(px, py, now) {
    const last = points[points.length - 1];
    if (last && !needBreak) {
      const dx = px - last.x;
      const dy = py - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      // fill gaps on fast strokes so the line stays smooth
      const steps = Math.floor(dist / 5);
      for (let s = 1; s <= steps; s += 1) {
        const f = s / (steps + 1);
        points.push({ x: last.x + dx * f, y: last.y + dy * f, t: now, brk: false });
      }
    }
    points.push({ x: px, y: py, t: now, brk: needBreak });
    needBreak = false;
  }

  function emitEmbers(px, py, now) {
    if (reduced) return;
    const count = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      embers.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 70,
        vy: -20 - Math.random() * 55,
        born: now,
        life: 350 + Math.random() * 350,
        size: 1 + Math.random() * 1.6,
        color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)]
      });
    }
  }

  function requestTrail() {
    if (!trailFrame) trailFrame = window.requestAnimationFrame(tick);
  }

  function tick(now) {
    trailFrame = 0;
    const dt = Math.min(0.05, (now - (lastTick || now)) / 1000);
    lastTick = now;

    while (points.length && now - points[0].t > TRAIL_LIFE) points.shift();
    for (let i = embers.length - 1; i >= 0; i -= 1) {
      const ember = embers[i];
      if (now - ember.born > ember.life) {
        embers.splice(i, 1);
        continue;
      }
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      ember.vy += 170 * dt; // gravity
    }

    tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    tctx.lineCap = "round";
    tctx.lineJoin = "round";

    // draw each glow layer; segments are grouped by age so the stroke stays smooth
    LAYERS.forEach((layer) => {
      let bucket = -1;
      let open = false;
      for (let i = 1; i < points.length; i += 1) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const k = 1 - (now - p1.t) / TRAIL_LIFE;
        if (p1.brk || k <= 0) {
          if (open) tctx.stroke();
          open = false;
          continue;
        }
        const b = Math.ceil(k * 8);
        if (!open || b !== bucket) {
          if (open) tctx.stroke();
          bucket = b;
          const kb = b / 8;
          tctx.strokeStyle = `rgba(${layer.color},${(layer.alpha * kb).toFixed(3)})`;
          tctx.lineWidth = Math.max(0.4, layer.width * (0.35 + 0.65 * kb));
          tctx.beginPath();
          tctx.moveTo(p0.x, p0.y);
          open = true;
        }
        tctx.lineTo(p1.x, p1.y);
      }
      if (open) tctx.stroke();
    });

    embers.forEach((ember) => {
      const a = 1 - (now - ember.born) / ember.life;
      tctx.fillStyle = `rgba(${ember.color},${(a * 0.28).toFixed(3)})`;
      tctx.beginPath();
      tctx.arc(ember.x, ember.y, ember.size * 3, 0, Math.PI * 2);
      tctx.fill();
      tctx.fillStyle = `rgba(${ember.color},${a.toFixed(3)})`;
      tctx.beginPath();
      tctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
      tctx.fill();
    });

    // glowing head at the iron tip while drawing
    if (drawing) {
      tctx.fillStyle = "rgba(255,138,61,0.35)";
      tctx.beginPath();
      tctx.arc(x, y, 7, 0, Math.PI * 2);
      tctx.fill();
      tctx.fillStyle = "rgba(255,246,205,1)";
      tctx.beginPath();
      tctx.arc(x, y, 2.4, 0, Math.PI * 2);
      tctx.fill();
    }

    if (drawing || points.length || embers.length) {
      trailFrame = window.requestAnimationFrame(tick);
    } else {
      tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      lastTick = 0;
    }
  }

  function startDrawing() {
    holdTimer = 0;
    drawing = true;
    needBreak = true;
    document.documentElement.classList.add("solder-drawing");
    cursor.classList.add("is-drawing");
    const selection = window.getSelection && window.getSelection();
    if (selection) selection.removeAllRanges();
    spawn("solder-flash", x, y, {}, 450);
    addPoint(x, y, performance.now());
    requestTrail();
  }

  function stopDrawing() {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    if (!drawing) return;
    drawing = false;
    needBreak = true;
    document.documentElement.classList.remove("solder-drawing");
    cursor.classList.remove("is-drawing");
    requestTrail(); // keep fading what is left
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (event.button !== 0) return;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    const target = event.target;
    if (target && target.closest && target.closest(NO_DRAW_SELECTOR)) return;
    pressX = event.clientX;
    pressY = event.clientY;
    holdTimer = window.setTimeout(startDrawing, HOLD_MS);
  });

  document.addEventListener("pointermove", (event) => {
    // moving before the hold time is a normal drag or text selection, not drawing
    if (holdTimer && Math.hypot(event.clientX - pressX, event.clientY - pressY) > HOLD_TOLERANCE) {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
    }
    if (!drawing) return;

    const selection = window.getSelection && window.getSelection();
    if (selection && selection.rangeCount) selection.removeAllRanges();

    const now = performance.now();
    const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    (samples.length ? samples : [event]).forEach((sample) => addPoint(sample.clientX, sample.clientY, now));
    emitEmbers(event.clientX, event.clientY, now);
    requestTrail();
  }, { passive: true });

  window.addEventListener("pointerup", stopDrawing);
  window.addEventListener("pointercancel", stopDrawing);
  window.addEventListener("blur", stopDrawing);
  document.addEventListener("selectstart", (event) => { if (drawing) event.preventDefault(); });
  document.addEventListener("dragstart", (event) => event.preventDefault());
})();


/* ---------- Upload section v3 ---------- */
(function initUploadStage() {
  const root = $("ux-root");
  const stage = $("dropzone");
  if (!root || !stage) return;

  const btn = $("analyze-button");
  const preview = $("preview");
  const caption = $("file-caption");
  const tag = $("ux-tag");
  const select = $("sample-select");
  const errorBox = $("error-message");
  const fileInput = $("file-input");
  const statusText = $("ux-status-text");
  const reticles = $("ux-reticles");
  const toast = $("ux-toast");
  const chips = document.querySelectorAll(".ux-sample");
  const findingsDialog = $("findings-dialog");
  const findingsButton = $("ux-findings-button");
  const resetButton = $("ux-reset-button");
  const steps = [...document.querySelectorAll("#ux-steps .ux-step")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches && !reduced;

  const TAGS = { idle: "Waiting for an image", ready: "Image locked · ready", scanning: "Scanning joints…", done: "Analysis complete" };
  const SCAN_LINES = ["Locating solder joints…", "Checking fillet shape…", "Looking for bridges…", "Measuring coverage…", "Scoring detections…"];
  const STEP_STATES = { idle: ["active", "todo", "todo"], ready: ["done", "active", "todo"], scanning: ["done", "busy", "todo"], done: ["done", "done", "active"] };

  let wasLoading = false, analyzed = false, prevState = null;

  /* ---------- helpers ---------- */
  function countUp(el, target, fmt = String, dur = 900) {
    if (reduced || !target) { el.textContent = fmt(target); return; }
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  let toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 3600);
  }

  function burst() {
    if (reduced) return;
    const ring = $("ux-ringwrap").getBoundingClientRect();
    const cx = ring.left + ring.width / 2;
    const cy = Math.min(Math.max(ring.top + ring.height / 2, 90), window.innerHeight - 90);
    const c = document.createElement("canvas");
    c.className = "ux-burst";
    c.width = window.innerWidth; c.height = window.innerHeight;
    document.body.append(c);
    const g = c.getContext("2d");
    const colors = ["#fff3c4", "#ffd36b", "#ffb43c", "#ff8a3d", "#ffffff"];
    const parts = Array.from({ length: 70 }, () => {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
      return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, life: 60 + Math.random() * 50, age: 0, len: 4 + Math.random() * 7, col: colors[Math.floor(Math.random() * colors.length)] };
    });
    (function frame() {
      g.clearRect(0, 0, c.width, c.height);
      let alive = false;
      parts.forEach((p) => {
        if (p.age > p.life) return;
        alive = true; p.age++;
        p.x += p.vx; p.y += p.vy; p.vy += .22; p.vx *= .985;
        g.globalAlpha = Math.max(0, 1 - p.age / p.life);
        g.strokeStyle = p.col; g.lineWidth = 2; g.lineCap = "round";
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * p.len / 4, p.y - p.vy * p.len / 4); g.stroke();
      });
      if (alive) requestAnimationFrame(frame); else c.remove();
    })();
  }

  /* ---------- bench stats (saved in this browser) ---------- */
  const STATS_KEY = "solderaStats";
  const RANKS = [
    { n: 0, name: "New solderer" }, { n: 1, name: "Apprentice" }, { n: 3, name: "Technician" },
    { n: 6, name: "Specialist" }, { n: 12, name: "Solder pro" }
  ];
  const rankOf = (boards) => RANKS.reduce((idx, r, k) => (boards >= r.n ? k : idx), 0);
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };

  function readStats() {
    try {
      const s = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
      return { boards: Number(s.boards) || 0, defects: Number(s.defects) || 0, best: s.best == null ? null : Number(s.best), streak: Number(s.streak) || 0, last: s.last || "" };
    } catch { return { boards: 0, defects: 0, best: null, streak: 0, last: "" }; }
  }
  function writeStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

  function renderStats() {
    const s = readStats();
    const best = s.best;
    const streakAlive = s.last === dayKey() || s.last === yesterdayKey();

    const [tone, label] =
      best == null ? ["idle", "No score yet"] :
      best >= 85 ? ["ok", "Excellent"] :
      best >= 70 ? ["ok", "Good"] :
      best >= 50 ? ["warn", "Fair"] :
      ["bad", "Needs work"];

    const rankEl = $("st-rank");
    rankEl.textContent = label;
    rankEl.dataset.tone = tone;
    $("st-boards").textContent = s.boards;
    $("st-defects").textContent = s.defects;
    $("st-best").textContent = best == null ? "\u2014" : `${best}%`;
    $("st-streak").textContent = streakAlive ? s.streak : 0;

    const pct = best == null ? 0 : Math.max(0, Math.min(100, best));
    $("st-fill").style.width = `${pct}%`;
    $("st-bar").setAttribute("aria-valuenow", String(Math.round(pct)));

    const r = rankOf(s.boards);
    if (r < RANKS.length - 1) {
      const need = RANKS[r + 1].n - s.boards;
      $("st-next").textContent = s.boards === 0
        ? "Check your first board to start your streak."
        : `${need} more board${need > 1 ? "s" : ""} to ${RANKS[r + 1].name}.`;
    } else {
      $("st-next").textContent = "Top rank reached. Keep that streak alive.";
    }
  }

  /* ---------- photo check (quick client-side estimate) ---------- */
  const pc = { light: $("pc-light"), focus: $("pc-focus"), size: $("pc-size") };
  const pcHint = $("pc-hint");
  const PC_DEFAULT = "A quick estimate of lighting, focus and size once you add a photo.";
  const setCheck = (li, tone, text) => { li.dataset.tone = tone; li.querySelector("b").textContent = text; };
  function resetCheck() {
    Object.values(pc).forEach((li) => setCheck(li, "idle", "\u2014"));
    pcHint.textContent = PC_DEFAULT;
  }

  function resetUpload() {
    if (btn.classList.contains("loading")) return;
    selectedFile = null;
    selectedName = "";
    fileInput.value = "";
    select.value = "";
    preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
    preview.classList.add("hidden");
    caption.textContent = "";
    caption.classList.add("hidden");
    $("drop-content").classList.remove("hidden");
    btn.disabled = true;
    btn.classList.remove("loading");
    btn.textContent = "Analyze Soldering Quality";
    showError();
    analyzed = false;
    resetCheck();
    $("findings-photo").removeAttribute("src");
    $("summary-quality-score").textContent = "0%";
    $("summary-good-count").textContent = "0";
    $("summary-defect-count").textContent = "0";
    $("summary-total-count").textContent = "0";
    $("summary-msg").textContent = "Your detected joint results will appear here.";
    $("summary-subtitle").textContent = "Upload a photo to see your inspection summary.";
    $("quality-score").textContent = "0%";
    $("good-count").textContent = "0";
    $("defect-count").textContent = "0";
    $("total-count").textContent = "0";
    for (const id of ["ux-ring-fg", "summary-ring-fg"]) $(id).style.strokeDashoffset = "326.73";
    if (findingsDialog.open) findingsDialog.close();
    sync();
  }

  resetButton.addEventListener("click", resetUpload);
  function evaluatePhoto(img) {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const scale = Math.min(1, 480 / Math.max(nw, nh));
    const w = Math.max(16, Math.round(nw * scale)), h = Math.max(16, Math.round(nh * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) { const l = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2]; lum[j] = l; sum += l; }
    const mean = sum / lum.length;
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      s += v; s2 += v * v; n++;
    }
    const variance = n ? s2 / n - (s / n) ** 2 : 0;
    const minSide = Math.min(nw, nh);

    const light = mean < 45 ? ["bad", "Too dark"] : mean < 85 ? ["warn", "A bit dim"] : mean > 205 ? ["warn", "Washed out"] : ["ok", "Good"];
    const focus = variance < 12 ? ["bad", "Looks blurry"] : variance < 40 ? ["warn", "Slightly soft"] : ["ok", "Sharp"];
    const size = minSide < 500 ? ["bad", "Low resolution"] : minSide < 900 ? ["warn", "Small"] : ["ok", "Good"];
    setCheck(pc.light, ...light); setCheck(pc.focus, ...focus); setCheck(pc.size, ...size);

    const tones = [light[0], focus[0], size[0]];
    pcHint.textContent = tones.includes("bad")
      ? "Retake if you can. A clearer photo gives the model more to work with."
      : tones.includes("warn")
        ? "Usable, but a closer, brighter or steadier shot may detect more joints."
        : "Looks good. Hit Analyze when you're ready.";
  }

  let checkToken = 0;
  function runPhotoCheck() {
    const file = selectedFile;
    const token = ++checkToken;
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (token !== checkToken) return;
      try { evaluatePhoto(img); } catch { resetCheck(); }
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  /* ---------- scanning effects ---------- */
  let scanTimer = 0, retTimer = 0, lineIdx = 0;
  function addReticle() {
    const r = document.createElement("i");
    r.className = "ux-ret";
    r.style.left = `${16 + Math.random() * 68}%`;
    r.style.top = `${20 + Math.random() * 58}%`;
    reticles.append(r);
    setTimeout(() => r.remove(), 1400);
  }
  function stopScan() {
    clearInterval(scanTimer); clearInterval(retTimer);
    scanTimer = retTimer = 0;
    reticles.innerHTML = "";
  }
  function startScan() {
    stopScan();
    lineIdx = 0;
    statusText.textContent = SCAN_LINES[0];
    scanTimer = setInterval(() => { lineIdx = (lineIdx + 1) % SCAN_LINES.length; statusText.textContent = SCAN_LINES[lineIdx]; }, 1300);
    if (!reduced) { addReticle(); retTimer = setInterval(addReticle, 520); }
  }

  /* ---------- when an analysis finishes ---------- */
  function onDone() {
    const raw = $("quality-score").textContent.trim();
    const score = /^\d+/.test(raw) ? parseInt(raw, 10) : null;
    const counts = ["good-count", "defect-count", "total-count"].map((id) => [$(id), Number($(id).textContent) || 0]);

    const s = readStats();
    const rankBefore = rankOf(s.boards);
    const prevBest = s.best;
    const today = dayKey();
    let streakUp = false;
    if (s.last !== today) { s.streak = s.last === yesterdayKey() ? s.streak + 1 : 1; s.last = today; streakUp = true; }
    s.boards += 1;
    s.defects = (Number(s.defects) || 0) + counts[1][1];
    const isBest = score != null && (prevBest == null || score > prevBest);
    if (isBest) s.best = score;
    writeStats(s);
    renderStats();
    const rankUp = rankOf(s.boards) > rankBefore;

    // ring + numbers
    const fg = $("ux-ringwrap"), ring = $("ux-ring-fg"), summaryFg = $("summary-ringwrap"), summaryRing = $("summary-ring-fg"), C = 326.73;
    fg.dataset.tone = score == null ? "warn" : score >= 85 ? "ok" : score >= 60 ? "warn" : "bad";
    ring.style.strokeDashoffset = String(C);
    summaryFg.dataset.tone = fg.dataset.tone;
    summaryRing.style.strokeDashoffset = String(C);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const offset = String(C * (1 - (score || 0) / 100));
      ring.style.strokeDashoffset = offset;
      summaryRing.style.strokeDashoffset = offset;
    }));
    if (score == null) {
      $("quality-score").textContent = "N/A";
      $("summary-quality-score").textContent = "N/A";
    } else {
      countUp($("quality-score"), score, (v) => `${v}%`, 1100);
      countUp($("summary-quality-score"), score, (v) => `${v}%`, 1100);
    }
    counts.forEach(([el, value], index) => {
      countUp(el, value, String, 800);
      countUp($(["summary-good-count", "summary-defect-count", "summary-total-count"][index]), value, String, 800);
    });

    // message
    let msg;
    if (score == null) msg = "No classified joints came back. That doesn't confirm the board is clean. Try a closer, sharper photo.";
    else if (isBest && prevBest != null) msg = `New personal best: ${score}% (was ${prevBest}%).`;
    else if (prevBest == null) msg = "First board logged. Try another angle to see how the score changes.";
    else if (score >= 90) msg = "On the joints it detected, this looks clean.";
    else if (score >= 70) msg = "Mostly good. Check the flagged joints, touch them up, then re-shoot.";
    else msg = "Several flagged joints. Rework them, then upload again to beat this score.";
    $("ux-msg").textContent = msg;
    $("summary-msg").textContent = msg;

    if (rankUp) showToast(`Rank up: ${RANKS[rankOf(s.boards)].name}!`);
    else if (isBest && prevBest != null) showToast(`New personal best: ${score}%`);
    else if (streakUp && s.streak > 1) showToast(`${s.streak}-day streak. Nice.`);

    if (score != null && score >= 85) setTimeout(burst, 350);
  }

  /* ---------- state machine ---------- */
  function sync() {
    const loading = btn.classList.contains("loading");
    const failed = !errorBox.classList.contains("hidden");
    if (wasLoading && !loading) analyzed = !failed;
    wasLoading = loading;
    const loaded = !preview.classList.contains("hidden");
    const state = loading ? "scanning" : !loaded ? "idle" : analyzed ? "done" : "ready";
    if (state === prevState) return;

    root.dataset.state = state;
    findingsButton.disabled = state !== "done";
    resetButton.disabled = state === "idle" || state === "scanning";
    tag.textContent = TAGS[state];
    steps.forEach((li, i) => { li.className = `ux-step is-${STEP_STATES[state][i]}`; });
    if (state === "scanning") startScan(); else if (prevState === "scanning") stopScan();
    if (state === "done") onDone();
    if (state !== "idle") { stage.style.setProperty("--mx", "50%"); stage.style.setProperty("--my", "50%"); }
    prevState = state;
  }

  function onNewImage() {
    if (!btn.classList.contains("loading")) analyzed = false;
    sync();
    resetCheck();
    runPhotoCheck();
  }

  const watcher = new MutationObserver(sync);
  watcher.observe(btn, { attributes: true, attributeFilter: ["class"] });
  watcher.observe(preview, { attributes: true, attributeFilter: ["class"] });
  watcher.observe(errorBox, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(onNewImage).observe(caption, { childList: true, characterData: true, subtree: true });

  findingsButton.addEventListener("click", () => { if (!findingsButton.disabled) findingsDialog.showModal(); });
  $("findings-close").addEventListener("click", () => findingsDialog.close());
  findingsDialog.addEventListener("click", (event) => { if (event.target === findingsDialog) findingsDialog.close(); });

  /* ---------- inputs ---------- */
  chips.forEach((chip) => chip.addEventListener("click", () => {
    select.value = chip.dataset.sample;
    select.dispatchEvent(new Event("change"));
    chips.forEach((c) => c.classList.toggle("is-on", c === chip));
  }));
  fileInput.addEventListener("change", () => chips.forEach((c) => c.classList.remove("is-on")));
  fileInput.addEventListener("click", () => { fileInput.value = ""; });

  document.addEventListener("paste", (e) => {
    const section = $("inspection-view");
    const bounds = section.getBoundingClientRect();
    if (!$("home-view").classList.contains("active") || bounds.top > window.innerHeight || bounds.bottom < 0) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) setFile(new File([file], `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type }));
  });

  $("ux-again").addEventListener("click", () => { findingsDialog.close(); fileInput.click(); });
  $("ux-download").addEventListener("click", () => {
    preview.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `soldera-${(selectedName || "board").replace(/\.[^.]+$/, "")}-analysis.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  });

  /* ---------- tips carousel ---------- */
  const tips = [...document.querySelectorAll("#ux-tips .ux-tip")];
  const tipDots = $("ux-tip-dots");
  let tipI = 0, tipTimer = 0;
  function showTip(i) {
    tipI = (i + tips.length) % tips.length;
    tips.forEach((t, k) => t.classList.toggle("is-on", k === tipI));
    const compactTip = $("ux-photo-tip-text");
    if (compactTip && tips[tipI]) compactTip.textContent = tips[tipI].textContent;
    [...tipDots.children].forEach((d, k) => d.classList.toggle("is-on", k === tipI));
  }
  function restartTips() {
    clearInterval(tipTimer);
    if (!reduced) tipTimer = setInterval(() => showTip(tipI + 1), 5200);
  }
  tips.forEach((_, i) => {
    const d = document.createElement("button");
    d.type = "button"; d.setAttribute("aria-label", `Show tip ${i + 1}`);
    d.addEventListener("click", () => { showTip(i); restartTips(); });
    tipDots.append(d);
  });
  $("ux-tips").addEventListener("mouseenter", () => clearInterval(tipTimer));
  $("ux-tips").addEventListener("mouseleave", restartTips);
  showTip(0); restartTips();

  /* ---------- pointer polish ---------- */
  if (fine) {
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      stage.style.setProperty("--mx", `${e.clientX - r.left}px`);
      stage.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
    btn.addEventListener("pointermove", (e) => {
      if (btn.disabled) return;
      const r = btn.getBoundingClientRect();
      btn.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.12}px ${(e.clientY - r.top - r.height / 2) * 0.2}px`;
    });
    btn.addEventListener("pointerleave", () => { btn.style.translate = ""; });
  }

  renderStats();
  resetCheck();
  sync();
})();

/* Orange solder-spark edge light for the main action buttons. */
document.querySelectorAll(".solder-spark-button").forEach((button) => {
  button.addEventListener("pointermove", (event) => {
    const rect = button.getBoundingClientRect();
    const angle = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 90 - 328;
    button.style.setProperty("--spark-angle", `${angle}deg`);
    button.classList.add("is-following-spark");
  });
  button.addEventListener("pointerleave", () => button.classList.remove("is-following-spark"));
});
