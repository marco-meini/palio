import { Abstract_Controller } from './abstract.controller.js';
import { profileTest } from '../lib/postgres-cli.js';
export class HealthController extends Abstract_Controller {
    constructor(env) {
        super(env, 'api');
        this.router.get('/health', this.getHealth.bind(this));
    }
    async getHealth(_req, res) {
        try {
            const db = await profileTest();
            res.send({ ok: true, db });
        }
        catch (err) {
            res.status(503).send({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
//# sourceMappingURL=health.controller.js.map