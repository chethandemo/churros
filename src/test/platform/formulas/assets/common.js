'use strict';

const tools = require('core/tools');
const b64 = tools.base64Encode;
const chakram = require('chakram');
const expect = chakram.expect;
const util = require('util');
const provisioner = require('core/provisioner');
const cloud = require('core/cloud');
const fSchema = require('./schemas/formula.schema');
const fiSchema = require('./schemas/formula.instance.schema');

var exports = module.exports = {};

exports.genFormula = (opts) => new Object({
  name: (opts.name || 'churros-formula-name-' + tools.random())
});

exports.genTrigger = (opts) => new Object({
  type: (opts.type || 'scheduled'),
  properties: (opts.properties) || {
    cron: '0 0/15 * 1/1 * ? *'
  },
  onSuccess: (opts.onSuccess || null)
});

exports.genInstance = (opts) => new Object({
  name: (opts.name || 'churros-formula-instance-name')
});

exports.provisionSfdcWithPolling = () => provisioner.create('sfdc', {
  'event.notification.enabled': true,
  'event.vendor.type': 'polling',
  'event.poller.refresh_interval': 999999999
});

exports.provisionSfdcWithWebhook = () => provisioner.create('sfdc', {
  'event.notification.enabled': true,
  'event.vendor.type': 'webhook'
});

exports.generateSfdcEvent = (instanceId, payload) => {
  const url = `/events/sfdc`;
  const opts = { headers: { 'Element-Instances': instanceId } };
  return cloud
    .withOptions(opts)
    .post(url, payload);
};

exports.generateSfdcPollingEvent = (instanceId, payload) => {
  const headers = { 'Content-Type': 'application/json', 'Id': instanceId };
  const encodedId = b64(instanceId.toString());

  payload.instance_id = instanceId;

  return cloud
    .withOptions({ 'headers': headers })
    .post('/events/sfdcPolling/' + encodedId, payload);
};

const deleteFormulaInstance = (fId, fiId) =>
  cloud.delete(util.format('/formulas/%s/instances/%s', fId, fiId));

const getInstancesForFormula = (fId) =>
  chakram.get(util.format('/formulas/%s/instances', fId))
  .then(r => r.body);

const getInstancesForFormulas = (fs) =>
  Promise.all(fs.map(f => getInstancesForFormula(f.id)));

const deleteFormula = (fId) =>
  cloud.delete(util.format('/formulas/%s', fId));

const deleteFormulas = (fs) =>
  Promise.all(fs.map(f => deleteFormula(f.id)));

const getFormulasByName = (api, name) =>
  chakram.get(api)
  .then(r => r.body.filter(f => f.name === name));

const deleteInstancesForFormulas = (is) =>
  Promise.all(is.map(i => deleteFormulaInstance(i.formula.id, i.id)));

const deleteFormulasByName = (api, name) =>
  getFormulasByName(api, name)
  .then(fs =>
    getInstancesForFormulas(fs)
    .then(fis => [].concat.apply([], fis))
    .then(deleteInstancesForFormulas)
    .then(() => deleteFormulas(fs)));
exports.deleteFormulasByName = deleteFormulasByName;

const getAllExecutions = (fId, fiId, nextPage, all) => {
  all = all || [];
  const options = { qs: { nextPage: nextPage, pageSize: 200 } };
  return cloud.withOptions(options).get(`/formulas/${fId}/instances/${fiId}/executions`)
    .then(r => {
      expect(r.body).to.not.be.null;
      all = all.concat(r.body);
      const npt = r.response.headers['elements-next-page-token'];
      return npt === undefined ? all : getAllExecutions(fId, fiId, npt, all);
    });
};
exports.getAllExecutions = getAllExecutions;

exports.getFormulaInstanceExecutions = (fId, fiId) => {
  return cloud.get(`/formulas/${fId}/instances/${fiId}/executions`);
};

exports.getFormulaInstanceExecution = (fId, fiId, fieId) => chakram.get(`/formulas/${fId}/instances/${fiId}/executions/${fieId}`);

exports.deleteFormulaInstance = deleteFormulaInstance;
exports.deleteFormula = deleteFormula;

exports.createFAndFI = () => {
  let elementInstanceId, formulaId, formulaInstanceId;
  const formula = require('./simple-successful-formula');
  return deleteFormulasByName('/formulas', 'simple-successful')
    .then(r => cloud.post('/formulas', formula, fSchema))
    .then(r => formulaId = r.body.id)
    .then(r => provisioner.create('closeio')) // just chose a random element, as i just need a valid ID
    .then(r => elementInstanceId = r.body.id)
    .then(r => {
      const formulaInstance = require('./simple-successful-formula-instance');
      formulaInstance.configuration['trigger-instance'] = elementInstanceId;
      return cloud.post(`/formulas/${formulaId}/instances`, formulaInstance, fiSchema);
    })
    .then(r => formulaInstanceId = r.body.id)
    .then(r => ({ formulaInstanceId: formulaInstanceId, formulaId: formulaId, elementInstanceId: elementInstanceId }));
};
