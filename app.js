
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initVideoLightbox,
    { once: true }
  );
} else {
  initVideoLightbox();
}

/*
  Mediafile DNL - frontend
  VERSION 1.6.0

  El navegador NO contiene claves de Backblaze.
  Todo pasa por el Worker API.
*/

const CONFIG = {
  API_URL: "https://m-e2a5ediafile-dnl.danny941117.workers.dev",
  VERSION: "1.6.0"
};

const $ = (selector) => document.querySelector(selector);

const logEl = $("#diagnosticLog");

let allFiles = [];
let activeFilter = "all";
let activePhotoDay = null;
let photoDayMenuOpen = false;


// ============================================================
// DIAGNÓSTICO
// ============================================================

function log(title, data = "") {
  const time = new Date().toLocaleTimeString();

  let line = `[${time}] ${title}`;

  if (data !== "") {
    line += "\n";

    if (typeof data === "string") {
      line += data;
    } else {
      try {
        line += JSON.stringify(data, null, 2);
      } catch {
        line += String(data);
      }
    }
  }

  if (logEl) {
    logEl.textContent =
      line + "\n\n" + logEl.textContent;
  }
}


// ============================================================
// ESTADO DE CONEXIÓN
// ============================================================

function setConnection(ok, text) {
  const el = $("#connection");

  if (!el) return;

  el.className =
    "status " +
    (ok ? "status-ok" : "status-err");

  el.textContent =
    "● " + text;
}


// ============================================================
// ESCAPAR HTML
// ============================================================

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );
}


// ============================================================
// BYTES
// ============================================================

function formatBytes(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Tamaño desconocido";
  }

  if (number < 1024) {
    return number + " B";
  }

  if (number < 1024 * 1024) {
    return (
      (number / 1024).toFixed(1) +
      " KB"
    );
  }

  if (number < 1024 * 1024 * 1024) {
    return (
      (number / 1024 / 1024).toFixed(1) +
      " MB"
    );
  }

  return (
    (number / 1024 / 1024 / 1024).toFixed(2) +
    " GB"
  );
}


// ============================================================
// NOMBRE DE ARCHIVO
// ============================================================

function getFileName(file) {
  return (
    file?.fileName ||
    file?.nombre ||
    file?.name ||
    "Archivo sin nombre"
  );
}


// ============================================================
// TIPO
// ============================================================

function getContentType(file) {
  return (
    file?.contentType ||
    file?.mimeType ||
    file?.tipo ||
    "application/octet-stream"
  );
}


// ============================================================
// CLASIFICAR ARCHIVO
// ============================================================

function fileKind(file) {
  const type =
    String(
      getContentType(file)
    ).toLowerCase();

  const name =
    getFileName(file)
      .toLowerCase();

  if (
    type.startsWith("video/") ||
    /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(name)
  ) {
    return "video";
  }

  if (
    type.startsWith("image/") ||
    /\.(png|jpg|jpeg|gif|webp|heic|bmp|svg)$/i.test(name)
  ) {
    return "image";
  }

  if (
    type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)
  ) {
    return "audio";
  }

  if (
    type === "application/pdf" ||
    /\.pdf$/i.test(name)
  ) {
    return "pdf";
  }

  return "other";
}


// ============================================================
// URL DE DESCARGA
// ============================================================

function getFileUrl(file) {
  const name =
    getFileName(file);

  return (
    CONFIG.API_URL +
    "/download?file=" +
    encodeURIComponent(name)
  );
}


// ============================================================
// ELIMINAR ARCHIVO
// ============================================================

async function deleteFile(file) {
  const name = getFileName(file);

  const confirmed = window.confirm(
    `¿Eliminar "${name}"?\n\nEsta acción no se puede deshacer.`
  );

  if (!confirmed) {
    log("Eliminación cancelada", { name });
    return;
  }

  log("Eliminando archivo", { name });

  try {
    // El Worker recibe DELETE /download?file=...
    // y realiza la eliminación de forma segura en Backblaze.
    const response = await fetch(
      CONFIG.API_URL +
      "/download?file=" +
      encodeURIComponent(name),
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store"
      }
    );

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    log(
      response.ok ? "ELIMINACIÓN OK" : "ERROR AL ELIMINAR",
      data
    );

    if (!response.ok || (data && data.ok === false)) {
      throw new Error(
        data?.error ||
        data?.message ||
        `HTTP ${response.status}`
      );
    }

    // Quitar inmediatamente de la interfaz.
    allFiles = allFiles.filter(
      (item) => getFileName(item) !== name
    );

    renderFiles();
    renderGallery();
    updateReceiptCard();

    const photoResults = document.getElementById("photoResultsOverlay");
    if (photoResults) {
      const currentTitle = photoResults.querySelector("h2")?.textContent || "Todas las fotos";
      const currentFiles = currentTitle === "Todas las fotos"
        ? getImageFiles()
        : getImageFiles().filter(file => getPhotoDayKey(file) === activePhotoDay);
      closePhotoResults();
      openPhotoResults(
        currentFiles,
        currentTitle,
        currentTitle === "Todas las fotos"
          ? `${currentFiles.length} ${currentFiles.length === 1 ? "foto almacenada" : "fotos almacenadas"}`
          : `${currentFiles.length} ${currentFiles.length === 1 ? "foto de este día" : "fotos de este día"}`,
        currentTitle === "Todas las fotos" ? null : activePhotoDay
      );
    }

    log("Archivo eliminado correctamente", { name });

  } catch (error) {
    log("ERROR DE ELIMINACIÓN", {
      name,
      message: error?.message || String(error)
    });

    alert(
      "No se pudo eliminar el archivo.\n\n" +
      (error?.message || "Error desconocido")
    );
  }
}


// ============================================================
// ICONO
// ============================================================

function getIcon(file) {
  const kind =
    fileKind(file);

  if (kind === "video") return "🎬";
  if (kind === "image") return "🖼️";
  if (kind === "audio") return "🎵";
  if (kind === "pdf") return "📕";

  return "📄";
}


// ============================================================
// NORMALIZAR RESPUESTA DEL WORKER
// ============================================================

function normalizeFiles(data) {
  const candidates = [
    data?.archivos,
    data?.files,
    data?.detalles?.archivos,
    data?.detalles?.files,
    data?.result?.files
  ];

  const array =
    candidates.find(
      Array.isArray
    );

  return array || [];
}



// ============================================================
// COMPROBANTES
// ============================================================

function isReceiptFile(file) {
  const name = getFileName(file).toLowerCase();
  const type = String(getContentType(file)).toLowerCase();

  return (
    /comprobante|comprobantes|recibo|recibos|receipt|factura|facturas|ticket|tickets|voucher|pago|pagos/.test(name) ||
    type === "application/pdf"
  );
}

