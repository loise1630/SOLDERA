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
document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    const homeView = $("home-view");
    if (button.dataset.sectionLink && homeView?.classList.contains("active") && button.dataset.forceView !== "true") {
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
  const aboutSection = $("about-section");
  if (!homeView?.classList.contains("active") || !aboutSection) return;

  const bounds = aboutSection.getBoundingClientRect();
  const marker = window.innerHeight * 0.5;
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
const teamCards = document.querySelectorAll("[data-team-card]");
if (teamCards.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.body.classList.add("team-motion");
  const teamObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  teamCards.forEach((card) => teamObserver.observe(card));
}
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
    track.style.filter = `blur(${Math.min(5, movement / 18)}px)`;
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


/* ---------- Upload page v2 (replace the previous initUploadStage block at the END of app.js) ---------- */
(function initUploadStage() {
  const root = $("ux-root");
  const stage = $("dropzone");
  if (!root || !stage) return;

  const btn = $("analyze-button");
  const preview = $("preview");
  const caption = $("file-caption");
  const tag = $("ux-tag");
  const select = $("sample-select");
  const chips = document.querySelectorAll(".ux-chip");
  const drawer = $("ux-drawer");
  const fine = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches;
  const TAGS = { idle: "Waiting for an image", ready: "Image locked · ready", scanning: "Scanning joints…", done: "Analysis complete" };
  let wasLoading = false, analyzed = false, lastCaption = "", prevState = "idle";

  function setDrawer(open) {
    drawer.classList.toggle("is-open", open);
    $("ux-more").setAttribute("aria-expanded", String(open));
  }

  function sync() {
    const loading = btn.classList.contains("loading");
    const failed = !$("error-message").classList.contains("hidden");
    if (wasLoading && !loading) analyzed = !failed;
    wasLoading = loading;
    const cap = caption.textContent;
    if (cap !== lastCaption) { lastCaption = cap; if (!loading) analyzed = false; }
    const loaded = !preview.classList.contains("hidden");
    const state = loading ? "scanning" : !loaded ? "idle" : analyzed ? "done" : "ready";
    root.dataset.state = state;
    tag.textContent = TAGS[state];
    if (state === "done" && prevState !== "done") setDrawer(true);
    if (state !== "done") setDrawer(false);
    if (state !== "idle") { stage.style.setProperty("--rx", "0deg"); stage.style.setProperty("--ry", "0deg"); }
    prevState = state;
  }

  $("ux-more").addEventListener("click", () => setDrawer(!drawer.classList.contains("is-open")));
  $("ux-close").addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setDrawer(false); });

  const watcher = new MutationObserver(sync);
  watcher.observe(btn, { attributes: true, attributeFilter: ["class"] });
  watcher.observe(preview, { attributes: true, attributeFilter: ["class"] });
  watcher.observe(caption, { childList: true, characterData: true, subtree: true });
  watcher.observe($("error-message"), { attributes: true, attributeFilter: ["class"] });
  sync();

  // Sample chips drive the hidden select so the existing handler still runs
  chips.forEach((chip) => chip.addEventListener("click", () => {
    select.value = chip.dataset.sample;
    select.dispatchEvent(new Event("change"));
    chips.forEach((c) => c.classList.toggle("is-on", c === chip));
  }));
  $("file-input").addEventListener("change", () => chips.forEach((c) => c.classList.remove("is-on")));

  // Paste an image straight from the clipboard
  document.addEventListener("paste", (e) => {
    if (!$("inspection-view").classList.contains("active")) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) setFile(new File([file], `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type }));
  });

  if (fine) {
    // Glass spotlight follows the pointer; the card tilts slightly while waiting for an image
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      stage.style.setProperty("--mx", `${e.clientX - r.left}px`);
      stage.style.setProperty("--my", `${e.clientY - r.top}px`);
      if (root.dataset.state === "idle") {
        stage.style.setProperty("--ry", `${(px - 0.5) * 5}deg`);
        stage.style.setProperty("--rx", `${(0.5 - py) * 4}deg`);
      }
    });
    stage.addEventListener("pointerleave", () => {
      stage.style.setProperty("--rx", "0deg");
      stage.style.setProperty("--ry", "0deg");
    });

    // Magnetic analyze button
    btn.addEventListener("pointermove", (e) => {
      if (btn.disabled) return;
      const r = btn.getBoundingClientRect();
      btn.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.12}px ${(e.clientY - r.top - r.height / 2) * 0.2}px`;
    });
    btn.addEventListener("pointerleave", () => { btn.style.translate = ""; });
  }

  // Count-up animation for the numbers
  ["good-count", "defect-count", "total-count"].forEach((id) => {
    const el = $(id);
    let displayed = Number(el.textContent) || 0;
    let requested = null;
    let run = 0;
    let observer;

    function writeDisplay(value) {
      observer.disconnect();
      el.textContent = String(value);
      observer.observe(el, { childList: true, characterData: true, subtree: true });
      displayed = value;
    }

    observer = new MutationObserver(() => {
      const target = Number(el.textContent) || 0;
      if (target === requested) return;
      requested = target;
      const thisRun = ++run;
      const from = displayed;
      const start = performance.now();

      function step(now) {
        if (thisRun !== run) return;
        const progress = Math.min(1, (now - start) / 700);
        const eased = 1 - Math.pow(1 - progress, 3);
        writeDisplay(Math.round(from + (target - from) * eased));
        if (progress < 1) requestAnimationFrame(step);
        else {
          el.parentElement.classList.remove("pop");
          void el.offsetWidth;
          el.parentElement.classList.add("pop");
        }
      }

      step(start);
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
  });
})();
