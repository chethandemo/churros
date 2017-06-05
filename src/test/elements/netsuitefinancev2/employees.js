'use strict';

const suite = require('core/suite');
const tools = require('core/tools');
const payload = tools.requirePayload(`${__dirname}/assets/employees.json`);

suite.forElement('finance', 'employees', { payload: payload }, (test) => {
  	test.should.supportCruds();
	  test.withOptions({ qs: { page: 1, pageSize: 5}}).should.supportPagination();
  	test.should.supportCeqlSearch('id');
});
