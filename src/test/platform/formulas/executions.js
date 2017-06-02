'use strict';

const provisioner = require('core/provisioner');
const common = require('./assets/common');
const logger = require('winston');
const suite = require('core/suite');
const cloud = require('core/cloud');
const expect = require('chakram').expect;
const moment = require('moment');
const tools = require('core/tools');
const fs = require('fs');
const props = require('core/props');

const flattenStepExecutionValues = sevs =>
  sevs.reduce((flat, curr) => {
    const key = curr.key;
    flat[key] = curr.value;
    return flat;
  }, {});

const consolidateStepExecutionValues = ses =>
  ses.reduce((prev, curr) =>
    Object.assign(prev, flattenStepExecutionValues(curr.stepExecutionValues)),
    ({}));

const validateStepExecutionStatus = (se, status) => {
  expect(se).to.have.property('status').and.equal(status);
};

const validateSuccessfulStepExecution = se =>
  validateStepExecutionStatus(se, 'success');

const validateErrorStepExecution = se =>
  validateStepExecutionStatus(se, 'failed');

const validateLoopSuccessfulLoopStepExecution = se => {
  const flat = flattenStepExecutionValues(se.stepExecutionValues);
  expect(flat['loop.index']).to.not.be.empty;
  const index = parseInt(flat['loop.index']);

  expect(index).to.be.at.least(0);

  if (index === 50) {
    return validateErrorStepExecution(se);
  }

  validateSuccessfulStepExecution(se);
  expect(flat['loop.entry']).to.contain('{"val":0.');
};

const validateLoopSuccessfulEmailStepExecution = se => {
  validateSuccessfulStepExecution(se);
  const flat = flattenStepExecutionValues(se.stepExecutionValues);

  expect(flat['create-email-body.from']).to.equal('devnull@cloud-elements.com');
  expect(flat['create-email-body.to']).to.equal('devnull@cloud-elements.com');
  expect(flat['create-email-body.subject']).to.equal('Formula Email');
  expect(flat['create-email-body.message']).to.contain('Loopy val: 0.');
};

const generateXSingleSfdcPollingEvents = (instanceId, x, fileName) => {
  fileName = fileName || 'single-event-sfdc';
  const payload = require(`./assets/events/${fileName}`);
  return Promise.all(Array(x).fill().reduce((p, c) => {
    p.push(common.generateSfdcPollingEvent(instanceId, payload));
    return p;
  }, []));
};


