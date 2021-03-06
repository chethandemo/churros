'use strict';

const expect = require('chakram').expect;
const suite = require('core/suite');
const payload = require('./assets/accounts');
const tools = require('core/tools');
const cloud = require('core/cloud');
const moment = require('moment');

var accountsId = 285826161;

suite.forElement('crm', 'accounts', { payload: payload }, (test) => {
  test.should.supportPagination();
  
  it('should test CRUD for /accounts and GET /accounts/{id}/activities', () => {
    const updatePayload = {
      "properties": {
        "name": tools.random()
      }
    };
    let accountId;
    const options = { qs: { pageSize: 1 } };
    return cloud.post(test.api, payload)
      .then(r => accountId = r.body.id)
      .then(r => cloud.get(`${test.api}/${accountId}`))
      .then(r => cloud.get(`${test.api}`))
      .then(r => cloud.get(`${test.api}/${accountId}/activities`))
      .then(r => cloud.withOptions(options).get(`${test.api}/${accountId}/activities`))
      .then(r => options.qs.nextPage = r.response.headers['elements-next-page-token'])
      .then(r => cloud.withOptions(options).get(`${test.api}/${accountId}/activities`))
      .then(r => cloud.patch(`${test.api}/${accountId}`, updatePayload))
      .then(r => cloud.delete(`${test.api}/${accountId}`));
  });
  
  it('should test accounts poller url', () => {
    let id;
    let objects;
    const createPayload = {
      "properties": {
        "name": tools.random() + "-churros", "description": tools.random() + " Churros Account"
      }
    };
    const options = { qs: { where: "lastmodifieddate='" + moment().subtract(5, 'seconds').format() + "'" } };
    const checkLength = (objects) => {
      return (objects.length > 0);
    };
    const checkId = (postedId, polledId) => {
      return (postedId === polledId);
    };
    return cloud.post(test.api, createPayload)
      .then(r => id = r.body.id )
      .then(r => tools.sleep(10))
      .then(r => cloud.withOptions(options).get(test.api))
      .then(r => objects = r.body)
      .then(r => checkLength(objects))
      .then(r => expect(r).to.be.true)
      .then(r => checkId(id, objects[0].id))
      .then(r => expect(r).to.be.true)
      .then(r => expect(objects[0].properties).to.contain.key('hs_lastmodifieddate') && expect(objects[0].properties).to.contain.key('createdate'))
      .then(r => cloud.delete(`${test.api}/${id}`));
  });
  
});

suite.forElement('crm', `accounts/${accountsId}/activities`, { payload: payload }, (test) => {
  test.should.supportNextPagePagination(1);
  
});