function getReceiptFiles() {
  return allFiles.filter(isReceiptFile);
}


// ============================================================
// FILTROS
// ============================================================

function matchesFilter(file) {
  if (activeFilter === "all") {
    return true;
  }

  if (activeFilter === "receipt") {
    return isReceiptFile(file);
  }

  return (
    fileKind(file) ===
    activeFilter
  );
}


// ============================================================
// ABRIR ARCHIVO
// ============================================================

function openFile(file) {
  const url =
    getFileUrl(file);

  log(
    "Abriendo archivo",
    {
      name: getFileName(file),
      url
    }
  );

  window.open(
    url,
    "_blank",
    "noopener"
  );
}


// ============================================================
// DESCARGAR ARCHIVO
// ============================================================

function downloadFile(file) {
  const url =
    getFileUrl(file);

  const name =
    getFileName(file);

  log(
    "Descargando archivo",
    {
      name,
      url
    }
  );

  const link =
    document.createElement("a");

  link.href = url;
  link.download = name;
  link.target = "_blank";
  link.rel = "noopener";

  document.body.appendChild(link);

  link.click();

  link.remove();
}


// ============================================================
// VISTA PREVIA
// ============================================================

function previewFile(file) {
  const kind =
    fileKind(file);

  const name =
    getFileName(file);

  const type =
    getContentType(file);

  const url =
    getFileUrl(file);

  log(
    "Abriendo vista previa",
    {
      name,
      type,
      url
    }
  );

  const existing =
    document.querySelector(
      ".mediafile-modal"
    );

  if (existing) {
    existing.remove();
  }

  const modal =
    document.createElement("div");

  modal.className =
    "mediafile-modal";

  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    background:rgba(0,0,0,.88);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    box-sizing:border-box;
  `;

  const box =
    document.createElement("div");

  box.style.cssText = `
    position:relative;
    width:min(900px,100%);
    max-height:95vh;
    background:#07150f;
    border:1px solid rgba(80,220,150,.35);
    border-radius:20px;
    padding:16px;
    box-sizing:border-box;
    overflow:auto;
  `;

  const close =
    document.createElement("button");

  close.textContent = "✕";

  close.style.cssText = `
    position:absolute;
    top:10px;
    right:10px;
    z-index:3;
    width:42px;
    height:42px;
    border:0;
    border-radius:50%;
    background:rgba(0,0,0,.7);
    color:white;
    font-size:22px;
    cursor:pointer;
  `;

  close.addEventListener(
    "click",
    () => modal.remove()
  );

  box.appendChild(close);

  const title =
    document.createElement("div");

  title.textContent =
    name;

  title.style.cssText = `
    color:white;
    font-size:18px;
    font-weight:700;
    padding:8px 50px 14px 4px;
    word-break:break-word;
  `;

  box.appendChild(title);


  if (kind === "image") {

    const image =
      document.createElement("img");

    image.src = url;
    image.alt = name;

    image.style.cssText = `
      display:block;
      max-width:100%;
      max-height:75vh;
      margin:auto;
      object-fit:contain;
      border-radius:12px;
    `;

    box.appendChild(image);

  } else if (kind === "video") {

    const video =
      document.createElement("video");

    video.src = url;

    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;

    video.style.cssText = `
      display:block;
      width:100%;
      max-height:75vh;
      background:#000;
      border-radius:12px;
    `;

    box.appendChild(video);

  } else if (kind === "audio") {

    const audio =
      document.createElement("audio");

    audio.src = url;
    audio.controls = true;

    audio.style.cssText = `
      width:100%;
      margin:30px 0;
    `;

    box.appendChild(audio);

  } else if (kind === "pdf") {

    const frame =
      document.createElement("iframe");

    frame.src = url;

    frame.style.cssText = `
      width:100%;
      height:75vh;
      border:0;
      border-radius:12px;
      background:white;
    `;

    box.appendChild(frame);

  } else {

    const info =
      document.createElement("div");

    info.innerHTML = `
      <div style="
        color:white;
        padding:30px 10px;
        text-align:center;
      ">
        <div style="font-size:50px;margin-bottom:15px;">
          ${escapeHtml(getIcon(file))}
        </div>

        <div style="font-size:16px;margin-bottom:20px;">
          Este tipo de archivo no tiene
          vista previa directa.
        </div>

        <button id="mediafileModalDownload"
          style="
            border:0;
            border-radius:12px;
            padding:13px 20px;
            font-size:16px;
            font-weight:700;
            cursor:pointer;
          ">
          ⬇️ Descargar
        </button>
      </div>
    `;

    box.appendChild(info);

    setTimeout(() => {
      const button =
        document.querySelector(
          "#mediafileModalDownload"
        );

      if (button) {
        button.addEventListener(
          "click",
          () => downloadFile(file)
        );
      }
    }, 0);
  }


  const footer =
    document.createElement("div");

  footer.style.cssText = `
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    margin-top:14px;
  `;

  const openButton =
    document.createElement("button");

  openButton.textContent =
    "↗ Abrir";

  openButton.style.cssText = `
    border:0;
    border-radius:10px;
    padding:11px 16px;
    cursor:pointer;
    font-weight:700;
  `;

  openButton.addEventListener(
    "click",
    () => {
      if (kind === "video") {
        openVideoLightbox(file);
      } else {
        openFile(file);
      }
    }
  );


  const downloadButton =
    document.createElement("button");

  downloadButton.textContent =
    "⬇️ Descargar";

  downloadButton.style.cssText = `
    border:0;
    border-radius:10px;
    padding:11px 16px;
    cursor:pointer;
    font-weight:700;
  `;

  downloadButton.addEventListener(
    "click",
    () => downloadFile(file)
  );


  footer.appendChild(
    openButton
  );

  footer.appendChild(
    downloadButton
  );

  box.appendChild(
    footer
  );


  modal.appendChild(box);

  document.body.appendChild(modal);


  modal.addEventListener(
    "click",
    (event) => {
      if (
        event.target === modal
      ) {
        modal.remove();
      }
    }
  );
}


// ============================================================
// CREAR TARJETA DE ARCHIVO
// ============================================================

function createFileElement(file) {

  const name =
    getFileName(file);

  const type =
    getContentType(file);

  const size =
    formatBytes(
      file?.contentLength ??
      file?.size ??
      file?.tamañoBytes
    );

  const kind =
    fileKind(file);

  const icon =
    getIcon(file);


  const element =
    document.createElement("div");

  element.className =
    "file mediafile-file";


  element.innerHTML = `
    <div class="file-type">
      ${icon}
    </div>

    <div class="file-info">

      <div
        class="file-name"
        title="${escapeHtml(name)}"
      >
        ${escapeHtml(name)}
      </div>

      <div class="file-meta">
        ${escapeHtml(type)} · ${escapeHtml(size)}
      </div>

      <div
        class="mediafile-actions"
        style="
          display:flex;
          gap:7px;
          flex-wrap:wrap;
          margin-top:9px;
        "
      >

        <button
          class="mediafile-open"
          type="button"
          style="
            border:0;
            border-radius:9px;
            padding:8px 12px;
            cursor:pointer;
            font-weight:700;
          "
        >
          ↗ Abrir
        </button>

        <button
          class="mediafile-preview"
          type="button"
          aria-label="Vista previa"
          style="
            border:0;
            border-radius:12px;
            padding:0;
            cursor:pointer;
            font-weight:700;
            width:150px;
            height:82px;
            overflow:hidden;
            position:relative;
            background:#10251c;
            display:flex;
            align-items:center;
            justify-content:center;
          "
        >
          <span class="mediafile-thumb-placeholder"
            style="
              color:#d8eee4;
              font-size:28px;
              line-height:1;
            "
          >👁️</span>
        </button>

        <button
          class="mediafile-download"
          type="button"
          style="
            border:0;
            border-radius:9px;
            padding:8px 12px;
            cursor:pointer;
            font-weight:700;
          "
        >
          ⬇️ Descargar
        </button>

        <button
          class="mediafile-delete"
          type="button"
          style="
            border:0;
            border-radius:9px;
            padding:8px 12px;
            cursor:pointer;
            font-weight:700;
            background:#8f2020;
            color:white;
          "
        >
          🗑️ Eliminar
        </button>

      </div>
    </div>
  `;


  const openButton =
    element.querySelector(
      ".mediafile-open"
    );

  const previewButton =
    element.querySelector(
      ".mediafile-preview"
    );

  const downloadButton =
    element.querySelector(
      ".mediafile-download"
    );

  const deleteButton =
    element.querySelector(
      ".mediafile-delete"
    );

  // ==========================================================
  // MINIATURA
  // Reemplaza el botón "👁️ Vista previa" por una miniatura
  // real cuando el archivo es una imagen o un video.
  // ==========================================================

  const thumbButton =
    previewButton;

  if (kind === "image") {

    const thumb =
      document.createElement("img");

    thumb.src = getFileUrl(file);
    thumb.alt = name;
    thumb.loading = "lazy";

    thumb.style.cssText = `
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    `;

    thumb.addEventListener(
      "error",
      () => {
        thumb.remove();

        const placeholder =
          document.createElement("span");

        placeholder.textContent = "🖼️";
        placeholder.style.cssText = `
          font-size:32px;
        `;

        thumbButton.appendChild(
          placeholder
        );
      }
    );

    thumbButton.innerHTML = "";
    thumbButton.appendChild(thumb);

    // Pequeña etiqueta sobre la miniatura.
    const badge =
      document.createElement("span");

    badge.textContent = "👁";
    badge.style.cssText = `
      position:absolute;
      right:5px;
      bottom:5px;
      width:27px;
      height:27px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:rgba(0,0,0,.70);
      color:white;
      font-size:15px;
    `;

    thumbButton.appendChild(badge);

  } else if (kind === "video") {

    const video =
      document.createElement("video");

    video.src = getFileUrl(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    video.style.cssText = `
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
      background:#000;
      pointer-events:none;
    `;

    thumbButton.innerHTML = "";
    thumbButton.appendChild(video);

    const badge =
      document.createElement("span");

    badge.textContent = "▶";
    badge.style.cssText = `
      position:absolute;
      left:50%;
      top:50%;
      transform:translate(-50%,-50%);
      width:34px;
      height:34px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:rgba(0,0,0,.72);
      color:white;
      font-size:16px;
    `;

    thumbButton.appendChild(badge);

  } else {

    // Los demás archivos conservan el icono de vista previa.
    thumbButton.innerHTML =
      '<span style="font-size:28px">👁️</span>';
  }


  openButton.addEventListener(
    "click",
    () => openFile(file)
  );


  previewButton.addEventListener(
    "click",
    () => {
      if (kind === "video") {
        openVideoLightbox(file);
      } else {
        previewFile(file);
      }
    }
  );


  downloadButton.addEventListener(
    "click",
    () => downloadFile(file)
  );


  deleteButton.addEventListener(
    "click",
    () => deleteFile(file)
  );


  // Para archivos sin vista previa,
  // ocultamos el botón correspondiente.
  if (
    ![
      "image",
      "video",
      "audio",
      "pdf"
    ].includes(kind)
  ) {
    previewButton.style.display =
      "none";
  }


  return element;
}


// ============================================================
// FOTOS POR DÍA DE SUBIDA
// ============================================================

function getUploadTimestamp(file) {
  const candidates = [
    file?.uploadTimestamp, file?.uploadTime, file?.uploadedAt,
    file?.uploadDate, file?.createdAt, file?.created,
    file?.fechaSubida, file?.fecha, file?.date, file?.lastModified,
    file?.fileInfo?.uploadTimestamp, file?.fileInfo?.uploadTime,
    file?.fileInfo?.uploadedAt, file?.fileInfo?.uploadDate
  ];
  for (const value of candidates) {
    if (value === undefined || value === null || value === "") continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const date2 = new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
      if (!Number.isNaN(date2.getTime())) return date2;
    }
  }
  return null;
}

function getPhotoDayKey(file) {
  const date = getUploadTimestamp(file);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatPhotoDay(key) {
  if (key === "unknown") return "Fecha no disponible";
  const parts = key.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return key;
  return new Intl.DateTimeFormat("es-GT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(new Date(parts[0], parts[1]-1, parts[2])).replace(/^./, c => c.toUpperCase());
}

function getPhotoDayGroups() {
  const groups = new Map();
  getImageFiles().forEach(file => {
    const key = getPhotoDayKey(file);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  });
  return [...groups.entries()].sort((a,b) => {
    if (a[0] === "unknown") return 1;
    if (b[0] === "unknown") return -1;
    return b[0].localeCompare(a[0]);
  });
}

function closePhotoDayMenu() {
  document.getElementById("photoDayMenu")?.remove();
  photoDayMenuOpen = false;
}

function closePhotoResults() {
  document.getElementById("photoResultsOverlay")?.remove();
}

function openPhotoResults(files, title, subtitle, dayKey = null) {
  closePhotoResults();

  const overlay = document.createElement("div");
  overlay.id = "photoResultsOverlay";
  overlay.className = "photo-results-overlay";

  const safeTitle = escapeHtml(title || "Fotos");
  const safeSubtitle = escapeHtml(subtitle || `${files.length} ${files.length === 1 ? "foto" : "fotos"}`);

  overlay.innerHTML = `
    <div class="photo-results-dialog" role="dialog" aria-modal="true" aria-label="${safeTitle}">
      <div class="photo-results-head">
        <div class="photo-results-head-main">
          <span class="photo-results-eyebrow">CARPETA · FOTOS</span>
          <h2>${safeTitle}</h2>
          <p>${safeSubtitle}</p>
        </div>
        <button class="photo-results-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <div class="photo-results-toolbar">
        <button class="photo-results-back" type="button">← Categorías</button>
        <span>${files.length} ${files.length === 1 ? "archivo" : "archivos"}</span>
      </div>
      <div class="photo-results-grid"></div>
    </div>`;

  document.body.appendChild(overlay);

  const grid = overlay.querySelector(".photo-results-grid");
  if (grid) {
    if (!files.length) {
      grid.innerHTML = '<div class="photo-results-empty">No hay fotos para mostrar.</div>';
    } else {
      files.forEach(file => grid.appendChild(createFileElement(file)));
    }
  }

  overlay.querySelector(".photo-results-close")?.addEventListener("click", closePhotoResults);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closePhotoResults();
  });
  overlay.querySelector(".photo-results-back")?.addEventListener("click", () => {
    closePhotoResults();
    openPhotoDayMenu();
  });

  log("Ventana de fotos abierta", {
    modo: dayKey ? formatPhotoDay(dayKey) : "todas las fotos",
    total: files.length
  });
}

function openPhotoDayMenu() {
  if (photoDayMenuOpen) return;
  const groups = getPhotoDayGroups();
  const total = getImageFiles().length;
  photoDayMenuOpen = true;

  const overlay = document.createElement("div");
  overlay.id = "photoDayMenu";
  overlay.className = "photo-day-overlay";
  overlay.innerHTML = `
    <div class="photo-day-dialog" role="dialog" aria-modal="true" aria-label="Fotos por día">
      <div class="photo-day-head">
        <div>
          <span class="photo-day-eyebrow">CARPETA · FOTOS</span>
          <h2>Ordenar por día</h2>
          <p>${total} ${total === 1 ? "foto almacenada" : "fotos almacenadas"}</p>
        </div>
        <button class="photo-day-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <div class="photo-day-list">
        <button class="photo-day-option photo-day-all" type="button" data-photo-day="all">
          <span class="photo-day-icon">🖼️</span>
          <span class="photo-day-text"><b>Todas las fotos</b><small>${total} ${total === 1 ? "foto" : "fotos"}</small></span>
          <span class="photo-day-arrow">›</span>
        </button>
        ${groups.map(([key, files]) => `
          <button class="photo-day-option" type="button" data-photo-day="${escapeHtml(key)}">
            <span class="photo-day-icon">📅</span>
            <span class="photo-day-text"><b>${escapeHtml(formatPhotoDay(key))}</b><small>${files.length} ${files.length === 1 ? "foto" : "fotos"}</small></span>
            <span class="photo-day-arrow">›</span>
          </button>`).join("")}
        ${!groups.length ? '<div class="photo-day-empty">No hay fotos almacenadas todavía.</div>' : ""}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector(".photo-day-close")?.addEventListener("click", closePhotoDayMenu);
  overlay.addEventListener("click", event => { if (event.target === overlay) closePhotoDayMenu(); });
  overlay.querySelectorAll("[data-photo-day]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.photoDay;
      const files = key === "all"
        ? getImageFiles()
        : getImageFiles().filter(file => getPhotoDayKey(file) === key);

      activeFilter = "image";
      activePhotoDay = key === "all" ? null : key;
      closePhotoDayMenu();

      const title = key === "all" ? "Todas las fotos" : formatPhotoDay(key);
      const subtitle = key === "all"
        ? `${files.length} ${files.length === 1 ? "foto almacenada" : "fotos almacenadas"}`
        : `${files.length} ${files.length === 1 ? "foto de este día" : "fotos de este día"}`;

      openPhotoResults(files, title, subtitle, key === "all" ? null : key);
      log("Fotos seleccionadas", { dia: activePhotoDay || "todos", total: files.length });
    });
  });
}

