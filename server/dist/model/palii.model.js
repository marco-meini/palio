export class ModelPalii {
    __pgCLient;
    constructor(pgClient) {
        this.__pgCLient = pgClient;
    }
    async truncate() {
        await this.__pgCLient.query('truncate table palii cascade');
    }
    async getPalioById(id) {
        return this.__pgCLient.queryReturnFirst(`select *
      from palii
      where palio_id=$1`, [id]);
    }
    async insert(palio) {
        return this.__pgCLient.insert(palio, 'palii');
    }
}
//# sourceMappingURL=palii.model.js.map