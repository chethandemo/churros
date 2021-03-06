'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');

suite.forElement('erp', 'tax-codes', null, (test) => {
  it('should allow SR for /hubs/erp/tax-codes ', () => {
    let taxCodeId;
    return cloud.get(test.api)
      .then(r => taxCodeId = r.body[0].internalId)
      .then(r => cloud.withOptions({ qs: { page: 1, pageSize: 5 } }).get(`${test.api}`))
      .then(r => cloud.withOptions({ qs: { where: `internalId ='${taxCodeId}'` } }).get(`${test.api}`))
      .then(r => cloud.get(`${test.api}/${taxCodeId}`));
  });
});