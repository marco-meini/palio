import type { PoolConfig } from 'pg';
import { AppConfig, initConfig } from './config.js';
import { repoRoot, serverRoot } from './paths.js';
import { resolveApiPgConfig } from './lib/db-config.js';
import { PgClientManager } from './lib/pg-client-manager.js';
import { initPostgresCliPool } from './lib/postgres-cli.js';
import { PgModels } from './model/pg-models.js';

export class Environment {
  readonly serverRoot = serverRoot;
  readonly repoRoot = repoRoot;
  config!: AppConfig;
  pgConnection!: PgClientManager;
  pgModels!: PgModels;

  async init(): Promise<void> {
    this.config = await initConfig();
    this.pgConnection = new PgClientManager(resolveApiPgConfig(this.config) as PoolConfig);
    initPostgresCliPool(this.pgConnection);
    this.pgModels = new PgModels(this.pgConnection);
  }
}
