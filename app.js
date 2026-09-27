/*
  Mediafile DNL - frontend
  VERSION 1.3.0

  El navegador NO contiene claves de Backblaze.
  Todo pasa por el Worker API.
*/

const CONFIG = {
  API_URL: "https://m-e2a5ediafile-dnl.danny941117.workers.dev",
  VERSION: "1.3.0"
};

const $ = (selector) => document.querySelector(selector);

const logEl = $("#diagnosticLog");

let allFiles = [];
let activeFilter = "all";


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
// FILTROS
// ============================================================

function matchesFilter(file) {
  if (activeFilter === "all") {
    return true;
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
    () => openFile(file)
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
    () => previewFile(file)
  );


  downloadButton.addEventListener(
    "click",
    () => downloadFile(file)
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
// RENDERIZAR ARCHIVOS
// ============================================================

function renderFiles() {

  const list =
    $("#fileList");

  if (!list) {
    return;
  }


  const filtered =
    allFiles.filter(
      matchesFilter
    );


  const title =
    $("#listTitle");


  if (title) {

    title.textContent =
      activeFilter === "image"
        ? "Fotos"
        : activeFilter === "video"
          ? "Videos"
          : activeFilter === "audio"
            ? "Audios"
            : activeFilter === "pdf"
              ? "PDF"
              : "Todos los archivos";
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

          activeFilter =
            card.dataset.filter ||
            "all";

          renderFiles();

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
// NAVEGACIÓN
// ============================================================

const navFiles =
  $("#navFiles");

if (navFiles) {

  navFiles.addEventListener(
    "click",
    () => {

      activeFilter =
        "all";

      renderFiles();

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


const navGallery =
  $("#navGallery");

if (navGallery) {

  navGallery.addEventListener(
    "click",
    () => {

      activeFilter =
        "image";

      renderFiles();

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
