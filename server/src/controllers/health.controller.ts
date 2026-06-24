import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import { profileTest } from '../lib/postgres-cli.js';

export class HealthController extends Abstract_Controller {
  constructor(env: import('../environment.js').Environment) {
    super(env, 'api');
    this.router.get('/health', this.getHealth.bind(this));
  }

  private async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const db = await profileTest();
      res.send({ ok: true, db });
    } catch (err) {
      res.status(503).send({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
