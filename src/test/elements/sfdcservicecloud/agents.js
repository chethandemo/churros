'use strict';

const suite = require('core/suite');
const payload = require('./assets/agents');
const tools = require('core/tools');
const cloud = require('core/cloud');
const build = (overrides) => Object.assign({}, payload, overrides);
const agentsPayload = build({ Email: tools.randomEmail(), LastName: tools.random(), FirstName: tools.random() });

suite.forElement('helpdesk', 'agents', { payload: agentsPayload }, (test) => {
  it('should allow CRUDS /hubs/helpdesk/agents ', () => {
    let agentId;
    return cloud.post(test.api, payload)
      .then(r => agentId = r.body.Id)
      .then(r => cloud.get(`${test.api}/${agentId}`))
      .then(r => cloud.get(test.api))
      .then(r => cloud.withOptions({ qs: { page: 1, pageSize: 1 } }).get(test.api))
      .then(r => cloud.withOptions({ qs: { where: `id='${agentId}'` } }).get(test.api))
      .then(r => cloud.patch(`${test.api}/${agentId}`, agentsPayload))
      .then(r => cloud.delete(`${test.api}/${agentId}`));
  });
});
