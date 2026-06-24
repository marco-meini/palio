"use strict";

import * as cheerio from "cheerio";
import { HttpsRequests } from "../../lib/https-requests.mjs";
import { Model } from "../../model/model.mjs";
import config from "../../config/config.mjs";

const PAGES = ["https://www.ilpalio.org/dizionarioaf.htm", "https://www.ilpalio.org/dizionariogo.htm", "https://www.ilpalio.org/dizionariopz.htm"];

class UpdaeFantini {
  constructor() {
    this.__model = new Model(config.db);
  }

  async exec() {
    try {
      for (let page of PAGES) {
        console.info(`****** ${page} *******`);
        let response = await HttpsRequests.call(page, { method: "GET" });
        let $ = cheerio.load(response.body);
        let table = $("table[size=5pt]");
        if (table) {
          let trArray = table.children().children();
          for (let tr of trArray) {
            let $tr = $(tr);
            let tdArray = $tr.children();
            let nome = $(tdArray[0]).children().text().replace(/\s/g, " ").trim();
            let soprannome = $(tdArray[1]).children().text().replace(/\s/g, " ").trim();
            if (nome === "NOMI INCOMPLETI") {
              break;
            } else {
              let fantino = await this.__model.__modelFantini.getFantinoBySoprannome(soprannome.toUpperCase());
              if (fantino) {
                fantino.fantino_nome = nome;
                await this.__model.__modelFantini.updateNome(fantino);
              }
            }
          }
        }
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

(async () => {
  let _task = new UpdaeFantini();
  try {
    await _task.exec();
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
