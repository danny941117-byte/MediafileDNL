/*
  Mediafile DNL - frontend
  IMPORTANTE:
  - Aquí NO hay claves de Backblaze.
  - El navegador solamente habla con nuestro Worker API.
*/

const CONFIG = {
  API_URL: "https://m-e2a5ediafile-dnl.danny941117.workers.dev",
  VERSION: "1.3.0"
};

const $ = s => document.querySelector(s);

const logEl = $("#diagnosticLog");

let allFiles = [];
let activeFilter = "all";


// ============================================================
// DIAGNÓSTICO
// ============================================================

function log(title, data = "") {

  const time = new Date().toLocaleTimeString();

  let line = `[${time}] ${title}`;

  if (data) {
    line += "\n" +
      (
        typeof data === "string"
          ? data
          : JSON.stringify(data, null, 2)
      );
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

  el.textContent = "● " + text;
}


// ============================================================
// FORMATO DE TAMAÑO
// ============================================================

function formatBytes(n) {

  if (!Number.isFinite(Number(n))) {
    return "Tamaño desconocido";
  }

  n = Number(n);

  if (n < 1024) {
    return n + " B";
  }

  if (n < 1024 * 1024) {
    return (n / 1024).toFixed(1) + " KB";
  }

  if (n < 1024 * 1024 * 1024) {
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  return (
    n /
    1024 /
    1024 /
    1024
  ).toFixed(2) + " GB";
}


// ============================================================
// NORMALIZAR RESPUESTA DE ARCHIVOS
// ============================================================

function normalizeFiles(data) {

  const candidates = [

    data?.files,

    data?.archivos,

    data?.detalles?.files,

    data?.detalles?.archivos,

    data?.result?.files

  ];

  const arr =
    candidates.find(
      Array.isArray
    );

  return arr || [];
}


// ============================================================
// TIPO DE ARCHIVO
// ============================================================

function fileKind(f) {

  const type =
    String(
      f.contentType ||
      f.mimeType ||
      f.tipo ||
      ""
    ).toLowerCase();

  const name =
    String(
      f.fileName ||
      f.nombre ||
      ""
    ).toLowerCase();


  if (
    type.startsWith("video/") ||
    /\.(mp4|webm|mov|avi|mkv)$/i.test(name)
  ) {

    return "video";
  }


  if (
    type.startsWith("image/") ||
    /\.(png|jpg|jpeg|gif|webp|heic)$/i.test(name)
  ) {

    return "image";
  }


  return "other";
}


// ============================================================
// MOSTRAR ARCHIVOS
// ============================================================

function renderFiles() {

  const list = $("#fileList");

  if (!list) return;


  const filtered =
    activeFilter === "all"
      ? allFiles
      : allFiles.filter(
          f =>
            fileKind(f) === activeFilter
        );


  if ($("#listTitle")) {

    $("#listTitle").textContent =
      activeFilter === "image"
        ? "Fotos"
        : activeFilter === "video"
          ? "Videos"
          : "Todos los archivos";

  }


  if (!filtered.length) {

    list.innerHTML =
      '<div class="empty">No hay archivos para mostrar.</div>';

    return;
  }


  list.innerHTML =
    filtered
      .map(f => {

        const name =
          f.fileName ||
          f.nombre ||
          "Archivo sin nombre";


        const type =
          f.contentType ||
          f.mimeType ||
          f.tipo ||
          "archivo";


        const size =
          formatBytes(
            f.contentLength ??
            f.size ??
            f.tamañoBytes
          );


        const kind =
          fileKind(f);


        const icon =
          kind === "video"
            ? "🎬"
            : kind === "image"
              ? "🖼️"
              : "📄";


        return `
          <div class="file">

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
                ${escapeHtml(type)} · ${size}
              </div>

            </div>

          </div>
        `;

      })
      .join("");
}


// ============================================================
// ESCAPAR HTML
// ============================================================

function escapeHtml(s) {

  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
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

    const r =
      await fetch(
        CONFIG.API_URL,
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const text =
      await r.text();


    let data;


    try {

      data =
        JSON.parse(text);

    } catch {

      data = {
        raw: text
      };

    }


    log(
      "Respuesta API",
      data
    );


    if (!r.ok) {

      throw new Error(
        `HTTP ${r.status}`
      );

    }


    allFiles =
      normalizeFiles(data);


    renderFiles();


    setConnection(
      true,
      `API conectada · ${allFiles.length} archivo(s)`
    );


  } catch (err) {

    allFiles = [];

    renderFiles();


    setConnection(
      false,
      "No se pudo conectar con la API"
    );


    log(
      "ERROR DE CONEXIÓN",
      {
        message: err.message
      }
    );

  }

}


// ============================================================
// SUBIR ARCHIVOS
// ============================================================

async function uploadFiles(files) {

  for (const file of files) {

    log(
      "Subiendo archivo",
      {
        name: file.name,
        type: file.type,
        size: file.size
      }
    );


    try {

      /*
        IMPORTANTE:

        El Worker espera multipart/form-data
        con un campo llamado "file".

        NO colocamos manualmente Content-Type.
        El navegador crea automáticamente el
        boundary necesario.
      */

      const formData =
        new FormData();


      formData.append(
        "file",
        file,
        file.name
      );


      const r =
        await fetch(
          CONFIG.API_URL,
          {
            method: "POST",
            body: formData
          }
        );


      const text =
        await r.text();


      let data;


      try {

        data =
          JSON.parse(text);

      } catch {

        data = {
          raw: text
        };

      }


      if (r.ok) {

        log(
          "SUBIDA OK",
          data
        );

      } else {

        log(
          "ERROR AL SUBIR",
          data
        );

        throw new Error(
          `HTTP ${r.status}`
        );

      }


    } catch (err) {

      log(
        "ERROR DE SUBIDA",
        {
          name: file.name,
          message: err.message
        }
      );

    }

  }


  /*
    Después de terminar todas las subidas,
    volvemos a consultar el Worker.
  */

  await loadFiles();

}


// ============================================================
// TARJETAS / FILTROS
// ============================================================

document
  .querySelectorAll(".card")
  .forEach(btn => {

    btn.addEventListener(
      "click",
      () => {

        activeFilter =
          btn.dataset.filter;

        renderFiles();


        const panel =
          document.querySelector(
            ".panel"
          );


        if (panel) {

          panel.scrollIntoView({
            behavior: "smooth"
          });

        }

      }
    );

  });


// ============================================================
// BOTÓN ACTUALIZAR
// ============================================================

const btnRefresh =
  $("#btnRefresh");


if (btnRefresh) {

  btnRefresh.addEventListener(
    "click",
    loadFiles
  );

}


// ============================================================
// LIMPIAR DIAGNÓSTICO
// ============================================================

const btnClearLog =
  $("#btnClearLog");


if (btnClearLog) {

  btnClearLog.addEventListener(
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
    e => {

      if (
        e.target.files &&
        e.target.files.length
      ) {

        uploadFiles(
          [...e.target.files]
        );

      }


      /*
        Permite volver a seleccionar
        el mismo archivo posteriormente.
      */

      e.target.value = "";

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

      const panel =
        document.querySelector(
          ".panel"
        );


      if (panel) {

        panel.scrollIntoView({
          behavior: "smooth"
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
          behavior: "smooth"
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
        "Configuración avanzada la añadiremos en la siguiente etapa."
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
    version: CONFIG.VERSION,
    api: CONFIG.API_URL
  }
);


loadFiles();