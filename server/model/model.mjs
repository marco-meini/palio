import * as pg from "pg";
import { PgClientManager } from "../lib/pg-client-manager.mjs";
import { ModelCavalli } from "./model-cavalli.mjs";
import { ModelFantini } from "./model-fantini.mjs";
import { ModelPaliiContrade } from "./model-palii-contrade.mjs";
import { ModelPalii } from "./model-palii.mjs";

class Model {
  /**
   *
   * @param {pg.PoolConfig} config
   */
  constructor(config) {
    this.pgClient = new PgClientManager(config, console.info);
    this.__modelPalii = new ModelPalii(this.pgClient);
    this.__modelCavalli = new ModelCavalli(this.pgClient);
    this.__modelFantini = new ModelFantini(this.pgClient);
    this.__modelPaliiContrade = new ModelPaliiContrade(this.pgClient);
  }
}

export { Model };
