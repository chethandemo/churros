'use strict';

const expect = require('chakram').expect;
const suite = require('core/suite');
const cloud = require('core/cloud');
const props = require('core/props');
const provisioner = require('core/provisioner');
const instanceSchema = require('./assets/element.instance.schema.json');

const genInstance = (element, o) => ({
  name: (o.name || 'churros-instance'),
  providerData: (o.providerData || undefined),
  element: { key: element },
  configuration: props.all(element)
});

const crudInstance = (baseUrl, schema) => {
  let id;
  return provisioner.create('jira', undefined, baseUrl)
    .then(r => id = r.body.id)
    .then(r => cloud.get(`${baseUrl}/${id}`, (r) => {
      expect(r).to.have.schemaAnd200(schema);
      expect(r.body.configuration).to.not.be.empty;
      expect(r.body.configuration.password).to.equal("********");
      expect(r.body.configuration.username).to.equal(props.getForKey('jira', 'username'));
    }))
    .then(r => cloud.put(`${baseUrl}/${id}`, genInstance('jira', { name: 'updated-instance' })))
    .then(r => provisioner.delete(id, baseUrl));
};

const updateInstanceWithReprovision = (baseUrl, schema) => {
  let id;
  return provisioner.create('shopify')
    .then(r => id = r.body.id)
    .then(r => cloud.get(`${baseUrl}/${id}`, (r) => {
      expect(r).to.have.schemaAnd200(schema);
      expect(r.body.configuration).to.not.be.empty;
      expect(r.body.configuration.password).to.equal("********");
      expect(r.body.configuration.username).to.equal(props.getForKey('shopify', 'username'));
    }))
    .then(r => {
      return provisioner.partialOauth('shopify');
    })
    .then(code =>
      cloud.put(`${baseUrl}/${id}`, genInstance('shopify', { name: 'updated-instance', providerData: { code: code } }), r => {
        expect(r).to.have.statusCode(200);
        expect(r.body.configuration).to.not.be.empty;
        expect(r.body.configuration.password).to.equal("********");
        expect(r.body.configuration.username).to.equal(props.getForKey('shopify', 'username'));
        expect(r.body).to.not.have.key('providerData');
      }))
    .then(r => cloud.get(`/hubs/ecommerce/orders`))
    .then(r => {
      expect(r).to.have.statusCode(200);
      expect(r.body).to.be.instanceof(Array);
    })
    .then(r => provisioner.partialOauth('shopify'))
    .then(code => cloud.patch(`${baseUrl}/${id}`, { name: 'updated-instance', providerData: { code: code } }, r => {
        expect(r).to.have.statusCode(200);
        expect(r.body.configuration).to.not.be.empty;
        expect(r.body.configuration.password).to.equal("********");
        expect(r.body.configuration.username).to.equal(props.getForKey('shopify', 'username'));
        expect(r.body).to.not.have.key('providerData');
    }))
    .then(r => cloud.get(`/hubs/ecommerce/orders`))
    .then(r => {
      expect(r).to.have.statusCode(200);
      expect(r.body).to.be.instanceof(Array);
    })
    .then(r => provisioner.delete(id, baseUrl));
};

const opts = { schema: instanceSchema };

suite.forPlatform('elements/instances', opts, (test) => {
  it('should support CRUD by key', () => crudInstance('elements/jira/instances', instanceSchema));
  it('should support CRUD by ID', () => {
    return cloud.get('elements/jira')
      .then(r => crudInstance(`elements/${r.body.id}/instances`, instanceSchema));
  });
  it('should support update with reprovision by key', () => updateInstanceWithReprovision('/instances', instanceSchema));
});
