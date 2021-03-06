'use strict';

const suite = require('core/suite');
const tools = require('core/tools');
const payload = require('./assets/bills');

payload.tranId = tools.random();
payload.externalId += tools.random();

suite.forElement('erp', 'bills', { payload: payload }, (test) => {
  test.should.supportCruds();
  test.withOptions({ qs: { page: 1, pageSize: 5 } }).should.supportPagination();
  test.should.supportCeqlSearch('id');
});
