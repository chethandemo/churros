'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');

const createPayment = (customerId, bankId) => ({
  "customer_id": customerId,
  "bank_id": bankId,
  "cheque_value": 200.00
});

const testCreatePayment = (test, customerId) => {
  if(customerId) {
    let bankId, urnId, paymentId, receiptId;
    return cloud.get('/hubs/finance/customers/' + customerId)
    .then(r => cloud.get('/hubs/finance/banks'))
    .then(r => bankId = r.body[0].id)
    .then(r => cloud.post(test.api, createPayment(customerId, bankId)))
    .then(r => urnId = r.body.urn)
    .then(r => cloud.get(test.api), { qs: { where: 'urn=\'' + urnId + '\'' } })
    .then(r => paymentId = r.body[0].id)
    .then(r => cloud.get(test.api + '/' + paymentId))
    .then(r => cloud.post(test.api + '/receipts', createPayment(customerId, bankId)))
    .then(r => urnId = r.body.urn)
    .then(r => cloud.get(test.api), { qs: { where: 'urn=\'' + urnId + '\'' } })
    .then(r => receiptId = r.body[0].id)
    .then(r => cloud.get(test.api + '/' + receiptId))
    .then(r => cloud.get(test.api));
  }
};

suite.forElement('finance', 'payments', { payload: createPayment() }, (test) => {
  let customerId;
  it.skip('should create a payment to the customer', () => {
    return cloud.get('/hubs/finance/customers')
      .then(r => customerId = r.body.length > 0 ?  r.body[0].id: null)
      .then(() => testCreatePayment(test, customerId));
  });
  test.should.supportPagination();
});
