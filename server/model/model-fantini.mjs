import { PgClientManager } from "../lib/pg-client-manager.mjs";

class ModelFantini {
  /**
   * @param {PgClientManager} pgClient
   */
  constructor(pgClient) {
    this.__pgCLient = pgClient;
  }

  async truncate() {
    try {
      await this.__pgCLient.query("truncate table fantini cascade");
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {string} name
   * @returns {Promise<{fantino_id:number,fantino_nome:string,antino_soprannome:string}>}
   */
  async getFantinoBySoprannome(detto) {
    try {
      return await this.__pgCLient.queryReturnFirst("select * from fantini where fantino_soprannome=$1", [detto]);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {{fantino_nome:string,fantino_soprannome:string}} fantino
   * @returns {Promise<{fantino_id:number,fantino_nome:string,fantino_soprannome:string}>}
   */
  async insert(fantino) {
    try {
      return await this.__pgCLient.insert(fantino, "fantini");
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {{fantino_id:number,fantino_nome:string,fantino_soprannome:string}} fantino
   * @returns {Promise<void>}
   */
  async updateNome(fantino) {
    try {
      await this.__pgCLient.query("update fantini set fantino_nome=$1 where fantino_id=$2", [fantino.fantino_nome, fantino.fantino_id]);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

export { ModelFantini };
