import { initConfig } from './config.js';
import { repoRoot, serverRoot } from './paths.js';
import { resolveApiPgConfig } from './lib/db-config.js';
import { PgClientManager } from './lib/pg-client-manager.js';
import { initPostgresCliPool } from './lib/postgres-cli.js';
import { PgModels } from './model/pg-models.js';
export class Environment {
    serverRoot = serverRoot;
    repoRoot = repoRoot;
    config;
    pgConnection;
    pgModels;
    async init() {
        this.config = await initConfig();
        this.pgConnection = new PgClientManager(resolveApiPgConfig(this.config));
        initPostgresCliPool(this.pgConnection);
        this.pgModels = new PgModels(this.pgConnection);
    }
}
//# sourceMappingURL=environment.js.map