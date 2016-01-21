'use strict';

const util = require('util');
const chakram = require('chakram');
const expect = chakram.expect;

var exports = module.exports = {};

exports.for = (hub, objectName, tests) => {
  describe(objectName, () => {
    let baseUrl = util.format('/hubs/%s/%s', hub, objectName);
    if (tests) tests(baseUrl);
  })
};

const notFoundTest = (baseUrl, invalidId) => {
  const name = util.format('should throw a 404 when trying to retrieve a(n) %s that does not exist', baseUrl);
  it(name, () => {
    return chakram.get(baseUrl + '/' + (invalidId || -1))
      .then(r => {
        expect(r).to.have.statusCode(404);
      });
  });
};
exports.notFoundTest = notFoundTest;

const create = (api, payload, schema) => {
  const name = util.format('should allow creating an %s', api);
  return chakram.post(api, payload)
    .then(r => {
      expect(r).to.have.schemaAnd200(schema);
      return r;
    })
    .catch(r => {
      console.log('Failed to create %s with payload %s', api, JSON.stringify(payload));
      console.log(r);
    });
};

const retrieve = (api, id, schema) => {
  const name = util.format('should allow retrieving an %s', api);
  return chakram.get(api + '/' + id)
    .then(r => {
      expect(r).to.have.schemaAnd200(schema);
      return r;
    })
    .catch(r => {
      console.log('Failed to retrieve %s with ID %s', api, id);
      console.log(r);
    });
};

const update = (api, id, payload, schema, cb) => {
  const name = util.format('it should support deleting a %s', api);
  cb = (cb || chakram.patch);
  return cb(api + '/' + id, payload)
    .then(r => {
      expect(r).to.have.schemaAnd200(schema);
      return r;
    })
    .catch(r => {
      console.log('Failed to update %s with ID %s', api, id);
      console.log(r);
    });
};

const remove = (api, id) => {
  const name = util.format('it should support deleting a %s', api);
  return chakram.delete(api + '/' + id)
    .then(r => {
      expect(r).to.have.statusCode(200);
      return r;
    })
    .catch(r => {
      console.log('Failed to delete %s with ID %s', api, id);
      console.log(r);
    });
};

const crudTest = (api, payload, schema, updateCallback) => {
  const name = util.format('should allow creating, retrieving, updating and deleting a %s', api);
  it(name, () => {
    return create(api, payload, schema)
      .then(r => {
        return retrieve(api, r.body.id, schema);
      })
      .then(r => {
        return update(api, r.body.id, payload, schema, updateCallback)
      })
      .then(r => {
        return remove(api, r.body.id);
      });
  });
};
exports.crudTest = crudTest;
