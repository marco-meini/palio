import cookieParser from 'cookie-parser';
import express, { json } from 'express';
import { AuthController } from './controllers/auth.controller.js';
import { ChatController } from './controllers/chat.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { InvitesController } from './controllers/invites.controller.js';
import { UsersController } from './controllers/users.controller.js';
import { Environment } from './environment.js';
import { errorHandler } from './lib/http-error.js';

export class App {
  env: Environment;
  express: express.Application;

  constructor() {
    this.env = new Environment();
    this.express = express();
  }

  async init(): Promise<void> {
    await this.env.init();

    // dietro un reverse proxy (nginx / Caddy): IP e protocollo reali dagli header X-Forwarded-*
    this.express.set('trust proxy', 1);
    this.express.disable('x-powered-by');
    this.express.use(json());
    this.express.use(cookieParser());

    // Frontend e API sullo stesso origin (proxy in dev, nginx in prod): niente CORS.
    this.express.use('/api', new HealthController(this.env).router);
    this.express.use('/api/auth', new AuthController(this.env).router);
    this.express.use('/api/invites', new InvitesController(this.env).router);
    this.express.use('/api', new UsersController(this.env).router);
    this.express.use('/api', new ChatController(this.env).router);
    this.express.use(errorHandler);
  }
}