// ============================================================
// RENDERIZAR ARCHIVOS
// ============================================================

function renderFiles() {

  const list =
    $("#fileList");

  if (!list) {
    return;
  }


  let filtered =
    allFiles.filter(
      matchesFilter
    );

  if (activeFilter === "image" && activePhotoDay) {
    filtered = filtered.filter(file => getPhotoDayKey(file) === activePhotoDay);
  }


  const title =
    $("#listTitle");

  const folderPathName =
    $("#folderPathName");

  const currentFolderName =
    activeFilter === "image"
      ? (activePhotoDay ? `Fotos · ${formatPhotoDay(activePhotoDay)}` : "Fotos")
      : activeFilter === "video"
        ? "Videos"
        : activeFilter === "audio"
          ? "Audios"
          : activeFilter === "pdf"
            ? "PDF"
            : activeFilter === "receipt"
              ? "Comprobantes"
              : "Todos";


  if (title) {
    title.textContent =
      currentFolderName === "Todos"
        ? "Todos los archivos"
        : currentFolderName;
  }

  // Actualiza únicamente la ruta visual del explorador.
  // No cambia el filtro ni la lógica de archivos.
  if (folderPathName) {
    folderPathName.textContent = currentFolderName;
  }


  list.innerHTML = "";


  if (!filtered.length) {

    list.innerHTML =
      '<div class="empty">No hay archivos para mostrar.</div>';

    return;
  }


  filtered.forEach(
    (file) => {

      list.appendChild(
        createFileElement(file)
      );
    }
  );
}


