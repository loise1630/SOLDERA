const $ = (id) => document.getElementById(id);
const FILE_LIMIT = 10 * 1024 * 1024;
let selectedFile = null;
let selectedName = "";
let settings = readSettings();

fetch("/api/health").then(response => response.json()).then(status => {
  const label = $("engine-status-text"), dot = $("engine-status");
  if (label) label.textContent = status.roboflowKeyConfigured ? "Roboflow ready" : "API key required";
  if (dot) dot.style.background = status.roboflowKeyConfigured ? "#69bd8a" : "#e0a44e";
}).catch(() => {
  const label = $("engine-status-text");
  if (label) label.textContent = "Backend unavailable";
});

function readSettings() {
  try { return {confidence: 35, apiKey: "", showLabels: true, showConfidence: true, boxWidth: 3, ...JSON.parse(localStorage.getItem("solderVisionSettings") || "{}")}; }
  catch { return {confidence: 35, apiKey: "", showLabels: true, showConfidence: true, boxWidth: 3}; }
}
function saveSettings() {
  settings = {confidence: Number($("confidence").value), apiKey: $("api-key").value.trim(), showLabels: $("show-labels").checked, showConfidence: $("show-confidence").checked, boxWidth: Number($("box-width").value)};
  localStorage.setItem("solderVisionSettings", JSON.stringify(settings));
  $("saved-label").textContent = "Saved";
  setTimeout(() => $("saved-label").textContent = "", 1800);
}
function showError(message = "") { $("error-message").textContent = message; $("error-message").classList.toggle("hidden", !message); }
function setFile(file, name = file?.name || "") {
  showError();
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(name)) return showError("Choose a JPG, PNG, or WEBP image.");
  if (file.size > FILE_LIMIT) return showError("Image must be 10 MB or smaller.");
  selectedFile = file; selectedName = name;
  const preview = $("preview");
  const image = new Image(); image.onload = () => { preview.width = image.naturalWidth; preview.height = image.naturalHeight; const ctx = preview.getContext("2d"); ctx.clearRect(0, 0, preview.width, preview.height); ctx.drawImage(image, 0, 0); };
  image.src = URL.createObjectURL(file);
  preview.classList.remove("hidden"); $("drop-content").classList.add("hidden");
  $("file-caption").textContent = `${name} · ${(file.size / 1048576).toFixed(2)} MB`;
  $("file-caption").classList.remove("hidden"); $("analyze-button").disabled = false;
  $("result-subtitle").textContent = "Ready when you are. Select analyze to inspect this board.";
}
$("file-input").addEventListener("change", e => setFile(e.target.files[0]));
$("dropzone").addEventListener("dragover", e => { e.preventDefault(); $("dropzone").classList.add("dragover"); });
$("dropzone").addEventListener("dragleave", () => $("dropzone").classList.remove("dragover"));
$("dropzone").addEventListener("drop", e => { e.preventDefault(); $("dropzone").classList.remove("dragover"); setFile(e.dataTransfer.files[0]); });
$("sample-select").addEventListener("change", async e => {
  if (!e.target.value) return;
  try {
    const response = await fetch(`/${encodeURIComponent(e.target.value)}`);
    if (!response.ok) throw new Error("Sample image could not be loaded.");
    const blob = await response.blob();
    setFile(new File([blob], e.target.value, {type: blob.type || "image/jpeg"}), e.target.value);
  } catch (err) { showError(err.message); }
});
$("analyze-button").addEventListener("click", async () => {
  if (!selectedFile) return;
  const button = $("analyze-button"); button.disabled = true; button.classList.add("loading");
  button.innerHTML = "<span>◌</span> Analyzing board…"; showError();
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Unable to read this image.")); reader.readAsDataURL(selectedFile); });
    const response = await fetch("/api/analyze", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({image: dataUrl, settings})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed.");
    renderResult(result); drawAnnotations(result.predictions || []); saveHistory(result);
  } catch (err) { showError(err.message || "Analysis failed. Check the backend connection and API settings."); }
  finally { button.disabled = false; button.classList.remove("loading"); button.innerHTML = "<span>✧</span> Analyze Soldering Quality"; }
});
function renderResult(result) {
  $("good-count").textContent = result.good; $("defect-count").textContent = result.defects;
  $("total-count").textContent = result.total; $("quality-score").textContent = "N/A";
  const verdict = $("verdict");
  const notice = result.total ? "Model detections only. Board-grade accuracy has not been validated." : "No detections returned. This does not confirm the board is defect-free.";
  verdict.className = "verdict warning"; verdict.textContent = `${result.verdict}: ${notice} ${result.meanConfidence == null ? "" : `Mean detection confidence: ${result.meanConfidence}% (not measured accuracy).`}`;
  $("results-empty").classList.add("hidden"); $("result-subtitle").textContent = `Inspection complete · ${selectedName}`;
  const details = $("details");
  if (result.classCounts?.length) {
    details.innerHTML = `<h3>Detected class breakdown</h3><table class="detail-table"><thead><tr><th>Detection class</th><th>Count</th></tr></thead><tbody>${result.classCounts.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.count}</td></tr>`).join("")}</tbody></table>`;
    details.classList.remove("hidden");
  } else { details.classList.add("hidden"); }
}
function drawAnnotations(predictions) {
  const canvas = $("preview"), ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
  const colors = {GoodSoldering: "#22c55e", Short: "#ef4444", insufficient_solder: "#0ecdb4", spike: "#875bff", excess_solder: "#ef4567", BadSoldering: "#ef4444", TooBigSoldering: "#f97316", NoSoldering: "#dc2626", Missing_solder: "#f97316", missing_component: "#06a6d2"};
  predictions.forEach(p => {
    const bw = Number(p.width || 0), bh = Number(p.height || 0), x = Number(p.x || 0) - bw / 2, y = Number(p.y || 0) - bh / 2;
    const color = colors[p.class] || "#477bff";
    ctx.lineWidth = Number(settings.boxWidth || 3); ctx.strokeStyle = color; ctx.strokeRect(x, y, bw, bh);
    const label = [settings.showLabels ? p.class : "", settings.showConfidence ? `${Math.round(Number(p.confidence || 0) * 100)}%` : ""].filter(Boolean).join(" · ");
    if (label) { ctx.font = `bold ${Math.max(12, Math.round(w / 90))}px Inter, sans-serif`; const size = Math.max(16, Math.round(w / 60)); const tw = ctx.measureText(label).width; ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - size), tw + 10, size); ctx.fillStyle = "white"; ctx.fillText(label, x + 5, Math.max(size - 4, y - 4)); }
  });
}
function escapeHtml(text) { const node = document.createElement("span"); node.textContent = text; return node.innerHTML; }
function saveHistory(result) {
  const rows = JSON.parse(localStorage.getItem("solderVisionHistory") || "[]");
  rows.unshift({name: selectedName, date: new Date().toLocaleString(), score: null, verdict: result.verdict, defects: result.defects});
  localStorage.setItem("solderVisionHistory", JSON.stringify(rows.slice(0, 50)));
}
function renderHistory() {
  const list = $("history-list"), rows = JSON.parse(localStorage.getItem("solderVisionHistory") || "[]");
  list.innerHTML = rows.length ? rows.map(row => { const status = row.verdict === "NO DETECTIONS" ? "NO DETECTIONS" : "FINDINGS ONLY"; return `<div class="history-row"><span><b>${escapeHtml(row.name || "Board inspection")}</b><small>${escapeHtml(row.date)} · ${row.defects} known defect-class detections · Board grade: not validated</small></span><span class="pill">${status}</span></div>`; }).join("") : '<p class="results-empty">No inspections yet. Analyze a board to start your history.</p>';
}
document.querySelectorAll(".nav-link").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-link").forEach(item => item.classList.toggle("active", item === button));
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === `${button.dataset.view}-view`));
  if (button.dataset.view === "history") renderHistory();
}));
document.querySelectorAll("[data-open-view]").forEach(button => button.addEventListener("click", () => {
  document.querySelector(`.nav-link[data-view="${button.dataset.openView}"]`)?.click();
}));
$("confidence").value = settings.confidence;
$("api-key").value = settings.apiKey;
$("show-labels").checked = settings.showLabels; $("show-confidence").checked = settings.showConfidence; $("box-width").value = settings.boxWidth;
$("box-width-value").value = settings.boxWidth;
$("confidence-value").value = `${settings.confidence}%`;
$("confidence").addEventListener("input", e => $("confidence-value").value = `${e.target.value}%`);
$("box-width").addEventListener("input", e => $("box-width-value").value = e.target.value);
$("save-settings").addEventListener("click", saveSettings);
