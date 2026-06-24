import { Router } from 'express';
export class Abstract_Controller {
    env;
    route;
    router;
    constructor(env, route) {
        this.env = env;
        this.route = route;
        this.router = Router();
    }
}
//# sourceMappingURL=abstract.controller.js.map