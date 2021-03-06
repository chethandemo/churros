'use strict';

const suite = require('core/suite');
const payload = require('./assets/journal-entries');
const tools = require('core/tools');
const cloud = require('core/cloud');
const updatePayload = { "Memo": tools.random() };

suite.forElement('finance', 'journal-entries', { payload: payload }, (test) => {
  it('should support CRUDS, pagination for /hubs/finance/journal-entries', () => {
    let id;
    return cloud.post(test.api, payload)
      .then(r => id = r.body.TxnID)
      .then(r => cloud.get(test.api))
      .then(r => cloud.withOptions({ qs: { page: 1, pageSize: 1 } }).get(test.api))
      .then(r => cloud.withOptions({ qs: { where: `TxnID='${id}'` } }).get(test.api))
      .then(r => cloud.get(`${test.api}/${id}`))
      .then(r => updatePayload.EditSequence = r.body.EditSequence)
      .then(r => cloud.patch(`${test.api}/${id}`, updatePayload))
      .then(r => cloud.delete(`${test.api}/${id}`));
  });
});