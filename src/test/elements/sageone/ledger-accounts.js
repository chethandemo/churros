'use strict';

const suite = require('core/suite');
const expect = require('chakram').expect;

suite.forElement('finance', 'ledger-accounts', (test) => {
  test.should.supportSr();
  test.should.supportPagination();
  test
    .withName(`should support searching ${test.api} by visible_in`)
    .withOptions({ qs: { where: `visible_in = 'banking'` } })
    .withValidation((r) => {
      expect(r).to.have.statusCode(200);
      const validValues = r.body.filter(obj => obj.visible_in_banking = 'true');
      expect(validValues.length).to.equal(r.body.length);
    }).should.return200OnGet();
});
