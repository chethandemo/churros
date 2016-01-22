'use strict';

const util = require('util');
const expect = require('chakram').expect;
const chocolate = require('core/chocolate');
const tester = require('core/tester');
const schema = require('./assets/notification.schema.json');

const notifyGen = (opts) => new Object({
  severity: (opts.severity || 'low'),
  topic: (opts.topic || 'churros-topic'),
  message: (opts.message || 'this is a test message'),
  from: (opts.from || 'churros')
});

tester.for(null, 'notifications', (api) => {
  tester.testCrd(api, notifyGen({}), schema);
  tester.testBadGet404(api);
  tester.testBadPost400(api);

  // test with missing topic should be bad too
  const n = notifyGen({});
  n.topic = null;
  tester.testBadPost400(api, n);

  it('should return one notification when searching for this topic', () => {
    const n = notifyGen({
      topic: 'churros-topic-' + chocolate.random()
    });

    return tester.post(api, n, schema)
      .then(r => {
        const url = util.format('%s?topics[]=%s', api, n.topic);
        return tester.find(url, schema, (r) => {
          expect(r).to.have.statusCode(200);
          expect(r.body).to.not.be.empty;
          expect(r.body.length).to.equal(1);
        });
      })
      .then(r => tester.delete(api, r.body[0].id));
  });

  it('should allow acknowledging a notification', () => {
    const n = notifyGen({});

    return tester.post(api, n, schema, (r) => {
        expect(r).to.have.schemaAnd200(schema);
        expect(r.body.acknowledged).to.equal(false);
      })
      .then(r => {
        const url = util.format('%s/%s/acknowledge', api, r.body.id);
        return tester.put(url, null, null, schema, (r) => {
          expect(r).to.have.statusCode(200);
          expect(r.body).to.not.be.empty;
          expect(r.body.acknowledged).to.equal(true);
        });
      })
      .then(r => tester.delete(api, r.body.id));
  });

  it('should return an empty array if no notifications are found with the given topic', () => {
    const url = util.format('%s?topics[]=fake-topic-name-with-no-notifications', api);
    return tester.get(url, null, null, (r) => {
      expect(r).to.have.statusCode(200);
      expect(r.body).to.be.empty;
    });
  });

  it('should throw a 400 if missing search query', () => {
    return tester.get(api, null, null, (r) => expect(r).to.have.status(400));
  });
});
