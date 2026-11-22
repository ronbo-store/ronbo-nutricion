# Licencias — Modo espejo (estimación de pose en el dispositivo)

Componentes vendored en este repo para el «Modo espejo» de la batería
de pruebas físicas. Todos se cargan SOLO cuando la persona abre el
conteo con cámara; ninguno forma parte del arranque normal de la app.
Todo el procesamiento ocurre en el propio teléfono: ningún video ni
fotograma se guarda, se sube ni sale del aparato.

| Archivo | Componente | Versión | Licencia |
|---|---|---|---|
| `tf-4.22.0.min.js` | TensorFlow.js (runtime) | 4.22.0 | Apache License 2.0 |
| `pose-detection-2.1.3.min.js` | @tensorflow-models/pose-detection | 2.1.3 | Apache License 2.0 |
| `pose-movenet/model.json` + `group1-shard*.bin` | MoveNet SinglePose Lightning (modelo) | tfhub v4 | Apache License 2.0 |

Fuentes oficiales de la descarga (2026-11-22):
- https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js
- https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js
- https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4

SHA-256 de lo vendored:
- tf-4.22.0.min.js — 300dfae273d20b4046f46a06d735688f03675a807561e9bcb5f664eb2f3d2831
- pose-detection-2.1.3.min.js — eedb38254421de21571e88db202382104b98f36de221a94f956d7bd01f43abcd
- pose-movenet/model.json — c65a3447162efa0c42af29498a4b151f4415b36ff3ae6fae2b28a32e840dcbfb
- pose-movenet/group1-shard1of2.bin — b42c3232bf13b0efc691d3f0693dd3fc74404f709b1deee0a271828af6dbbea2
- pose-movenet/group1-shard2of2.bin — 8253ab965aa3122c08f331777ca395ce9ca19bb9e7cb278b99de1c46dbdeb6dc

El texto completo de la Apache License 2.0:
https://www.apache.org/licenses/LICENSE-2.0
