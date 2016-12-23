'use strict';

const suite = require('core/suite');
const payload = require('./assets/contacts');
const update = () => ({
  "phone": "1-214-412-6308",
  "city": "Addison"
});

const options = { churros: { updatePayload: update() } };
suite.forElement('db', 'contacts', { payload: payload }, (test) => {
  test.withOptions(options).should.supportCruds();
  test.should.supportCeqlSearch('id');
  test.should.supportPagination();
});
