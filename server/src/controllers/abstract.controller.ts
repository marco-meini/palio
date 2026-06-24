import { Router } from 'express';
import { Environment } from '../environment.js';

export abstract class Abstract_Controller {
  router: Router;

  constructor(
    public env: Environment,
    public route: string,
  ) {
    this.router = Router();
  }
}
