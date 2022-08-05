/**
 * Import database from ilpalio.org
 */

"use strict";

import { HttpsRequests } from "../lib/https-requests";
import * as cheerio from "cheerio";

const CONTRADE = {
  aquila: "aquila",
  bruco: "bruco",
  chiocciola: "chiocciola",
  civetta: "civetta",
  drago: "drago",
  giraffa: "giraffa",
  istrice: "istrice",
  leocorno: "leocorno",
  lupa: "lupa",
  nicchio: "nicchio",
  oca: "oca",
  onda: "onda",
  pantera: "pantera",
  selva: "selva",
  tartuca: "tartuca",
  torre: "torre",
  montone: "montone"
};

for (let c in CONTRADE) {
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
      let anno = $(tdArray[0]).children().text();
      let estratta = false;
      if (anno.charAt(anno.length - 1) === "*") {
        anno = anno.slice(0, -1);
        estratta = true;
      }
      let fantino = $(tdArray[1]).children().text();
      let cavallo = $(tdArray[2]).children().text();
      let canape = $(tdArray[3]).children().text();
      console.log([anno, vincente, estratta, fantino, cavallo, canape]);
    }
  }
}
