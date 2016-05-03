'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');
const chakram = require('chakram');
const expect = chakram.expect;
const options = {};

suite.forElement('general', 'organizations', null, (test) => {
  it('should support Sr and sub-resources', () => {
    let orgId = -1;
    return cloud.get(test.api)
      .then(r => orgId = r.body[0].id)
      .then(r => cloud.get(`${test.api}/${orgId}`))
      .then(r => cloud.get(`${test.api}/${orgId}/assets`))
      .then(r => cloud.get(`${test.api}/${orgId}/brandfolders`));
  });
  options.qs = {};
  options.qs.pageSize = 1;
  it('should support cursor pagination', () => {
    return cloud.withOptions(options).get(test.api)
      .then(r => {
        expect(r.body).to.not.be.null;
        options.qs.nextPage = r.response.headers['elements-next-page-token'];
        return cloud.withOptions(options).get(test.api);
      });
  });
});
