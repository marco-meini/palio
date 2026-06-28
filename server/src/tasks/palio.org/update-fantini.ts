"use strict";

import * as cheerio from 'cheerio';
import { HttpsRequests } from '../../lib/https-requests.js';
import { initConfig } from '../../config.js';
import { resolveApiPgConfig } from '../../lib/db-config.js';
import { Model } from '../../model/pg-models.js';

const PAGES = [
  'https://www.ilpalio.org/dizionarioaf.htm',
  'https://www.ilpalio.org/dizionariogo.htm',
  'https://www.ilpalio.org/dizionariopz.htm',
];

class UpdaeFantini {
  __model: Model;

  constructor() {
    this.__model = new Model(resolveApiPgConfig() as import('pg').PoolConfig);
  }

  async exec() {
    for (const page of PAGES) {
      console.info(`****** ${page} *******`);
      const response = await HttpsRequests.call(page, { method: 'GET' });
      const $ = cheerio.load(response.body);
      const table = $('table[size=5pt]');
      if (table) {
        const trArray = table.children().children();
        for (const tr of trArray) {
          const $tr = $(tr);
          const tdArray = $tr.children();
          const nome = $(tdArray[0]).children().text().replace(/\s/g, ' ').trim();
          const soprannome = $(tdArray[1]).children().text().replace(/\s/g, ' ').trim();
          if (nome === 'NOMI INCOMPLETI') {
            break;
          }
          const fantino = await this.__model.__modelFantini.getFantinoBySoprannome(soprannome.toUpperCase());
          if (fantino) {
            fantino.fantino_nome = nome;
            await this.__model.__modelFantini.updateNome(fantino);
          }
        }
      }
    }
  }
}

(async () => {
  await initConfig();
  const _task = new UpdaeFantini();
  try {
    await _task.exec();
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