// ============================================================
// CARGAR ARCHIVOS
// ============================================================

async function loadFiles() {

  log(
    "Consultando API",
    CONFIG.API_URL
  );


  setConnection(
    false,
    "Conectando..."
  );


  try {

    const response =
      await fetch(
        CONFIG.API_URL,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        }
      );


    const text =
      await response.text();


    let data;


    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      data = {
        raw: text
      };
    }


    log(
      "Respuesta API",
      data
    );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    if (
      data &&
      data.ok === false
    ) {

      throw new Error(
        data.error ||
        "La API devolvió un error"
      );
    }


    allFiles =
      normalizeFiles(
        data
      );


    renderFiles();


    setConnection(
      true,
      `API conectada · ${allFiles.length} archivo(s)`
    );


  } catch (error) {

    allFiles = [];

    renderFiles();


    setConnection(
      false,
      "No se pudo conectar con la API"
    );


    log(
      "ERROR DE CONEXIÓN",
      {
        message:
          error?.message ||
          String(error)
      }
    );
  }
}


// ============================================================
// SUBIR ARCHIVOS
// ============================================================

async function uploadFiles(files) {

  if (
    !files ||
    !files.length
  ) {
    return;
  }


  for (
    const file of files
  ) {

    log(
      "Subiendo archivo",
      {
        name:
          file.name,

        type:
          file.type,

        size:
          file.size
      }
    );


    try {

      const response =
        await fetch(
          CONFIG.API_URL,
          {
            method: "POST",
            credentials: "include",

            headers: {
              "X-Archivo-Nombre":
                encodeURIComponent(
                  file.name
                ),

              "X-Archivo-Tipo":
                file.type ||
                "application/octet-stream"
            },

            body:
              file
          }
        );


      const text =
        await response.text();


      let data;


      try {

        data =
          JSON.parse(
            text
          );

      } catch {

        data = {
          raw: text
        };
      }


      log(
        response.ok
          ? "SUBIDA OK"
          : "ERROR AL SUBIR",
        data
      );


      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}`
        );
      }


      if (
        data &&
        data.ok === false
      ) {

        throw new Error(
          data.error ||
          "La API rechazó el archivo"
        );
      }


    } catch (error) {

      log(
        "ERROR DE SUBIDA",
        {
          name:
            file.name,

          message:
            error?.message ||
            String(error)
        }
      );
    }
  }


  await loadFiles();
}



function updateReceiptCard() {
  const card = document.querySelector('.card[data-filter="receipt"]');
  if (!card) return;

  const small = card.querySelector("small");
  if (!small) return;

  const total = getReceiptFiles().length;
  small.textContent =
    `${total} ${total === 1 ? "comprobante" : "comprobantes"}`;
}

// ============================================================
// TARJETAS PRINCIPALES
// ============================================================

document
  .querySelectorAll(
    ".card"
  )
  .forEach(
    (card) => {

      card.addEventListener(
        "click",
        () => {

          const requestedFilter =
            card.dataset.filter ||
            "all";

          if (requestedFilter === "image") {
            openPhotoDayMenu();
            return;
          }

          activeFilter = requestedFilter;
          activePhotoDay = null;

          renderFiles();

          if (activeFilter === "receipt") {
            log("Comprobantes abiertos", {
              total: getReceiptFiles().length
            });
          }

          const panel =
            document.querySelector(
              ".panel"
            );

          if (panel) {

            panel.scrollIntoView({
              behavior:
                "smooth"
            });
          }
        }
      );
    }
  );


// ============================================================
// REFRESCAR
// ============================================================

const refreshButton =
  $("#btnRefresh");

if (refreshButton) {

  refreshButton.addEventListener(
    "click",
    loadFiles
  );
}


// ============================================================
// LIMPIAR DIAGNÓSTICO
// ============================================================

const clearButton =
  $("#btnClearLog");

if (clearButton) {

  clearButton.addEventListener(
    "click",
    () => {

      if (logEl) {

        logEl.textContent =
          "Diagnóstico limpiado.";
      }
    }
  );
}


// ============================================================
// SELECTOR DE ARCHIVOS
// ============================================================

const fileInput =
  $("#fileInput");

if (fileInput) {

  fileInput.addEventListener(
    "change",
    (event) => {

      const files =
        event.target.files
          ? [...event.target.files]
          : [];

      if (files.length) {

        uploadFiles(
          files
        );
      }

      event.target.value = "";
    }
  );
}





// ============================================================
// VISOR DE VIDEO — v1.9.0 FLOTANTE / RESPONSIVO
// ============================================================

let videoFiles = [];
let videoIndex = 0;
let videoResizeBound = false;
let videoMetadataBound = false;

function refreshVideoFiles() {
  videoFiles = allFiles.filter(file => fileKind(file) === "video");
}

function ensureFloatingVideoStyles() {
  if (document.getElementById("mediafile-video-floating-styles")) return;

  const style = document.createElement("style");
  style.id = "mediafile-video-floating-styles";
  style.textContent = `
    /* El atributo hidden debe ganar incluso frente a display: grid !important. */
    #videoLightbox.video-lightbox[hidden] {
      display: none !important;
    }

    #videoLightbox.video-lightbox {
      position: fixed !important;
      inset: 0 !important;
      z-index: 99990 !important;
      display: grid !important;
      place-items: center !important;
      padding: max(12px, env(safe-area-inset-top))
               max(12px, env(safe-area-inset-right))
               max(12px, env(safe-area-inset-bottom))
               max(12px, env(safe-area-inset-left)) !important;
      box-sizing: border-box !important;
    }

    #videoLightbox .video-backdrop {
      position: absolute !important;
      inset: 0 !important;
    }

    #videoLightbox .video-dialog {
      position: relative !important;
      z-index: 2 !important;
      width: min(92vw, 900px) !important;
      max-width: 92vw !important;
      max-height: calc(100dvh - 24px) !important;
      height: auto !important;
      margin: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    #videoLightbox .video-topbar,
    #videoLightbox .video-bottom {
      flex: 0 0 auto !important;
    }

    #videoLightbox .video-stage {
      position: relative !important;
      min-width: 0 !important;
      min-height: 0 !important;
      width: 100% !important;
      max-height: calc(100dvh - 150px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      background: #000 !important;
    }

    #videoLightbox .video-player {
      display: block !important;
      width: auto !important;
      height: auto !important;
      max-width: 100% !important;
      max-height: calc(100dvh - 150px) !important;
      object-fit: contain !important;
      background: #000 !important;
      margin: 0 auto !important;
      flex: 0 1 auto !important;
    }

    #videoLightbox .video-arrow {
      position: absolute !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      z-index: 4 !important;
    }

    #videoLightbox .video-prev { left: 8px !important; }
    #videoLightbox .video-next { right: 8px !important; }

    #videoLightbox .video-arrow:disabled {
      opacity: .35 !important;
      pointer-events: none !important;
    }

    @media (max-width: 600px) {
      #videoLightbox.video-lightbox {
        padding: 8px !important;
      }
      #videoLightbox .video-dialog {
        width: 94vw !important;
        max-width: 94vw !important;
        max-height: calc(100dvh - 16px) !important;
        border-radius: 18px !important;
      }
      #videoLightbox .video-stage {
        max-height: calc(100dvh - 132px) !important;
      }
      #videoLightbox .video-player {
        max-height: calc(100dvh - 132px) !important;
        max-width: 100% !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function fitFloatingVideo() {
  const player = $("#videoLightboxPlayer");
  const stage = document.querySelector("#videoLightbox .video-stage");
  const dialog = document.querySelector("#videoLightbox .video-dialog");

  if (!player || !stage || !dialog) return;

  const vw = Math.max(240, window.innerWidth || 360);
  const vh = Math.max(320, window.innerHeight || 640);

  const maxWidth = Math.min(vw * 0.90, 900);
  const maxHeight = Math.max(180, vh - 150);

  const naturalWidth = Number(player.videoWidth);
  const naturalHeight = Number(player.videoHeight);

  if (naturalWidth > 0 && naturalHeight > 0) {
    const ratio = naturalWidth / naturalHeight;

    let width = maxWidth;
    let height = width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));

    player.style.width = `${width}px`;
    player.style.height = `${height}px`;

    stage.style.width = `${Math.min(width + 90, maxWidth + 90)}px`;
    stage.style.maxWidth = "100%";
  } else {
    player.style.width = "auto";
    player.style.height = "auto";
    stage.style.width = "100%";
  }
}

