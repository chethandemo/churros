'use strict';

const suite = require('core/suite');
const payload =  require('core/tools').requirePayload(`${__dirname}/assets/non-inventory-resale-items.json`);

suite.forElement('finance', 'non-inventory-resale-items', { payload: payload }, (test) => {
  	test.should.supportCruds();
	test.withOptions({ qs: { page: 1, pageSize: 5}}).should.return200OnGet();
  	test.should.supportCeqlSearch('id');
});
