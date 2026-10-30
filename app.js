const $ = (id) => document.getElementById(id);
const FILE_LIMIT = 10 * 1024 * 1024;

let selectedFile = null;
let selectedName = "";
let settings = readSettings();

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
    const target = document.querySelector(".hero-wordmark");
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
  button.innerHTML = "<span>◌</span> Analyzing board…";
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
    button.innerHTML = "<span>✧</span> Analyze Soldering Quality";
  }
});

function renderResult(result) {
  $("good-count").textContent = result.good ?? 0;
  $("defect-count").textContent = result.defects ?? 0;
  $("total-count").textContent = result.total ?? 0;
  $("quality-score").textContent = "N/A";

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
    score: null,
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
              <small>${escapeHtml(row.date)} · ${Number(row.defects) || 0} known defect-class detections · Board grade: not validated</small>
            </span>
            <span class="pill">${status}</span>
          </div>
        `;
      }).join("")
    : '<p class="results-empty">No inspections yet. Analyze a board to start your history.</p>';
}

/* ---------- Workspace navigation ---------- */
document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
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

document.querySelectorAll("[data-scroll-to]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    window.setTimeout(() => document.getElementById(control.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  });
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`.nav-link[data-view="${button.dataset.openView}"]`)?.click();
  });
});

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
