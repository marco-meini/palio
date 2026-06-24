import { PgClientManager } from '../lib/pg-client-manager.js';
import { ModelCavalli } from './cavalli.model.js';
import { ModelFantini } from './fantini.model.js';
import { ModelPaliiContrade } from './palii-contrade.model.js';
import { ModelPalii } from './palii.model.js';
export class PgModels {
    palii;
    cavalli;
    fantini;
    paliiContrade;
    constructor(pgClient) {
        this.palii = new ModelPalii(pgClient);
        this.cavalli = new ModelCavalli(pgClient);
        this.fantini = new ModelFantini(pgClient);
        this.paliiContrade = new ModelPaliiContrade(pgClient);
    }
}
export class Model {
    pgClient;
    __modelPalii;
    __modelCavalli;
    __modelFantini;
    __modelPaliiContrade;
    constructor(config) {
        this.pgClient = new PgClientManager(config, console.info);
        this.__modelPalii = new ModelPalii(this.pgClient);
        this.__modelCavalli = new ModelCavalli(this.pgClient);
        this.__modelFantini = new ModelFantini(this.pgClient);
        this.__modelPaliiContrade = new ModelPaliiContrade(this.pgClient);
    }
}
//# sourceMappingURL=pg-models.js.map