function bindFloatingVideoEvents() {
  if (videoMetadataBound) return;
  videoMetadataBound = true;

  const player = $("#videoLightboxPlayer");
  if (player) {
    player.addEventListener("loadedmetadata", fitFloatingVideo);
    player.addEventListener("loadeddata", fitFloatingVideo);
    player.addEventListener("error", () => {
      log("ERROR DEL REPRODUCTOR DE VIDEO", {
        src: player.currentSrc || player.src,
        code: player.error?.code || null,
        message: player.error?.message || "El navegador no pudo reproducir el video."
      });
    });
  }

  if (!videoResizeBound) {
    videoResizeBound = true;
    window.addEventListener("resize", fitFloatingVideo, { passive: true });
    window.addEventListener("orientationchange", () => {
      setTimeout(fitFloatingVideo, 120);
    }, { passive: true });
  }
}

function openVideoLightbox(file) {
  refreshVideoFiles();
  ensureFloatingVideoStyles();
  bindFloatingVideoEvents();

  const index = videoFiles.findIndex(item => {
    const a = item.fileId || item.id || getFileName(item);
    const b = file.fileId || file.id || getFileName(file);
    return String(a) === String(b);
  });

  videoIndex = index >= 0 ? index : 0;
  renderVideoLightbox();

  const box = $("#videoLightbox");
  if (box) {
    box.hidden = false;
    document.body.classList.add("video-open");
  }

  requestAnimationFrame(() => {
    fitFloatingVideo();
  });

  log("Visor de video flotante abierto", {
    videos: videoFiles.length,
    indice: videoIndex + 1
  });
}

