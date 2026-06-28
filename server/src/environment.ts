import type { PoolConfig } from 'pg';
import { initConfig } from './config.js';
import { repoRoot, serverRoot } from './paths.js';
import { resolveApiPgConfig, resolveChatPgConfig } from './lib/db-config.js';
import { PgClientManager } from './lib/pg-client-manager.js';
import { initPostgresCliPool } from './lib/postgres-cli.js';
import { PgModels } from './model/pg-models.js';

export class Environment {
  readonly serverRoot = serverRoot;
  readonly repoRoot = repoRoot;
  config!: Awaited<ReturnType<typeof initConfig>>;
  pgConnection!: PgClientManager;
  chatPgConnection!: PgClientManager;
  pgModels!: PgModels;

  async init(): Promise<void> {
    this.config = await initConfig();
    this.pgConnection = new PgClientManager(resolveApiPgConfig() as PoolConfig);
    this.chatPgConnection = new PgClientManager(resolveChatPgConfig() as PoolConfig);
    initPostgresCliPool(this.chatPgConnection);
    this.pgModels = new PgModels(this.pgConnection);
  }
}
