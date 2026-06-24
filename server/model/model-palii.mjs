import { PgClientManager } from "../lib/pg-client-manager.mjs";

class ModelPalii {
  /**
   * @param {PgClientManager} pgClient
   */
  constructor(pgClient) {
    this.__pgCLient = pgClient;
  }

  async truncate() {
    try {
      await this.__pgCLient.query("truncate table palii cascade");
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {number} id
   * @returns {Promise<{palio_id:number,palio_straordinario:boolean,palio_note:string}>}
   */
  async getPalioById(id) {
    try {
      let sql = `select * 
      from palii
      where palio_id=$1`;
      return await this.__pgCLient.queryReturnFirst(sql, [id]);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {{palio_id:number,palio_straordinario:boolean,palio_note:string}} palio
   * @returns {Promise<{palio_id:number,palio_straordinario:boolean,palio_note:string}>}
   */
  async insert(palio) {
    try {
      return await this.__pgCLient.insert(palio, "palii");
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

export { ModelPalii };
