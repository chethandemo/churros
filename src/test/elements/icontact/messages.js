'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');
const tools = require('core/tools');
const payload = tools.requirePayload(`${__dirname}/assets/messages.json`);

suite.forElement('general', 'messages', { payload: payload, skip: true }, (test) => {

  it('should allow CRUD for hubs/general/messages', () => {
    let messageId, campaignId;
    return cloud.get('hubs/general/campaigns')
      .then(r => {
        if (r.body && r.body.length > 0) {
          campaignId = r.body[0].campaignId;
        } else {
          let campaignPayload = tools.requirePayload(`${__dirname}/assets/campaigns.json`);
          cloud.post(`${test.api}`, campaignPayload);
          campaignId = r.body.campaignId;
        }
        payload.campaignId = campaignId;
      })
      .then(r => cloud.post(`${test.api}`, payload))
      .then(r => messageId = r.body.messageId)
      .then(r => cloud.get(`${test.api}`))
      .then(r => cloud.get(`${test.api}/${messageId}`));
  });
  test.should.supportPagination();
});
