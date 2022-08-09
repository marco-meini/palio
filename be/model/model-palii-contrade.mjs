import { PgClientManager } from "../lib/pg-client-manager.mjs";

class ModelPaliiContrade {
  /**
   * @param {PgClientManager} pgClient
   */
  constructor(pgClient) {
    this.__pgCLient = pgClient;
  }

  async truncate() {
    try {
      await this.__pgCLient.query("truncate table palii_contrade");
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {{pc_palio_id:number,pc_contrada_id:number,pc_vincente:boolean,pc_estratta:boolean,pc_fantino_id:number,pc_cavallo_id:number,pc_canape:number}} palio
   * @returns {Promise<{pc_palio_id:number,pc_contrada_id:number,pc_vincente:boolean,pc_estratta:boolean,pc_fantino_id:number,pc_cavallo_id:number,pc_canape:number}>}
   */
   async insert(palio) {
    try {
      return await this.__pgCLient.insert(palio, "palii_contrade");
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

export { ModelPaliiContrade };