suite.forPlatform('formulas', { name: 'formula executions' }, (test) => {
  let sfdcId, dropboxId;
  before(() => {
    return provisioner.create('dropbox')
      .then(r => dropboxId = r.body.id)
      .then(r => provisioner.create('sfdc', { 'event.notification.enabled': true, 'event.vendor.type': 'polling', 'event.poller.refresh_interval': 999999999 }))
      .then(r => sfdcId = r.body.id)
      .catch(e => {
        console.log(`Failed to finish before()...${e}`);
        process.exit(1);
      });
  });

  after(done => {
    if (!sfdcId) done();
    return provisioner.delete(sfdcId)
      .then(r => provisioner.delete(dropboxId))
      .then(() => done())
      .catch(e => {
        console.log(`Failed to finish after()...${e}`);
        done();
      });
  });

  const testWrapper = (kickOffDatFormulaCb, f, fi, numEs, numSes, numSevs, executionValidator, executionStatus) => {
    if (fi.configuration && fi.configuration['trigger-instance'] === '<replace-me>') fi.configuration['trigger-instance'] = sfdcId;
    return common.testWrapper(test, kickOffDatFormulaCb, f, fi, numEs, numSes, numSevs, common.execValidatorWrapper(executionValidator), null, executionStatus);
  };

  /**
   * Handles the basic formula execution test for a formula that is triggered by an event
   */
  const eventTriggerTest = (fName, numEvents, numSevs, validator, executionStatus, numSes, eventFileName, triggerCb) => {
    const f = require(`./assets/formulas/${fName}`);
    let fi = require(`./assets/formulas/basic-formula-instance`);
    if (fs.existsSync(`./assets/formulas/${fName}-instance`)) fi = require(`./assets/formulas/${fName}-instance`);

    const validatorWrapper = (executions) => {
      executions.map(e => {
        e.stepExecutions.map(se => {
          if (se.stepName === 'trigger') {
            const flat = flattenStepExecutionValues(se.stepExecutionValues);
            expect(flat['trigger.type']).to.equal('event');
            expect(flat['trigger.event']).to.exist;
          }
        });
      });
      if (typeof validator === 'function') validator(executions);
    };

    if (!triggerCb) { triggerCb = (fId, fiId) => generateXSingleSfdcPollingEvents(sfdcId, numEvents, eventFileName); }
    numSes = numSes || f.steps.length + 1; // defaults to steps + trigger but for loop cases, that won't work
    return testWrapper(triggerCb, f, fi, numEvents, numSes, numSevs, validatorWrapper, executionStatus);
  };

  /**
   * Handles the basic formula execution test for a formula that is triggered by a request
   */
  const requestTriggerTest = (fName, numSevs, validator, executionStatus) => {
    const f = require(`./assets/formulas/${fName}`);
    let fi = require(`./assets/formulas/basic-formula-instance`);
    if (fs.existsSync(`./assets/formulas/${fName}-instance`)) fi = require(`./assets/formulas/${fName}-instance`);

    const validatorWrapper = (executions) => {
      executions.map(e => {
        e.stepExecutions.map(se => {
          if (se.stepName === 'trigger') {
            expect(se).to.have.property('status').and.equal('success');

            const flat = flattenStepExecutionValues(se.stepExecutionValues);
            expect(flat['trigger.type']).to.equal('request');
            expect(flat).to.have.property('trigger.request.body');
            expect(flat['trigger.request.headers']).to.exist;
            expect(flat['trigger.request.method']).to.equal('GET');
            expect(flat['trigger.request.path']).to.exist;
            expect(flat['trigger.request.query']).to.exist;
            expect(flat['trigger.response.body']).to.exist;
            expect(flat['trigger.response.code']).to.equal('200');
            expect(flat['trigger.response.headers']).to.exist;
          }
        });
      });
      if (typeof validator === 'function') validator(executions);
    };

    const triggerCb = (fId, fiId) => cloud.get(`/hubs/crm/accounts`);
    const numSes = f.steps.length + 1; // steps + trigger
    return testWrapper(triggerCb, f, fi, 1, numSes, numSevs, validatorWrapper, executionStatus);
  };

  /**
   * Handles the basic formula execution test for a formula that has a manual trigger type
   */
  const manualTriggerTest = (fName, configuration, trigger, numSevs, validator, executionStatus) => {
    const f = require(`./assets/formulas/${fName}`);
    let fi = { name: 'churros-manual-formula-instance' };

    if (configuration) {
      fi.configuration = configuration;
    }

    const validatorWrapper = (executions) => {
      executions.map(e => {
        e.stepExecutions.filter(se => se.stepName === 'trigger')
          .map(t => {
            expect(t.stepExecutionValues.length).to.equal(1);
            const sev = t.stepExecutionValues[0];
            expect(sev).to.have.property('key').and.equal('trigger.args');
          });
      });
      if (typeof validator === 'function') validator(executions);
    };

    const triggerCb = (fId, fiId) => cloud.post(`/formulas/${fId}/instances/${fiId}/executions`, trigger);
    const numSes = f.steps.length + 1; // steps + trigger
    return testWrapper(triggerCb, f, fi, 1, numSes, numSevs, validatorWrapper, executionStatus);
  };

  /**
   * Handles the basic formula execution test for a formula that has a scheduled trigger type
   */
  const scheduleTriggerTest = (fName, numSevs, validator, executionStatus) => {
    const f = require(`./assets/formulas/${fName}`);

    const validatorWrapper = (executions) => {
      executions.map(e => {
        e.stepExecutions.filter(se => se.stepName === 'trigger').map(t => {
          const flat = flattenStepExecutionValues(t.stepExecutionValues);
          expect(flat['trigger.type']).to.equal('scheduled');
        });
      });
      if (typeof validator === 'function') validator(executions);
    };

    const triggerCb = () => logger.debug('No trigger CB for scheduled formulas');

    const setupCron = (r) => {
      const currentDt = r.body.dateTime;
      const dt = moment.parseZone(currentDt);
      dt.add(1, 'minute');
      return {
        name: 'churros-formula-instance',
        configuration: {
          cron: `${dt.seconds()} ${dt.minutes()} ${dt.hours()} ${dt.date()} ${dt.month() + 1} ? ${dt.year()}`
        }
      };
    };

    const numSes = f.steps.length + 1; // steps + trigger
    return cloud.get('/hubs/crm/ping')
      .then(r => setupCron(r))
      .then(fi => testWrapper(triggerCb, f, fi, 1, numSes, numSevs, validatorWrapper, executionStatus));
  };

  it('should successfully execute a simple formula triggered by a single event', () => eventTriggerTest('simple-successful-formula', 1, 2));

  it('should successfully execute a simple formula triggered by a triple event', () => eventTriggerTest('simple-successful-formula', 3, 2));

  it('should successfully execute a formula and properly handle context between steps', () => {
    const validator = (executions) => {
      executions.map(e => {
        const consolidated = consolidateStepExecutionValues(e.stepExecutions);
        expect(consolidated['customer.id'], 'Step values are being parsed as double, but should be string.').to.equal('8000270E-1392053436');
        expect(consolidated['customer.name']).to.equal('test');
        expect(consolidated['customer-update.id'], 'Step values are being parsed as double, but should be string.').to.equal('8000270E-1392053436');
        expect(consolidated['customer-update.name']).to.equal('test');
        expect(consolidated['customer-update.newthing']).to.equal('{"some":"new thing"}');
        expect(consolidated['customer-retrieve.id'], 'Step values are being parsed as double, but should be string.').to.equal('8000270E-1392053436');
        expect(consolidated['customer-retrieve.name']).to.equal('test');
        expect(consolidated['customer-retrieve.newthing']).to.equal('{"some":"new thing"}');
      });
    };
    return eventTriggerTest('script-context-successful-formula', 1, 4, validator);
  });

  it('should successfully execute a single threaded formula triggered by an event with three objects', () => eventTriggerTest('simple-successful-formula-single-threaded', 3, 2));

  it('should properly handle a formula with a step that times out', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateErrorStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated['simple-script.error']).to.contain('Script execution timed out');
      });
    };
    return eventTriggerTest('simple-timeout-formula', 1, 2, validator, 'failed');
  });

  it('should properly handle a formula with a v1 step that returns no values', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateErrorStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated['simple-script.error']).to.contain('The step did not return any values');
      });
    };
    return eventTriggerTest('simple-no-return-formula-v1', 1, 2, validator, 'failed');
  });

  it('should properly handle a formula with a v2 step that returns no values', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateSuccessfulStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated).to.not.contain.key('simple-script.error');
      });
    };
    return eventTriggerTest('simple-no-return-formula-v2', 1, 2, validator);
  });

  it('should properly handle a formula with a step that returns no values but prints to the console log', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateSuccessfulStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(JSON.parse(consolidated['simple-script.console'])).to.have.length(1);
      });
    };
    return eventTriggerTest('simple-no-return-console-formula', 1, 2, validator);
  });

  it('should properly handle a formula with a v1 step that contains invalid json', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateErrorStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated['simple-script.error']).to.contain('Script execution failed with message:');
      });
    };
    return eventTriggerTest('simple-error-formula-v1', 1, 2, validator, 'failed');
  });

  it('should properly handle a formula with a v2 step that contains invalid json', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateErrorStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated['simple-script.error']).to.contain('Unexpected identifier');
      });
    };
    return eventTriggerTest('simple-error-formula-v2', 1, 2, validator, 'failed');
  });

  it('should properly handle a single threaded formula with a step that contains invalid json, triggered by an event with three objects', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateErrorStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated['simple-script.error']).to.contain('Script execution failed with message:');
      });
    };
    return eventTriggerTest('simple-error-formula-v1-single-threaded', 3, 2, validator, 'failed');
  });

  it('should successfully execute a simple formula triggered by a request', () => requestTriggerTest('simple-successful-request-trigger-formula', 2));

  it('should successfully execute a simple formula triggered by schedule', () => scheduleTriggerTest('simple-successful-scheduled-trigger-formula', 2));

  it('should successfully execute a simple loop formula triggered by a single event', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        expect(ses).to.have.length(103);
        ses.filter(se => se.stepName === 'create-email-body').map(validateLoopSuccessfulEmailStepExecution);
        ses.filter(se => se.stepName === 'loop').map(validateLoopSuccessfulLoopStepExecution);
      });
    };
    return eventTriggerTest('loop-successful-formula', 1, 103, validator, 'success', 103);
  });

  it('should successfully execute a simple element request formula triggered by a single event', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName !== 'trigger').map(validateSuccessfulStepExecution);
      });
    };
    return eventTriggerTest('element-request-successful-formula', 1, 7, validator);
  });

  it('should successfully execute a simple http request formula triggered manually', () => {
    const validator = (executions) => {
      executions.map(e => {
        expect(e.status).to.equal('success');
        e.stepExecutions.filter(se => se.stepName === 'did-it-work').map(sev => {
          expect(sev.stepExecutionValues).to.have.length(1);
          const stepExecutionValue = sev.stepExecutionValues[0];
          expect(stepExecutionValue.value).to.equal('true');
        });
      });
    };

    const configuration = {
      "http.request.url": props.get('url') + "/elements/api-v2/elements/sfdc"
    };

    return manualTriggerTest('http-request-successful-formula', configuration, { foo: 'bar' }, 3, validator);
  });

  it('should successfully execute a simple retry execution formula triggered manually', () => {
    const validator = (executions) => {
      executions.map(e => {
        expect(e.status).to.equal('retry');
        e.stepExecutions.filter(se => se.stepName === 'retry-execution').map(validateSuccessfulStepExecution);
        cloud.delete(`/formulas/instances/executions/${e.id}/retries`);
      });
    };

    return manualTriggerTest('simple-retry-execution-formula', null, {}, 2, validator, 'retry');
  });

  it('should successfully execute an element request formula with a configured api field', () => {
    const validator = (executions) => {
      executions.map(e => {
        const consolidated = consolidateStepExecutionValues(e.stepExecutions);
        expect(consolidated['delete-contact.response.code']).to.equal('200');
      });
    };

    const configuration = {
      "trigger-instance": sfdcId,
      "resource.name": "contacts"
    };

    return manualTriggerTest('element-request-with-configured-api-successful-formula', configuration, { foo: 'bar' }, 7, validator);
  });

  it('should successfully execute a large payload formula triggered by a single event', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        const consolidated = consolidateStepExecutionValues(ses);
        ses.filter(se => se.stepName !== 'trigger').map(validateSuccessfulStepExecution);

        expect(consolidated['simple-script.prop100']).to.exist;
        expect(consolidated['end.triggerobjectid']).to.equal('001i000001hB60bAAC1');
        expect(consolidated['end.prop100']).to.equal(JSON.parse(consolidated['simple-script.prop100']).a);
        expect(consolidated['end.done']).to.equal('true');
      });
    };
    return eventTriggerTest('large-payload-successful-formula', 1, 3, validator);
  });

  it('should successfully execute one simple formula instance x number of times for x events', () => eventTriggerTest('simple-successful-formula', 10, 2));

  it('should successfully execute one complex formula instance x number of times for x events', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        ses.filter(se => se.stepName === 'invalid-request-step')
          .map(se => expect(se.status).to.equal('failed'));
        ses.filter(se => se.stepName === 'looper' &&
            flattenStepExecutionValues(se.stepExecutionValues)['looper.index'] !== '10')
          .map(validateSuccessfulStepExecution);
        ses.filter(se => se.stepName === 'looper' &&
            flattenStepExecutionValues(se.stepExecutionValues)['looper.index'] === '10')
          .map(validateErrorStepExecution);
        ses.filter(se => se.stepName !== 'invalid-request-step' && se.stepName !== 'looper')
          .map(validateSuccessfulStepExecution);
      });
    };
    return eventTriggerTest('complex-successful-formula', 3, 30, validator, 'success', 30);
  });

  it('should support an on failure for a script step', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        expect(ses).to.have.length(3);
        ses.filter(se => se.stepName !== 'trigger' && se.stepName !== 'bad-script-step').map(validateSuccessfulStepExecution);
      });
    };
    return eventTriggerTest('script-with-on-failure-successful-formula', 1, 3, validator);
  });

  it('should return any console.log statements on a script step that fails', () => {
    const validator = (executions) => {
      executions.map(e => {
        const ses = e.stepExecutions;
        expect(ses).to.have.length(3);
        ses.filter(se => se.stepName === 'bad-script-step').map(validateErrorStepExecution);

        const consolidated = consolidateStepExecutionValues(ses);
        expect(consolidated['bad-script-step.error']).to.contains('This is an invalid script step');
        expect(consolidated['bad-script-step.console']).to.contains('print');
      });
    };

    return eventTriggerTest('script-with-on-failure-successful-formula', 1, 3, validator);
  });

  it('should show a successful execution, even if the last step is a filter step that returns false', () => eventTriggerTest('filter-returns-false', 1, 2));

  it('should support a manual trigger type on a formula', () => {
    const validator = (executions) => {
      executions.map(e => {
        expect(e.status).to.equal('success');
        e.stepExecutions.filter(se => se.stepName === 'trigger').map(t => {
          expect(t.stepExecutionValues).to.have.length(1);
          const stepExecutionValue = t.stepExecutionValues[0];
          expect(stepExecutionValue.value).to.equal('{"foo":"bar"}');
        });
      });
    };
    return manualTriggerTest('manual-trigger', null, { foo: 'bar' }, 2, validator);
  });

  it('should retry a request step when the retry property is set to true', () => {
    const validator = (executions) => {
      executions.map(e => {
        const stepExecution = e.stepExecutions.filter(se => se.stepName === 'retry-element-request')[0];
        const stepExecutionValue = stepExecution.stepExecutionValues.filter(sev => sev.key === 'retry-element-request.request.retry-attempt')[0];
        expect(stepExecutionValue.value).to.equal("3");
      });
    };

    return eventTriggerTest('retry-formula', 1, 2, validator, 'failed');
  });

  it('should have a unique formula context for a single-threaded formula that has multiple polling events trigger multiple executions at once', () => {
    const validator = (executions) => {
      // validate that each objectId exists once somewhere in the step execution values
      const events = require('./assets/events/triple-event-sfdc');
      const all = [];
      executions.forEach(e => {
        const debugStep = e.stepExecutions.filter((se) => se.stepName === 'debug')[0];
        all.push(debugStep.stepExecutionValues.filter((sev) => sev.key === 'debug.objectId')[0].value);
      });
      events.accounts.forEach(account => expect(all.indexOf(account.Id)).to.be.above(-1));
    };

    const triggerCb = (fId, fiId) => generateXSingleSfdcPollingEvents(sfdcId, 1, 'triple-event-sfdc');
    const f = require('./assets/formulas/single-threaded-formula');
    const fi = require('./assets/formulas/basic-formula-instance');
    return testWrapper(triggerCb, f, fi, 3, 2, 2, validator);
  });

  it('filter steps should add their boolean value as an available step execution value', () => {
    const validator = (executions) => {
      const execution = executions[0];
      const filterStepExecution = execution.stepExecutions.filter(se => se.stepName === 'simple-filter')[0];
      const filterStepExecutionValue = filterStepExecution.stepExecutionValues.filter(sev => sev.key === 'simple-filter.continue')[0];
      expect(filterStepExecutionValue.value).to.equal("true");
    };
    return eventTriggerTest('simple-filter-formula', 1, 2, validator);
  });

  it('should support formulas with nested loop steps', () => {
    const validator = (executions) => {
      const e = executions[0];
      // outer loop verification
      expect(e.stepExecutions.filter(se => se.stepName === 'loop-1').length).to.equal(3);
      expect(e.stepExecutions.filter(se => se.stepName === 'silly-script-1').length).to.equal(2);
      // inner loop
      expect(e.stepExecutions.filter(se => se.stepName === 'loop-2').length).to.equal(6);
      expect(e.stepExecutions.filter(se => se.stepName === 'silly-script-2').length).to.equal(4);
    };
    return eventTriggerTest('nested-loops-formula', 1, 17, validator, 'success', 17);
  });

  it('should successfully execute a simple event trigger formula triggered manually', () => {
    let event = require('./assets/events/single-event-sfdc.json');
    const eventBody = {
      message: {
        instance_id: sfdcId,
        events: [event]
      }
    };

    let triggerCb = (fId, fiId) => cloud.post(`/formulas/${fId}/instances/${fiId}/executions`, eventBody);
    return eventTriggerTest('simple-successful-formula', 1, 2, null, 'success', null, null, triggerCb);
  });


  it('should successfully stream a bulk file using an elementRequestStream step in a formula', () => {
    const configuration = { source: sfdcId, target: sfdcId, 'object.name': 'contacts' };
    let bulkUploadId;
    const validator = (executions) => {
      const bulkTransferStepExecutions = executions[0].stepExecutions.filter(se => se.stepName === 'bulkTransfer');
      const bulkTransferStepExecutionValues = bulkTransferStepExecutions[0].stepExecutionValues;

      bulkTransferStepExecutionValues.filter(sevs => sevs.key === 'bulkTransfer.download.request.headers').map(sev => {
        const sevJSON = JSON.parse(sev.value);
        expect(sevJSON.ElementsTestHeader).to.equal('source');
        expect(sevJSON['Elements-Formula-Step']).to.equal('bulkTransfer');
      });
      bulkTransferStepExecutionValues.filter(sevs => sevs.key === 'bulkTransfer.download.request.query').map(sev => {
        const sevJSON = JSON.parse(sev.value);
        expect(sevJSON.ElemetsTestQuery).to.equal('source');
      });
      bulkTransferStepExecutionValues.filter(sevs => sevs.key === 'bulkTransfer.upload.request.body').map(sev => {
        const sevJSON = JSON.parse(sev.value);
        expect(sevJSON.testMetadata).to.equal('true');
      });
      bulkTransferStepExecutionValues.filter(sevs => sevs.key === 'bulkTransfer.upload.response.body').map(sev => {
        const sevJSON = JSON.parse(sev.value);
        expect(sevJSON.status).to.equal('CREATED');
        bulkUploadId = sevJSON.id;
      });
    };

    let bulkId, contactId;

    return cloud.post('/hubs/crm/contacts', { LastName: 'Churros' })
      .then(r => contactId = r.body.Id)
      .then(r => cloud.withOptions({ qs: { q: `select FirstName, LastName, Id from contacts where Id = '${contactId}'` } }).post('/hubs/crm/bulk/query'))
      .then(r => {
        expect(r.body.status).to.equal('CREATED');
        bulkId = r.body.id;
      })
      .then(r => tools.wait.upTo(20000).for(() => cloud.get(`/hubs/crm/bulk/${bulkId}/status`, r => {
        expect(r.body.status).to.equal('COMPLETED');
      })))
      .then(r => manualTriggerTest('bulk-transfer', configuration, { id: bulkId }, 3, validator))
      .then(r => tools.wait.upTo(20000).for(() => cloud.get(`/hubs/crm/bulk/${bulkUploadId}/status`, r => {
        expect(r.body.status).to.equal('COMPLETED');
      })))
      .then(r => cloud.get(`/hubs/crm/bulk/${bulkUploadId}/errors`))
      .then(r => {
        expect(r.body.length).to.equal(0);
      })
      .then(r => cloud.delete(`/hubs/crm/contacts/${contactId}`));
  });

  it('should successfully stream a file via the documents hub APIs using an elementRequestStream step in a formula', () => {
    const configuration = { 'dropbox.instance': dropboxId };

    const validator = (executions) => {
      logger.debug('validating...');
      executions.map(e => {
        expect(e.status).to.equal('success');
      });

      const streamStepExecutions = executions[0].stepExecutions.filter(se => se.stepName === 'stream');
      const streamStepExecutionValues = streamStepExecutions[0].stepExecutionValues;
      logger.debug('ssevs: ' + JSON.stringify(streamStepExecutionValues));

      streamStepExecutionValues.filter(sevs => sevs.key === 'stream.download.response.code').map(sev => {
        logger.debug('code json: ' + JSON.stringify(sev));
        logger.debug('code: ' + sev.value);
        expect(sev.value).to.equal('200');
      });
    };
    return manualTriggerTest('documents-stream', configuration, { foo: 'bar' }, 4, validator);
  });

  it('should cancel a running formula instance execution and not attempt to cancel an already cancelled/finished execution', () => {

    const cancelTestCustomTestWrapper = (test, kickOffDatFormulaCb, f, fi, numEs, numSes, numSevs, execValidator, instanceValidator, executionStatus, numInstances) => {

    const instanceValidatorWrapper = fId => {
      if (typeof instanceValidator === 'function') { return instanceValidator(fId); }
      return Promise.resolve(fId);
    };

    const fetchAndValidateInstances = fId => () => instanceValidatorWrapper(fId)

    let fId;
    const fiIds = [];
    let exId;
    return common.createFormula(f)
      .then(f => fId = f.id)
      .then(() => tools.times(numInstances || 1)(() => common.createFormulaInstance(fId, fi)))//cloud.post(`/formulas/${fId}/instances`, fi, fiSchema)))
      .then(ps => Promise.all(ps.map(p => {
        let fiId;
        return p
          .then(fi => {
            fiId = fi.id;
            fiIds.push(fiId);
          })
          .then(() => kickOffDatFormulaCb(fId, fiId))
            .then(() => logger.debug("formula ID  ", fId, "\ninstance ID ", fiId))
          .then(() => cloud.get(`/formulas/${fId}/instances/${fiId}/executions`))
          .then(r => {
            exId = r.body[0].id;
          })
            .then(() => logger.debug("execution ID", exId))
          .then(() => {
            return new Promise(function(resolve, reject) {
              setTimeout(() => {
                resolve();
              }, 2500);
            });
          })
          // cancel, expect a 200
          .then(() => logger.debug(`cancelling execution ID ${exId} ...`))
          .then(() => cloud.patch(`/formulas/instances/executions/${exId}`, {'status': 'cancelled'}))
          .then(r => expect(r).to.have.statusCode(200))
          .then(() => {
            return new Promise(function(resolve, reject) {
              setTimeout(() => {
                resolve();
              }, 1000); 
            });
          })
          // cancel again, expect 400 (can't cancel already completed formula)
          .then(() => logger.debug(`cancelling execution ID ${exId} again ...`))
          .then(() => cloud.patch(`/formulas/instances/executions/${exId}`, {'status': 'cancelled'}, (r) => expect(r).to.have.statusCode(400)))
          // cancel non-existent execution ID, expect 404
          .then(() => logger.debug(`cancelling non-existent execution ID ${exId + 100}, expecting 404...`))
          .then(() => cloud.patch(`/formulas/instances/executions/${exId + 100}`, {'status': 'cancelled'}, (r) => expect(r).to.have.statusCode(404)));
      })))
      .then(() => tools.wait.upTo(10000).for(fetchAndValidateInstances(fId)))
      .then(() => Promise.all(fiIds.map(fiId => common.deleteFormulaInstance(fId, fiId))))
      .then(() => common.deleteFormula(fId));
    };

    const cancelTestWrapper = (kickOffDatFormulaCb, f, fi, numEs, numSes, numSevs, executionValidator, executionStatus) => {
    if (fi.configuration && fi.configuration['trigger-instance'] === '<replace-me>') fi.configuration['trigger-instance'] = sfdcId;
    return cancelTestCustomTestWrapper(test, kickOffDatFormulaCb, f, fi, numEs, numSes, numSevs, common.execValidatorWrapper(executionValidator), null, executionStatus);
    };

    const cancelManualTriggerTest = (fName, configuration, trigger, numSevs, validator, executionStatus) => {
      const f = require(`./assets/formulas/${fName}`);
      let fi = { name: 'churros-manual-formula-instance' };

      if (configuration) {
        fi.configuration = configuration;
      }

      const validatorWrapper = (executions) => {
        executions.map(e => {
          e.stepExecutions.filter(se => se.stepName === 'trigger')
            .map(t => {
              expect(t.stepExecutionValues.length).to.equal(1);
              const sev = t.stepExecutionValues[0];
              expect(sev).to.have.property('key').and.equal('trigger.args');
            });
        });
        if (typeof validator === 'function') validator(executions);
      };

      const triggerCb = (fId, fiId) => cloud.post(`/formulas/${fId}/instances/${fiId}/executions`, trigger);
      const numSes = f.steps.length + 1; // steps + trigger
      return cancelTestWrapper(triggerCb, f, fi, 1, numSes, numSevs, validatorWrapper, executionStatus);
    };

    var f = cancelManualTriggerTest('formula-waitForIt-selfContained', null, { foo: 'bar' }, 2, common.defaultValidator, 'success');
    console.log("manual trigger state", f);
    return f;
  });
});
