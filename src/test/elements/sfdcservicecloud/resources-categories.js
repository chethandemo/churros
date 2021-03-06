'use strict';

const suite = require('core/suite');
const payload = require('./assets/category');
const tools = require('core/tools');
const cloud = require('core/cloud');

suite.forElement('helpdesk', 'resources/categories', { payload: payload }, (test) => {
  test.should.supportPagination();
  let categoryId;

  it('should support CRUDS /hubs/helpdesk/resources/categories ', () => {
    let updatedPayload = {
      "label": "FAQ",
      "name": payload.name,
      "pluralLabel": tools.randomStr()
    };
    return cloud.post(test.api, payload)
      .then(r => categoryId = r.body.Id)
      .then(r => cloud.get(`${test.api}/${categoryId}`))
      .then(r => cloud.get(test.api))
      .then(r => cloud.withOptions({ qs: { page: 1, pageSize: 1 } }).get(test.api))
      .then(r => cloud.withOptions({ qs: { where: `id='${categoryId}'` } }).get(test.api))
      .then(r => cloud.patch(`${test.api}/${categoryId}`, updatedPayload))
      .then(r => cloud.delete(`${test.api}/${categoryId}`));
  });

  it('should support Ceql search for /hubs/helpdesk/resources/categories ', () => {
    return cloud.post(test.api, payload)
      .then(r => categoryId = r.body.Id)
      .then(r => cloud.withOptions({ qs: { where: `id='${categoryId}'` } }).get(test.api))
      .then(r => cloud.delete(`${test.api}/${categoryId}`));
  });
});