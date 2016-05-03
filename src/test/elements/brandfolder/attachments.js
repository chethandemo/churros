'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');
const chakram = require('chakram');
const assetsPayload = require('./assets/assets');
const payload = require('./assets/attachments');
const payload2 = require('./assets/attachments2');
const expect = chakram.expect;
const options = {};

const updatePayload = () => ({
  "type": "attachments",
  "attributes": {
    "url": "http://cloud-elements.com/wp-content/uploads/2014/09/ce-logo.png"
  }
});

suite.forElement('general', 'attachments', { payload: payload }, (test) => {
  let orgId = -1;
  let brandFolderId = -1;
  let sectionId = -1;
  let assetId = -1;
  let attachmentId = -1;
  before(() => cloud.get(`hubs/general/organizations`)
    .then(r => orgId = r.body[0].id)
    .then(r => cloud.get(`hubs/general/organizations/${orgId}/brandfolders`))
    .then(r => brandFolderId = r.body[0].id)
    .then(r => cloud.get(`hubs/general/brandfolders/${brandFolderId}`))
    .then(r => expect(r.body.attributes.name).to.equal(`demo-cloud-elements`))
    .then(r => cloud.get(`hubs/general/brandfolders/${brandFolderId}/sections`))
    .then(r => sectionId = r.body[0].id)
    .then(r => cloud.post(`hubs/general/sections/${sectionId}/assets`, assetsPayload))
    .then(r => assetId = r.body.id)
    .then(r => cloud.post(`hubs/general/assets/${assetId}/attachments`, payload))
    .then(r => attachmentId = r.body.id)
  );
  it('should support Cruds', () => {
    let attachment2Id = -1;
    return cloud.post(`hubs/general/assets/${assetId}/attachments`, payload2)
      .then(r => attachment2Id = r.body.id)
      .then(r => cloud.get(`hubs/general/assets/${assetId}/attachments`))
      .then(r => cloud.patch(`${test.api}/${attachment2Id}`, updatePayload()))
      .then(r => cloud.get(`${test.api}/${attachment2Id}`))
      .then(r => cloud.delete(`${test.api}/${attachment2Id}`));
  });
  options.qs = {};
  options.qs.pageSize = 1;
  it('should support cursor pagination for assets/attachments', () => {
    return cloud.withOptions(options).get(`hubs/general/assets/${assetId}/attachments`)
      .then(r => {
        expect(r.body).to.not.be.null;
        options.qs.nextPage = r.response.headers['elements-next-page-token'];
        return cloud.withOptions(options).get(`hubs/general/assets/${assetId}/attachments`);
      });
  });
    after(() => cloud.delete(`hubs/general/assets/${assetId}`));
});