function closeVideoLightbox() {
  const box = $("#videoLightbox");
  const player = $("#videoLightboxPlayer");

  if (player) {
    try { player.pause(); } catch (_) {}
    player.removeAttribute("src");
    player.load();
    player.style.width = "";
    player.style.height = "";
  }

  if (box) {
    box.hidden = true;
  }

  document.body.classList.remove("video-open");
}

function renderVideoLightbox() {
  refreshVideoFiles();

  if (!videoFiles.length) {
    closeVideoLightbox();
    return;
  }

  if (videoIndex < 0) videoIndex = videoFiles.length - 1;
  if (videoIndex >= videoFiles.length) videoIndex = 0;

  const file = videoFiles[videoIndex];
  const player = $("#videoLightboxPlayer");
  const title = $("#videoLightboxTitle");
  const counter = $("#videoLightboxCounter");
  const prev = $("#videoLightboxPrev");
  const next = $("#videoLightboxNext");

  if (title) title.textContent = getFileName(file);
  if (counter) {
    counter.textContent = `${videoIndex + 1} / ${videoFiles.length}`;
  }

  if (prev) prev.disabled = videoFiles.length <= 1;
  if (next) next.disabled = videoFiles.length <= 1;

  if (player) {
    try { player.pause(); } catch (_) {}
    player.crossOrigin = "use-credentials";
    player.style.width = "";
    player.style.height = "";
    player.src = getFileUrl(file);
    player.load();
    player.currentTime = 0;
  }

  requestAnimationFrame(fitFloatingVideo);
}

function moveVideo(direction) {
  if (videoFiles.length <= 1) return;

  videoIndex += direction;

  if (videoIndex < 0) videoIndex = videoFiles.length - 1;
  if (videoIndex >= videoFiles.length) videoIndex = 0;

  renderVideoLightbox();
}

async function downloadCurrentVideo() {
  if (!videoFiles.length) return;

  const file = videoFiles[videoIndex];
  const name = getFileName(file);
  const url = getFileUrl(file);
  const button = $("#videoLightboxDownload");

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "⏳ Descargando…";
    }

    log("Descargando video como Blob", { name, url });

    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("El archivo descargado está vacío.");
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = name;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    log("Descarga de video iniciada correctamente", {
      name,
      size: blob.size,
      type: blob.type
    });
  } catch (error) {
    log("ERROR DE DESCARGA DE VIDEO", {
      name,
      message: error?.message || String(error)
    });
    alert("No se pudo descargar el video. Revisa el diagnóstico.");
  } finally {
    setTimeout(() => {
      if (button) {
        button.disabled = false;
        button.textContent = "⬇️ Descargar";
      }
    }, 1200);
  }
}

