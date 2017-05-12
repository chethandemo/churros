'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');

suite.forElement('finance', 'objects', (test) => {
  let id = 'addresses';
  it(`should allow SR for ${test.api}`, () => {
    return cloud.get(test.api)
      .then(r => cloud.get(`${test.api}/${id}/metadata`))
  });
});
