'use strict';

const cloud = require('core/cloud');
const common = require('./assets/common');
const expect = require('chakram').expect;
const invalid = require('./assets/formulas/formula-with-invalid-configs');
const suite = require('core/suite');
const schema = require('./assets/schemas/formula.schema');

suite.forPlatform('formulas', { name: 'formula config', schema: schema }, (test) => {
  before(() => common.deleteFormulasByName('formulas', invalid.name)
    .then(r => common.deleteFormulasByName('formulas', 'complex-successful')));

  /* make sure config keys are being validated properly when creating a formula with config */
  test
    .withName('should not allow creating a formula with two configs that have the same key')
    .withJson(invalid)
    .should.return409OnPost();

  it('should not allow adding a config to a formula with the same key as an already existing config', () => {
    const config = { name: 'Bob the builder', key: 'yes.he.can', type: 'value' };
    const validator = (r) => expect(r).to.have.statusCode(409);

    let formulaId;
    return cloud.post(test.api, common.genFormula({}))
      .then(r => formulaId = r.body.id)
      .then(r => cloud.post(`${test.api}/${formulaId}/configuration`, config))
      .then(r => cloud.post(`${test.api}/${formulaId}/configuration`, config, validator))
      .then(r => cloud.delete(`${test.api}/${formulaId}`));
  });

  /**
   * Creates a formula with a trigger and steps that rely on a given variable.  Then, update that variable and the
   * trigger and steps that were relying on it should also be updated properly
   */
  it('should allow updating a variable key and all relying steps/triggers will be updated too', () => {
    const f = require('./assets/formulas/complex-successful-formula');
    const v = (r, key) => {
      expect(r).to.have.statusCode(200);
      expect(r.body).to.not.be.null;
      expect(r.body.triggers[0].properties.elementInstanceId).to.equal(`\${${key}}`);
      r.body.steps.filter((s) => s.properties.elementInstanceId !== undefined).forEach(rs => expect(rs.properties.elementInstanceId).to.equal(`\${${key}}`));
      return r;
    };

    const validateCreate = (r) => v(r, 'trigger-instance');

    const validateUpdate = (r) => v(r, 'sfdc.instance');

    const parseConfig = (formula) => formula.configuration.filter((c) => c.key === 'trigger-instance')[0];

    const parseConfigId = (formula) => parseConfig(formula).id;

    const genConfig = (formula) => {
      const c = parseConfig(formula);
      c.key = 'sfdc.instance';
      c.name = 'SFDC Instance';
      return c;
    };

    let formulaId, formulaConfigId;
    return cloud.post(test.api, f, validateCreate)
      .then(r => {
        formulaId = r.body.id;
        formulaConfigId = parseConfigId(r.body);
        return r;
      })
      .then(r => cloud.put(`${test.api}/${formulaId}/configuration/${formulaConfigId}`, genConfig(f)))
      .then(r => cloud.get(`${test.api}/${formulaId}`, validateUpdate))
      .then(r => cloud.delete(`${test.api}/${formulaId}`));
  });
});