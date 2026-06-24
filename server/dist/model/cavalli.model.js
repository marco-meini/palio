export class ModelCavalli {
    __pgCLient;
    constructor(pgClient) {
        this.__pgCLient = pgClient;
    }
    async truncate() {
        await this.__pgCLient.query('truncate table cavalli cascade');
    }
    async getCavalloByNome(nome) {
        return this.__pgCLient.queryReturnFirst('select * from cavalli where cavallo_nome=$1', [nome]);
    }
    async insert(cavallo) {
        return this.__pgCLient.insert(cavallo, 'cavalli');
    }
}
//# sourceMappingURL=cavalli.model.js.map