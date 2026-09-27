/*
  Mediafile DNL - frontend
  IMPORTANTE: aquí NO hay claves de Backblaze.
  El navegador solamente habla con nuestro Worker API.
*/
const CONFIG = {
  API_URL: "https://m-e2a5ediafile-dnl.danny941117.workers.dev",
  VERSION: "1.2.0"
};

const $ = s => document.querySelector(s);
const logEl = $("#diagnosticLog");
let allFiles = [];
let activeFilter = "all";

function log(title, data="") {
  const time = new Date().toLocaleTimeString();
  let line = `[${time}] ${title}`;
  if (data) line += "\n" + (typeof data === "string" ? data : JSON.stringify(data,null,2));
  logEl.textContent = line + "\n\n" + logEl.textContent;
}

function setConnection(ok, text) {
  const el = $("#connection");
  el.className = "status " + (ok ? "status-ok" : "status-err");
  el.textContent = "● " + text;
}

function formatBytes(n) {
  if (!Number.isFinite(Number(n))) return "Tamaño desconocido";
  n = Number(n);
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  if (n < 1024*1024*1024) return (n/1024/1024).toFixed(1) + " MB";
  return (n/1024/1024/1024).toFixed(2) + " GB";
}

function normalizeFiles(data) {
  const candidates = [
    data?.files, data?.archivos, data?.detalles?.files,
    data?.detalles?.archivos, data?.result?.files
  ];
  const arr = candidates.find(Array.isArray);
  return arr || [];
}

function fileKind(f) {
  const type = String(f.contentType || f.mimeType || f.tipo || "").toLowerCase();
  const name = String(f.fileName || f.fileName || f.nombre || "").toLowerCase();
  if (type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) return "video";
  if (type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|heic)$/i.test(name)) return "image";
  return "other";
}

function renderFiles() {
  const list = $("#fileList");
  const filtered = activeFilter === "all"
    ? allFiles
    : allFiles.filter(f => fileKind(f) === activeFilter);

  $("#listTitle").textContent =
    activeFilter === "image" ? "Fotos" :
    activeFilter === "video" ? "Videos" :
    "Todos los archivos";

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No hay archivos para mostrar.</div>';
    return;
  }

  list.innerHTML = filtered.map(f => {
    const name = f.fileName || f.nombre || "Archivo sin nombre";
    const type = f.contentType || f.mimeType || f.tipo || "archivo";
    const size = formatBytes(f.contentLength ?? f.size ?? f.tamañoBytes);
    const icon = fileKind(f) === "video" ? "🎬" : fileKind(f) === "image" ? "🖼️" : "📄";
    return `<div class="file">
      <div class="file-type">${icon}</div>
      <div class="file-info">
        <div class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="file-meta">${escapeHtml(type)} · ${size}</div>
      </div>
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function loadFiles() {
  log("Consultando API", CONFIG.API_URL);
  setConnection(false, "Conectando...");
  try {
    const r = await fetch(CONFIG.API_URL, { method:"GET", cache:"no-store" });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw:text }; }

    log("Respuesta API", data);

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    allFiles = normalizeFiles(data);
    renderFiles();
    setConnection(true, `API conectada · ${allFiles.length} archivo(s)`);
  } catch (err) {
    allFiles = [];
    renderFiles();
    setConnection(false, "No se pudo conectar con la API");
    log("ERROR DE CONEXIÓN", {message:err.message});
  }
}

async function uploadFiles(files) {
  for (const file of files) {
    log("Subiendo archivo", {name:file.name,type:file.type,size:file.size});
    try {
      const r = await fetch(CONFIG.API_URL, {
        method:"POST",
        headers:{
          "X-Archivo-Nombre": encodeURIComponent(file.name),
          "X-Archivo-Tipo": file.type || "application/octet-stream"
        },
        body:file
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {raw:text}; }
      log(r.ok ? "SUBIDA OK" : "ERROR AL SUBIR", data);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch(err) {
      log("ERROR DE SUBIDA", {name:file.name,message:err.message});
    }
  }
  await loadFiles();
}

document.querySelectorAll(".card").forEach(btn => {
  btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter;
    renderFiles();
    document.querySelector(".panel").scrollIntoView({behavior:"smooth"});
  });
});

$("#btnRefresh").addEventListener("click", loadFiles);
$("#btnClearLog").addEventListener("click", () => logEl.textContent = "Diagnóstico limpiado.");
$("#fileInput").addEventListener("change", e => {
  if (e.target.files?.length) uploadFiles([...e.target.files]);
  e.target.value = "";
});
$("#navFiles").addEventListener("click", () => document.querySelector(".panel").scrollIntoView({behavior:"smooth"}));
$("#navGallery").addEventListener("click", () => {
  activeFilter = "image"; renderFiles();
  document.querySelector(".panel").scrollIntoView({behavior:"smooth"});
});
$("#navConfig").addEventListener("click", () => {
  alert("Configuración avanzada la añadiremos en la siguiente etapa.");
});

log("Mediafile DNL iniciado", {version:CONFIG.VERSION, api:CONFIG.API_URL});
loadFiles();