function initVideoLightbox() {
  ensureFloatingVideoStyles();
  bindFloatingVideoEvents();

  document.addEventListener("click", event => {
    const target = event.target;

    if (target.closest("#videoLightboxClose") ||
        target.closest("[data-video-close]")) {
      event.preventDefault();
      event.stopPropagation();
      closeVideoLightbox();
      return;
    }

    if (target.closest("#videoLightboxPrev")) {
      event.preventDefault();
      event.stopPropagation();
      moveVideo(-1);
      return;
    }

    if (target.closest("#videoLightboxNext")) {
      event.preventDefault();
      event.stopPropagation();
      moveVideo(1);
      return;
    }

    if (target.closest("#videoLightboxDownload")) {
      event.preventDefault();
      event.stopPropagation();
      downloadCurrentVideo();
      return;
    }
  }, true);

  document.addEventListener("keydown", event => {
    const box = $("#videoLightbox");
    if (!box || box.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeVideoLightbox();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveVideo(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveVideo(1);
    }
  });

  log("Visor de video flotante inicializado", {
    cerrar: !!$("#videoLightboxClose"),
    anterior: !!$("#videoLightboxPrev"),
    siguiente: !!$("#videoLightboxNext"),
    descargar: !!$("#videoLightboxDownload")
  });
}


// ============================================================
// VISOR DE IMAGEN / LIGHTBOX — v1.6.0
// ============================================================

let galleryImages = [];
let lightboxIndex = 0;
let lightboxPreviousOverflow = "";

function refreshGalleryImages() {
  galleryImages = getImageFiles();
}

function openImageLightbox(file) {
  refreshGalleryImages();

  const index = galleryImages.findIndex(item => {
    const a = item.fileId || item.id || getFileName(item);
    const b = file.fileId || file.id || getFileName(file);
    return String(a) === String(b);
  });

  lightboxIndex = index >= 0 ? index : 0;

  renderLightbox();

  const lightbox = $("#imageLightbox");
  if (lightbox) {
    lightbox.hidden = false;
    lightboxPreviousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("lightbox-open");
  }

  log("Visor de imagen abierto", {
    imagenes: galleryImages.length,
    indice: lightboxIndex + 1
  });
}

function closeImageLightbox() {
  const lightbox = $("#imageLightbox");

  if (lightbox) {
    lightbox.hidden = true;
  }

  document.body.style.overflow = lightboxPreviousOverflow || "";
  document.body.classList.remove("lightbox-open");
}

function renderLightbox() {
  refreshGalleryImages();

  if (!galleryImages.length) {
    closeImageLightbox();
    return;
  }

  if (lightboxIndex < 0) {
    lightboxIndex = galleryImages.length - 1;
  }

  if (lightboxIndex >= galleryImages.length) {
    lightboxIndex = 0;
  }

  const file = galleryImages[lightboxIndex];
  const image = $("#lightboxImage");
  const title = $("#lightboxTitle");
  const counter = $("#lightboxCounter");
  const prev = $("#lightboxPrev");
  const next = $("#lightboxNext");

  if (image) {
    image.src = getFileUrl(file);
    image.alt = getFileName(file);
  }

  if (title) {
    title.textContent = getFileName(file);
  }

  if (counter) {
    counter.textContent =
      `${lightboxIndex + 1} / ${galleryImages.length}`;
  }

  // Con dos o más imágenes, las flechas permiten recorrerlas.
  // Con una sola, quedan desactivadas.
  if (prev) {
    prev.disabled = galleryImages.length <= 1;
  }

  if (next) {
    next.disabled = galleryImages.length <= 1;
  }
}

function lightboxMove(direction) {
  if (galleryImages.length <= 1) return;

  lightboxIndex += direction;

  if (lightboxIndex < 0) {
    lightboxIndex = galleryImages.length - 1;
  }

  if (lightboxIndex >= galleryImages.length) {
    lightboxIndex = 0;
  }

  renderLightbox();
}

async function downloadCurrentLightboxImage() {
  if (!galleryImages.length) return;

  const file = galleryImages[lightboxIndex];
  const url = getFileUrl(file);
  const name = getFileName(file);
  const button = $("#lightboxDownload");

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "⏳ Descargando…";
    }

    // El atributo download no siempre funciona con URLs de otro dominio.
    // Descargamos el archivo como Blob y creamos una URL local para forzar
    // la descarga en Android/Chrome sin abrir otra pestaña.
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = name;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 5000);

    log("Descarga iniciada correctamente", {
      name,
      size: blob.size,
      type: blob.type
    });

  } catch (error) {
    log("ERROR DE DESCARGA", {
      name,
      message: error?.message || String(error)
    });

    // Si el navegador bloquea la descarga Blob, mostramos un aviso
    // en lugar de abrir silenciosamente una pestaña nueva.
    alert("No se pudo iniciar la descarga. Revisa el diagnóstico.");

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "⬇️ Descargar";
    }
  }
}

function initImageLightbox() {
  document.addEventListener("click", event => {
    const target = event.target;

    if (target.closest("#lightboxClose") ||
        target.closest("[data-lightbox-close]")) {
      event.preventDefault();
      event.stopPropagation();
      closeImageLightbox();
      return;
    }

    if (target.closest("#lightboxPrev")) {
      event.preventDefault();
      event.stopPropagation();
      lightboxMove(-1);
      return;
    }

    if (target.closest("#lightboxNext")) {
      event.preventDefault();
      event.stopPropagation();
      lightboxMove(1);
      return;
    }

    if (target.closest("#lightboxDownload")) {
      event.preventDefault();
      event.stopPropagation();
      downloadCurrentLightboxImage();
      return;
    }
  }, true);

  document.addEventListener("keydown", event => {
    const lightbox = $("#imageLightbox");
    if (!lightbox || lightbox.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeImageLightbox();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      lightboxMove(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      lightboxMove(1);
    }
  });

  log("Visor inicializado", {
    cerrar: !!$("#lightboxClose"),
    anterior: !!$("#lightboxPrev"),
    siguiente: !!$("#lightboxNext"),
    descargar: !!$("#lightboxDownload")
  });
}

// ============================================================
// GALERÍA REAL — v1.5.0
// ============================================================

function getImageFiles() {
  return allFiles.filter(file => fileKind(file) === "image");
}

function renderGallery() {
  const grid = $("#galleryGrid");
  const count = $("#galleryCount");

  if (!grid) return;

  const images = getImageFiles();

  if (count) {
    count.textContent =
      `${images.length} ${images.length === 1 ? "imagen" : "imágenes"}`;
  }

  grid.innerHTML = "";

  if (!images.length) {
    grid.innerHTML =
      '<div class="gallery-empty">No hay imágenes almacenadas todavía.</div>';
    return;
  }

  images.forEach(file => {
    const name = getFileName(file);
    const item = document.createElement("button");

    item.type = "button";
    item.className = "gallery-item";
    item.title = name;

    const image = document.createElement("img");
    image.src = getFileUrl(file);
    image.alt = name;
    image.loading = "lazy";

    image.addEventListener("error", () => {
      item.innerHTML =
        '<div class="gallery-empty" style="height:100%;display:grid;place-items:center">🖼️<br>Vista no disponible</div>';
    });

    const label = document.createElement("div");
    label.className = "gallery-item-name";
    label.textContent = name;

    item.appendChild(image);
    item.appendChild(label);

    item.addEventListener("click", () => {
      openImageLightbox(file);
    });

    grid.appendChild(item);
  });
}

function showGallery() {
  const gallery = $("#galleryPanel");
  const panel = document.querySelector(".panel");

  if (gallery) {
    gallery.hidden = false;
    renderGallery();
    gallery.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  if (panel) {
    panel.style.display = "none";
  }

  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.remove("active");
  });

  const galleryNavButton = $("#navGallery");
  if (galleryNavButton) {
    galleryNavButton.classList.add("active");
  }

  log("Galería abierta", {
    imagenes: getImageFiles().length
  });
}

function showFiles() {
  const gallery = $("#galleryPanel");
  const panel = document.querySelector(".panel");

  if (gallery) {
    gallery.hidden = true;
  }

  if (panel) {
    panel.style.display = "";
    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.remove("active");
  });

  const filesNavButton = $("#navFiles");
  if (filesNavButton) {
    filesNavButton.classList.add("active");
  }
}


// ============================================================
// NAVEGACIÓN
// ============================================================

const navFiles =
  $("#navFiles");

if (navFiles) {

  navFiles.addEventListener(
    "click",
    () => {
      activeFilter = "all";
      activePhotoDay = null;
      renderFiles();
      showFiles();
    }
  );
}


const navGallery =
  $("#navGallery");

if (navGallery) {
  navGallery.addEventListener(
    "click",
    showGallery
  );
}


