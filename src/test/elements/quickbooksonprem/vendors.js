'use strict';

const suite = require('core/suite');
const payload = require('./assets/vendors');
const tools = require('core/tools');
const cloud = require('core/cloud');
const updatePayload = { "FirstName": tools.random(), "LastName": tools.random() };

suite.forElement('finance', 'vendors', { payload: payload }, (test) => {
  it('should support CRUDS, pagination for /hubs/finance/vendors', () => {
    let id;
    return cloud.post(test.api, payload)
      .then(r => id = r.body.ListID)
      .then(r => cloud.get(test.api))
      .then(r => cloud.withOptions({ qs: { page: 1, pageSize: 1 } }).get(test.api))
      .then(r => cloud.get(`${test.api}/${id}`))
      .then(r => updatePayload.EditSequence = r.body.EditSequence)
      .then(r => cloud.patch(`${test.api}/${id}`, updatePayload))
      .then(r => cloud.delete(`${test.api}/${id}`));
  });
});