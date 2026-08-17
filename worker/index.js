/**
 * Titik masuk Cloudflare Worker untuk add.konohaserver.id.
 *
 * Hanya satu default export — Workers menolak start bila file utama
 * mengekspor nilai non-fungsi. Semua logika ada di worker/lib.js.
 */

import { tangani } from "./lib.js";

export default {
  fetch(request) {
    return tangani(request);
  },
};
