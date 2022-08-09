import { PgClientManager } from "../lib/pg-client-manager.mjs";

class ModelCavalli {
  /**
   * @param {PgClientManager} pgClient
   */
  constructor(pgClient) {
    this.__pgCLient = pgClient;
  }

  async truncate() {
    try {
      await this.__pgCLient.query("truncate table cavalli cascade");
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {string} name
   * @returns {Promise<{cavallo_id,cavallo_nome}>}
   */
   async getCavalloByNome(nome) {
    try {
      return await this.__pgCLient.queryReturnFirst("select * from cavalli where cavallo_nome=$1", [nome]);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {{cavallo_nome}} cavallo
   * @returns {Promise<{cavallo_id,cavallo_nome}>}
   */
  async insert(cavallo) {
    try {
      return await this.__pgCLient.insert(cavallo, "cavalli");
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

export { ModelCavalli };
