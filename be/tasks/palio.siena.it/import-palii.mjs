"use strict";

import * as cheerio from "cheerio";
import { Model } from "../../model/model.mjs";
import config from "../../config/config.mjs";
import { HttpsRequests } from "../../lib/https-requests.mjs";

class ImportPalii {
  constructor() {
    this.__model = new Model(config.db);
  }

  /**
   *
   * @param {number} palioId
   * @returns {Promise<void>}
   */
  async importPalio(palioId) {
    try {
      let url = `https://www.ilpalio.siena.it/5/Palio/${palioId.toString()}`;
      let response = await HttpsRequests.call(url, { method: "GET" });
      let $ = cheerio.load(response.body);
      let corniciato = $(".Corniciato");
      if (corniciato.length === 5) {
        let datiVittoriosa = $(corniciato[4]).children();
        let dirigenza = $(datiVittoriosa[0]).text();
        console.log(dirigenza);
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

(async () => {
  let _import = new ImportPalii();
  try {
    await _import.importPalio(19980816);
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
