'use strict';

const expect = require('chakram').expect;
const suite = require('core/suite');
const cloud = require('core/cloud');
const moment = require('moment');
const provisioner = require('core/provisioner');
const tools = require('core/tools');
const usageSchema = require('./assets/usage.schema');
const analyticsSchema = require('./assets/analytics.schema');

suite.forPlatform('usage', { schema: usageSchema }, (test) => {
  let yestermonth, today, futureToday, futureTomorrow, trafficId, instanceId;
  before(done => {
    // create sfdc instance and make API call to populate usage, just in case
    today = moment().format('YYYY[-]MM[-]DD');
    yestermonth = moment().subtract(31, 'days').format('YYYY[-]MM[-]DD');
    futureToday = moment().add(1, 'days').format('YYYY[-]MM[-]DD');
    futureTomorrow = moment().add(2, 'days').format('YYYY[-]MM[-]DD');
    // create a sfdc instance and make a request to populate usage
    return provisioner.create('sfdc')
      .then(r => instanceId = r.body.id)
      .then(() => cloud.withOptions({ qs: { pageSize: 1 } }).get('/hubs/crm/accounts'))
      .then(() => tools.wait.upTo(5000).for(() => {
        return cloud.get('usage')
          .then(r => expect(r.body).is.not.empty);
      }))
      .then(() => done())
      .catch(() => done());
  });

  after(done => {
    return provisioner.delete(instanceId)
      .then(r => done());
  });

  it('should support usage retrieve and search', () => {
    return cloud.get('usage', usageSchema)
      .then(r => trafficId = r.body[ 0 ].traffic_id)
      .then(r => cloud.withOptions({ qs: { from: yestermonth, to: today, hub: 'crm', 'keys[]': 'sfdc', 'tags[]': 'churros-instance', status: 'success', searchText: 'AccountId' } }).get('usage', usageSchema))
      .then(r => cloud.get(`usage/${trafficId}`));
  });

  it('should support offset pagination', () => {
    return cloud.withOptions({ qs: { pageSize: 1 } }).get('usage', usageSchema)
      .then(r => cloud.withOptions({ qs: { pageSize: 1, pageOffset: 1 } }).get('usage', usageSchema));
  });

  it('should support token pagination', () => {
    return cloud.withOptions({ qs: { pageSize: 1 } }).get('usage', usageSchema)
      .then(r => cloud.withOptions({ qs: { nextPage: r.response.headers[ 'elements-next-page-token' ] } }).get('usage'), usageSchema);
  });

  it('should support response time analytics', () => cloud.withOptions({ qs: { from: yestermonth, to: today } }).get('usage/analytics/times', analyticsSchema));

  it('should support status analytics', () => cloud.withOptions({ qs: { from: yestermonth, to: today } }).get('usage/analytics/statuses', analyticsSchema));

  it('usage APIs should return 404 for future date', () => {
    const expectFoHunderdNFer = (r) => {
      expect(r.response.statusCode).to.equal(404);
    };

    return cloud.withOptions({ qs: { from: futureToday, to: futureTomorrow } }).get('usage', expectFoHunderdNFer)
      .then(() => cloud.withOptions({ qs: { from: futureToday, to: futureTomorrow } }).get('usage/analytics/times', expectFoHunderdNFer))
      .then(() => cloud.withOptions({ qs: { from: futureToday, to: futureTomorrow } }).get('usage/analytics/statuses', expectFoHunderdNFer))
  });
});
