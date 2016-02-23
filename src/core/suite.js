'use strict';

const util = require('util');
const chakram = require('chakram');
const expect = chakram.expect;
const cloud = require('core/cloud');

var exports = module.exports = {};

const itPost = (api, payload, options, validationCb) => {
  const name = util.format('should allow POST for %s', api);
  it(name, () => cloud.withOptions(options).post(api, payload, validationCb));
};

const itGet = (api, options, validationCb) => {
  const name = util.format('should allow GET for %s', api);
  it(name, () => cloud.withOptions(options).get(api, validationCb));
};

const itCrd = (api, payload, validationCb) => {
  const name = util.format('should allow CRD for %s', api);
  it(name, () => cloud.crd(api, payload, validationCb));
};

const itCrds = (api, payload, validationCb) => {
  const name = util.format('should allow CRDS for %s', api);
  it(name, () => cloud.crd(api, payload, validationCb));
};

const itCrud = (api, payload, validationCb, updateCb) => {
  const name = util.format('should allow CRUD for %s', api);
  it(name, () => cloud.crud(api, payload, validationCb, updateCb));
};

const itCruds = (api, payload, validationCb, updateCb) => {
  const name = util.format('should allow CRUDS for %s', api);
  it(name, () => cloud.cruds(api, payload, validationCb, updateCb));
};

const itPagination = (api, validationCb) => {
  const name = util.format('should allow paginating %s', api);
  const options = { qs: { page: 1, pageSize: 1 } };

  it(name, () => cloud.withOptions(options).get(api, validationCb));
};

const itGet404 = (api, invalidId) => {
  const name = util.format('should throw a 404 when trying to retrieve a(n) %s with an ID that does not exist', api);
  if (invalidId) api = api + '/' + invalidId;
  it(name, () => cloud.get(api, (r) => expect(r).to.have.statusCode(404)));
};

const itPatch404 = (api, payload, invalidId) => {
  const name = util.format('should throw a 404 when trying to update a(n) %s with an ID that does not exist', api);
  if (invalidId) api = api + '/' + invalidId;
  it(name, () => cloud.update(api, (payload || {}), (r) => expect(r).to.have.statusCode(404), chakram.patch));
};

const itPost400 = (api, payload) => {
  let name = util.format('should throw a 400 when trying to create a(n) %s with an %s JSON body', api);
  payload ? name = util.format(name, 'invalid') : name = util.format(name, 'empty');
  it(name, () => cloud.post(api, payload, (r) => expect(r).to.have.statusCode(400)));
};

const itCeqlSearch = (api, payload, field) => {
  const name = util.format('should support searching %s by %s', api, field);
  it(name, () => {
    let id;
    return cloud.post(api, payload)
      .then(r => {
        id = r.body.id;
        const clause = util.format("%s='%s'", field, r.body[field]); // have to escape where values with single quotes
        const options = { qs: { where: clause } };
        return cloud.withOptions(options).get(api, (r) => {
          expect(r).to.have.statusCode(200);
          expect(r.body.length).to.equal(1);
        });
      })
      .then(r => cloud.delete(api + '/' + id));
  });
};

const runTests = (api, payload, validationCb, tests) => {
  const should = (api, validationCb, payload, options) => {
    return {
      return400OnPost: () => itPost400(api, payload),
      return404OnPatch: (invalidId) => itPatch404(api, payload, invalidId),
      return404OnGet: (invalidId) => itGet404(api, invalidId),
      return200OnPost: () => itPost(api, payload, options, validationCb),
      return200OnGet: () => itGet(api, options, validationCb),
      supportPagination: () => itPagination(api, validationCb),
      supportCeqlSearch: (field) => itCeqlSearch(api, payload, field),
      supportCruds: (updateCb) => itCruds(api, payload, validationCb, updateCb),
      supportCrud: (updateCb) => itCrud(api, payload, validationCb, updateCb),
      supportCrd: () => itCrd(api, payload, validationCb),
      supportCrds: () => itCrds(api, payload, validationCb),
    };
  };

  const using = (myApi, myValidationCb, myPayload, myOptions) => {
    return {
      should: should(myApi, myValidationCb, myPayload, myOptions),
      withApi: (myApi) => using(myApi, myValidationCb, myPayload, myOptions),
      withValidation: (myValidationCb) => using(myApi, myValidationCb, myPayload, myOptions),
      withJson: (myPayload) => using(myApi, myValidationCb, myPayload, myOptions),
      withOptions: (myOptions) => using(api, validationCb, payload, myOptions)
    };
  };

  const test = {
    api: api,
    should: should(api, validationCb, payload),
    withApi: (myApi) => using(myApi, validationCb, payload),
    withValidation: (myValidationCb) => using(api, myValidationCb, payload),
    withJson: (myPayload) => using(api, validationCb, myPayload),
    withOptions: (myOptions) => using(api, validationCb, payload, myOptions)
  };

  tests ? tests(test) : it('add some tests to me!!!', () => true);
};

exports.forElement = (hub, resource, payload, tests) => {
  describe(resource, () => {
    let api = util.format('/hubs/%s/%s', hub, resource);
    runTests(api, payload, (r) => expect(r).to.have.statusCode(200), tests);
  });
};

exports.forPlatform = (resource, payload, validationCb, tests) => {
  describe(resource, () => {
    let api = util.format('/%s', resource);
    runTests(api, payload, validationCb, tests);
  });
};
