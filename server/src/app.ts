import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { json } from 'express';
import { AuthController } from './controllers/auth.controller.js';
import { ChatController } from './controllers/chat.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { Environment } from './environment.js';

export class App {
  env: Environment;
  express: express.Application;

  constructor() {
    this.env = new Environment();
    this.express = express();
  }

  async init(): Promise<void> {
    await this.env.init();

    const { corsOrigin } = this.env.config.server;

    this.express.use(
      cors({
        origin: corsOrigin,
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
      }),
    );
    this.express.use(json());
    this.express.use(cookieParser());

    const health = new HealthController(this.env);
    const auth = new AuthController(this.env);
    const chat = new ChatController(this.env);

    this.express.use('/api', health.router);
    this.express.use('/api/auth', auth.router);
    this.express.use('/api', chat.router);
  }
}
