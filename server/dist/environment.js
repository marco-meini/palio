import { initConfig } from './config.js';
import { repoRoot, serverRoot } from './paths.js';
import { resolveApiPgConfig, resolveChatPgConfig } from './lib/db-config.js';
import { PgClientManager } from './lib/pg-client-manager.js';
import { initPostgresCliPool } from './lib/postgres-cli.js';
import { PgModels } from './model/pg-models.js';
export class Environment {
    serverRoot = serverRoot;
    repoRoot = repoRoot;
    config;
    pgConnection;
    chatPgConnection;
    pgModels;
    async init() {
        this.config = await initConfig();
        this.pgConnection = new PgClientManager(resolveApiPgConfig());
        this.chatPgConnection = new PgClientManager(resolveChatPgConfig());
        initPostgresCliPool(this.chatPgConnection);
        this.pgModels = new PgModels(this.pgConnection);
    }
}
//# sourceMappingURL=environment.js.map