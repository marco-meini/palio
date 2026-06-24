/**
 * Import database from ilpalio.org
 */

"use strict";

import { HttpsRequests } from "../../lib/https-requests.mjs";
import * as cheerio from "cheerio";
import moment from "moment";
import config from "../../config/config.mjs";
import { Model } from "../../model/model.mjs";

moment.locale("it-IT");

const CONTRADE = {
  aquila: 1,
  bruco: 2,
  chiocciola: 3,
  civetta: 4,
  drago: 5,
  giraffa: 6,
  istrice: 7,
  leocorno: 8,
  lupa: 9,
  nicchio: 10,
  oca: 11,
  onda: 12,
  pantera: 13,
  selva: 14,
  tartuca: 15,
  torre: 16,
  montone: 17
};

// const CONTRADE = {
//   istrice: 7
// };

class ImportPalii {
  constructor() {
    this.__model = new Model(config.db);
  }

  /**
   * @param {{data:number,contrada:number,note:string,fantino:string,cavallo:string,vincente:boolean,canape:number,estratta:boolean}} row
   */
  async __processPalio(row) {
    try {
      console.info(`Process ${row.data}`);
      let palio = await this.__model.__modelPalii.getPalioById(row.data);
      if (!palio) {
        // { data: row.data, straordinario: row.note ? row.note.includes("straord.") || row.note.includes("straordinario") : false, note: row.note || null }
        await this.__model.__modelPalii.insert({
          palio_id: row.data,
          palio_straordinario: row.note ? row.note.includes("straord.") || row.note.includes("straordinario") : false,
          palio_note: row.note || null
        });
      }
      let palioContrada = {
        pc_palio_id: row.data,
        pc_contrada_id: row.contrada,
        pc_vincente: row.vincente,
        pc_estratta: row.estratta,
        pc_fantino_id: null,
        pc_cavallo_id: null,
        pc_canape: row.canape
      };
      if (row.fantino) {
        let _fantino = await this.__model.__modelFantini.getFantinoBySoprannome(row.fantino);
        if (!_fantino) {
          _fantino = await this.__model.__modelFantini.insert({ fantino_soprannome: row.fantino });
        }
        palioContrada.pc_fantino_id = _fantino.fantino_id;
      }

      if (row.cavallo) {
        let _cavallo = await this.__model.__modelCavalli.getCavalloByNome(row.cavallo);
        if (!_cavallo) {
          _cavallo = await this.__model.__modelCavalli.insert({ cavallo_nome: row.cavallo });
        }
        palioContrada.pc_cavallo_id = _cavallo.cavallo_id;
      }

      try {
        await this.__model.__modelPaliiContrade.insert(palioContrada);
      } catch (e) {
        if (e.message.indexOf('duplicate key value violates unique constraint "palii_contrade_pkey"') < 0) {
          throw e;
        }
      }
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async truncate() {
    try {
      console.info(`truncate previous data`);
      await this.__model.__modelPalii.truncate();
      await this.__model.__modelCavalli.truncate();
      await this.__model.__modelFantini.truncate();
      await this.__model.__modelPaliiContrade.truncate();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async exec() {
    try {
      for (let c in CONTRADE) {
        console.info(`****** ${c} *******`);
        let url = `https://www.ilpalio.org/fantini_${c}.htm`;
        let response = await HttpsRequests.call(url, { method: "GET" });
        let $ = cheerio.load(response.body);
        let table = $("table[size=5pt]");
        if (table) {
          let trArray = table.children().children();
          for (let tr of trArray) {
            let $tr = $(tr);
            let tdArray = $tr.children();
            let font = $(tdArray[0]).children().children();
            let vincente = font.length > 0 && font[0].tagName === "b";
            let anno = $(tdArray[0]).children().text().replace("agsoto", "agosto").replace(/\s/g, "").replace("°", "");
            let data = parseInt(moment(anno, "DDMMMMYYYY").format("YYYYMMDD"));
            let estratta = false;
            if (anno.charAt(anno.length - 1) === "*") {
              anno = anno.slice(0, -1);
              estratta = true;
            }
            let fantino = $(tdArray[1]).children().text().replace(/\s/g, " ").replace("n.r.", "").replace("-", "").replace("(", "").replace(")", "").replace(".", "").trim().toUpperCase();
            let cavallo = $(tdArray[2]).children().text().replace(/\s/g, " ").replace("n.r.", "").replace("-", "").replace("(", "").replace(")", "").replace(".", "").trim().toUpperCase();
            let canapeStr = $(tdArray[3]).children().text();
            let canape = canapeStr === "R" ? 10 : parseInt(canapeStr);
            if (isNaN(canape)) canape = null;
            let note = $(tdArray[4]).children().text();
            let pc = { data: data, note: note, contrada: CONTRADE[c], fantino: fantino, cavallo: cavallo, vincente: vincente, canape: canape, estratta: estratta };
            try {
              await this.__processPalio(pc);
            } catch (e) {
              console.info(pc);
              throw e;
            }
          }
        }
      }
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async end() {
    try {
      await this.__model.pgClient.disconnect();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

(async () => {
  let _import = new ImportPalii();
  try {
    await _import.truncate();
    await _import.exec();
    await _import.end();
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
