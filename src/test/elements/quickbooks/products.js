'use strict';

const suite = require('core/suite');
const tools = require('core/tools');
const payload = tools.requirePayload(`${__dirname}/assets/products.json`);

suite.forElement('finance', 'products', { payload: payload }, (test) => {
  const options = {
    churros: {
      updatePayload: {
        "sku": tools.random(),
        "name": tools.random()
      }
    }
  };
  test.withOptions(options).should.supportCruds();
  test.withOptions({ qs: { page: 1, pageSize: 5 ,orderBy : 'name desc'} }).should.return200OnGet();
  test.withOptions({ qs: { where: 'type = \'SERVICE\'', page: 1, pageSize: 1 } }).should.return200OnGet();
});
