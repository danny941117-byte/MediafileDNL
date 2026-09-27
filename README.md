# Mediafile DNL

Frontend estático para Mediafile DNL.

## Archivos
- `index.html` — interfaz principal
- `style.css` — estilos
- `app.js` — conexión con el Worker API

## Arquitectura
GitHub Pages publica el frontend.
El frontend se conecta al Worker API de Cloudflare.
El Worker API se conecta con Backblaze B2.

**Nunca colocar claves de Backblaze en estos archivos.**
