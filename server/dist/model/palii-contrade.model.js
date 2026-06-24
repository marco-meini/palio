export class ModelPaliiContrade {
    __pgCLient;
    constructor(pgClient) {
        this.__pgCLient = pgClient;
    }
    async truncate() {
        await this.__pgCLient.query('truncate table palii_contrade');
    }
    async insert(palio) {
        return this.__pgCLient.insert(palio, 'palii_contrade');
    }
}
//# sourceMappingURL=palii-contrade.model.js.map