'use strict';

const suite = require('core/suite');
const common = require('./assets/common');
const schema = require('./assets/schemas/formula.schema.json');
const cloud = require('core/cloud');
const expect = require('chakram').expect;

const opts = { name: 'formula instances', payload: common.genFormula({}), schema: schema };

suite.forPlatform('formulas', opts, (test) => {
  /* Create a formula instance to use in the tests below */
  let elementInstanceId, formulaId, formulaInstanceId;
  before(() => {
    return common.createFAndFI()
      .then(r => {
        formulaId = r.formulaId;
        formulaInstanceId = r.formulaInstanceId;
        elementInstanceId = r.elementInstanceId;
      });
  });

  /* Cleanup */
  after(() => common.cleanup(elementInstanceId, formulaId, formulaInstanceId));

  /* 200 on DELETE and PUT to /formulas/:id/instances/:id/active to activate and deactivate instance */
  it('should allow activating and deactivating formula instance', () => {
    const baseApi = `/formulas/${formulaId}/instances/${formulaInstanceId}`;
    const api = `${baseApi}/active`;
    return cloud.delete(api)
      .then(r => cloud.get(baseApi))
      .then(r => expect(r.body.active).to.equal(false))
      .then(r => cloud.put(api))
      .then(r => cloud.get(baseApi))
      .then(r => expect(r.body.active).to.equal(true));
  });

  it('should allow updating a formula instance', () => {
    const formulaInstance = require('./assets/formulas/simple-successful-formula-instance');
    formulaInstance.configuration['trigger-instance'] = elementInstanceId;
    return cloud.put(`${test.api}/${formulaId}/instances/${formulaInstanceId}`, formulaInstance);
  });

  /* 404 on PUT where formula and formula instance do not exist */
  test
    .withApi('/formulas/-1/instances/-1/active')
    .should.return404OnPut();

  /* 404 on DELETE where formula and formula instance do not exist */
  test
    .withApi('/formulas/-1/instances/-1/active')
    .should.return404OnDelete();
});