const navConfig =
  $("#navConfig");

if (navConfig) {

  navConfig.addEventListener(
    "click",
    () => {

      alert(
        "Configuración avanzada de Mediafile DNL."
      );
    }
  );
}



const galleryBack =
  $("#btnGalleryBack");

if (galleryBack) {
  galleryBack.addEventListener(
    "click",
    showFiles
  );
}

initImageLightbox();

// ============================================================
// MENÚ FLOTANTE DE FOTOS POR DÍA — ESTILOS AISLADOS
// ============================================================

(function injectPhotoDayStyles() {
  if (document.getElementById("photoDayMenuStyles")) return;
  const style = document.createElement("style");
  style.id = "photoDayMenuStyles";
  style.textContent = `
    .photo-day-overlay{position:fixed;inset:0;z-index:99990;display:grid;place-items:center;padding:18px;background:rgba(2,7,15,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:photoDayFade .18s ease-out}
    .photo-day-dialog{width:min(560px,100%);max-height:min(760px,88vh);overflow:hidden;border:1px solid rgba(74,197,255,.42);border-radius:24px;background:linear-gradient(145deg,rgba(8,20,35,.98),rgba(4,11,22,.98));box-shadow:0 24px 80px rgba(0,0,0,.62),0 0 36px rgba(42,180,255,.1);animation:photoDayPop .22s cubic-bezier(.2,.8,.2,1)}
    .photo-day-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 20px 16px;border-bottom:1px solid rgba(110,190,235,.15)}
    .photo-day-eyebrow{display:block;margin-bottom:5px;color:#63d8ff;font-size:11px;font-weight:800;letter-spacing:.18em}
    .photo-day-head h2{margin:0;color:#f3f9ff;font-size:clamp(22px,5vw,30px)}
    .photo-day-head p{margin:5px 0 0;color:#8da2b7;font-size:14px}
    .photo-day-close{flex:0 0 auto;width:48px;height:48px;border:1px solid rgba(91,207,255,.35);border-radius:15px;color:#eaf8ff;background:rgba(23,39,56,.78);font-size:25px;cursor:pointer}
    .photo-day-list{display:grid;gap:10px;max-height:calc(min(760px,88vh) - 118px);overflow:auto;padding:14px}
    .photo-day-option{width:100%;display:grid;grid-template-columns:48px 1fr 24px;align-items:center;gap:12px;min-height:68px;padding:10px 13px;border:1px solid rgba(87,181,233,.18);border-radius:17px;color:#edf8ff;text-align:left;background:rgba(11,27,45,.78);cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    .photo-day-option:hover,.photo-day-option:focus-visible{transform:translateY(-2px);border-color:rgba(87,207,255,.62);background:rgba(18,43,67,.92);outline:none}
    .photo-day-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:linear-gradient(145deg,rgba(60,188,255,.2),rgba(95,83,255,.15));font-size:24px}
    .photo-day-text{min-width:0;display:grid;gap:4px}.photo-day-text b{overflow:hidden;color:#f4fbff;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.photo-day-text small{color:#8ea5ba;font-size:13px}
    .photo-day-arrow{color:#66d9ff;font-size:30px;line-height:1}.photo-day-empty{padding:34px 16px;color:#91a6ba;text-align:center}
    .photo-results-overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:12px;background:rgba(2,7,15,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:photoDayFade .18s ease-out}
    .photo-results-dialog{width:min(900px,100%);height:min(820px,92vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(74,197,255,.46);border-radius:24px;background:linear-gradient(145deg,rgba(8,20,35,.99),rgba(4,11,22,.99));box-shadow:0 28px 90px rgba(0,0,0,.68),0 0 40px rgba(42,180,255,.12);animation:photoDayPop .22s cubic-bezier(.2,.8,.2,1)}
    .photo-results-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 18px 14px;border-bottom:1px solid rgba(110,190,235,.15)}
    .photo-results-head-main{min-width:0}.photo-results-eyebrow{display:block;margin-bottom:4px;color:#63d8ff;font-size:10px;font-weight:800;letter-spacing:.18em}.photo-results-head h2{margin:0;color:#f3f9ff;font-size:clamp(21px,5vw,30px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.photo-results-head p{margin:4px 0 0;color:#8da2b7;font-size:14px}
    .photo-results-close{flex:0 0 auto;width:48px;height:48px;border:1px solid rgba(91,207,255,.35);border-radius:15px;color:#eaf8ff;background:rgba(23,39,56,.78);font-size:25px;cursor:pointer}.photo-results-close:hover{background:rgba(30,54,75,.95);transform:scale(1.03)}
    .photo-results-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;color:#8ea5ba;font-size:13px;border-bottom:1px solid rgba(110,190,235,.1)}
    .photo-results-back{border:1px solid rgba(91,207,255,.25);border-radius:12px;padding:8px 12px;color:#dff7ff;background:rgba(20,44,65,.72);font-weight:700;cursor:pointer}.photo-results-back:hover{border-color:rgba(91,207,255,.62);background:rgba(27,58,84,.9)}
    .photo-results-grid{flex:1;overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:12px;align-content:start}
    .photo-results-grid .file{min-width:0}.photo-results-empty{grid-column:1/-1;display:grid;place-items:center;min-height:180px;color:#91a6ba;text-align:center}
    @media(max-width:520px){.photo-results-overlay{padding:8px}.photo-results-dialog{height:94vh;border-radius:20px}.photo-results-head{padding:15px 13px 12px}.photo-results-grid{padding:10px;grid-template-columns:1fr;gap:10px}.photo-results-toolbar{padding:9px 11px}}
    @keyframes photoDayFade{from{opacity:0}to{opacity:1}}@keyframes photoDayPop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @media(max-width:520px){.photo-day-overlay{padding:12px}.photo-day-dialog{border-radius:21px}.photo-day-head{padding:17px 15px 14px}.photo-day-list{padding:11px}.photo-day-option{min-height:64px}}
    @media(prefers-reduced-motion:reduce){.photo-day-overlay,.photo-day-dialog{animation:none}.photo-day-option{transition:none}}
  `;
  document.head.appendChild(style);
})();

// ============================================================
// INICIO
// ============================================================

log(
  "Mediafile DNL iniciado",
  {
    version:
      CONFIG.VERSION,

    api:
      CONFIG.API_URL
  }
);


loadFiles();


// Fallback: abrir videos desde cualquier tarjeta/listado que tenga un elemento
// marcado con data-video-open, sin alterar los controles existentes.
document.addEventListener("click", event => {
  const target = event.target.closest("[data-video-open]");
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();

  const index = Number(target.dataset.videoIndex);
  refreshVideoFiles();

  if (Number.isFinite(index) && videoFiles[index]) {
    openVideoLightbox(videoFiles[index]);
  }
}, true);

