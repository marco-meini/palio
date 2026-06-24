export class ModelFantini {
    __pgCLient;
    constructor(pgClient) {
        this.__pgCLient = pgClient;
    }
    async truncate() {
        await this.__pgCLient.query('truncate table fantini cascade');
    }
    async getFantinoBySoprannome(detto) {
        return this.__pgCLient.queryReturnFirst('select * from fantini where fantino_soprannome=$1', [detto]);
    }
    async insert(fantino) {
        return this.__pgCLient.insert(fantino, 'fantini');
    }
    async updateNome(fantino) {
        await this.__pgCLient.query('update fantini set fantino_nome=$1 where fantino_id=$2', [
            fantino.fantino_nome,
            fantino.fantino_id,
        ]);
    }
}
//# sourceMappingURL=fantini.model.js.map