'use strict';

const provisioner = require('core/provisioner');
const cleaner = require('core/cleaner');
const common = require('./assets/common');
const logger = require('winston');
const suite = require('core/suite');
const cloud = require('core/cloud');
const fSchema = require('./assets/schemas/formula.schema');
const fiSchema = require('./assets/schemas/formula.instance.schema');
const sleep = require('sleep');
const tools = require('core/tools');
const expect = require('chakram').expect;
const moment = require('moment');
const fs = require('fs');

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

const validateSimpleSuccessfulStepExecutionsForType = tValidator => ses => {
  expect(ses).to.have.length(2);
  ses.map(se => validateSuccessfulStepExecution(se));
  ses.filter(se => se.stepName === 'trigger').map(tValidator);
};

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

const validateLoopSuccessfulStepExecutionsForEvents = tValidator => ses => {
  expect(ses).to.have.length(103);
  ses.filter(se => se.stepName === 'trigger').map(tValidator);
  ses.filter(se => se.stepName === 'create-email-body').map(validateLoopSuccessfulEmailStepExecution);
  ses.filter(se => se.stepName === 'loop').map(validateLoopSuccessfulLoopStepExecution);
};

const validateElementRequestSuccessfulStepExecutionsForEvents = tValidator => ses => {
  expect(ses).to.have.length(7);
  ses.filter(se => se.stepName === 'trigger').map(tValidator);
  ses.filter(se => se.stepName !== 'trigger').map(validateSuccessfulStepExecution);
};

const validateExecution = (e, expectedStatus) => validator => {
  const fn = validator || ((ses) => ses.map(se => validateSuccessfulStepExecution(se)));
  const es = expectedStatus || 'success';
  expect(e.status).to.equal(es);
  fn(e.stepExecutions);
};

const generateXSingleSfdcPollingEvents = (instanceId, x, fileName) => {
  fileName = fileName || 'single-event-sfdc';
  const payload = require(`./assets/events/${fileName}`);
  return Promise.all(Array(x).fill().reduce((p, c) => {
    p.push(common.generateSfdcPollingEvent(instanceId, payload));
    return p;
  }, []));
};

const validateSuccessfulEventTrigger = num => se => {
  expect(se).to.have.property('status').and.equal('success');

  const flat = flattenStepExecutionValues(se.stepExecutionValues);
  expect(flat['trigger.type']).to.equal('event');
  expect(flat['trigger.event']).to.exist;
  expect(flat['trigger.eventId']).to.exist;
};

const validateSimpleSuccessfulStepExecutions = {
  forEvents: (num) => validateSimpleSuccessfulStepExecutionsForType(validateSuccessfulEventTrigger(num))
};

const validateLoopSuccessfulStepExecutions = {
  forEvents: (num) => validateLoopSuccessfulStepExecutionsForEvents(validateSuccessfulEventTrigger(num))
};

const validateElementRequestSuccessfulStepExecutions = {
  forEvents: (num) => validateElementRequestSuccessfulStepExecutionsForEvents(validateSuccessfulEventTrigger(num))
};

suite.forPlatform('formulas', { name: 'formula executions' }, (test) => {
  let sfdcId;
  before(() => {
    return provisioner.create('sfdc', { 'event.notification.enabled': true, 'event.vendor.type': 'polling', 'event.poller.refresh_interval': 999999999 })
      .then(r => sfdcId = r.body.id)
      .catch(e => {
        console.log(`Failed to finish before()...${e}`);
        process.exit(1);
      });
  });

  after(done => {
    if (!sfdcId) done();
    return provisioner.delete(sfdcId)
      .then(() => done())
      .catch(e => {
        console.log(`Failed to finish after()...${e}`);
        done();
      });
  });

  /**
   * The default validator which applies to *every* single formula instance execution
   */
  const defaultValidator = (executions, numEs, numSes, executionStatus) => {
    logger.debug('Validating executions with default validator');
    expect(executions).to.have.length(numEs);
    executions.map(e => {
      const eStatus = (executionStatus || 'success');
      expect(e.status).to.equal(eStatus);

      logger.debug('Validating step executions with default validator');
      expect(e.stepExecutions).to.have.length(numSes);
      e.stepExecutions.map(se => {
        expect(se).to.have.property('status');

        logger.debug('Validating step execution values with default validator');
        if (se.stepName === 'trigger') expect(se).to.have.property('status').and.equal('success');
      });
    });
  };

  /**
   * The test wrapper to wrap them all ...
   */
  const testWrapper = (kickOffDatFormulaCb, f, fi, numEs, numSes, numSevs, validator, executionStatus) => {
    const validatorWrapper = (executions) => {
      defaultValidator(executions, numEs, numSes, executionStatus);
      if (typeof validator === 'function') validator(executions);
      return executions;
    };

    if (fi.configuration && fi.configuration['trigger-instance'] === '<replace-me>') fi.configuration['trigger-instance'] = sfdcId;

    let fId, fiId;
    return cleaner.formulas.withName(f.name)
      .then(() => cloud.post(test.api, f, fSchema))
      .then(r => fId = r.body.id)
      .then(() => cloud.post(`/formulas/${fId}/instances`, fi, fiSchema))
      .then(r => fiId = r.body.id)
      .then(() => kickOffDatFormulaCb(fId, fiId))
      .then(() => tools.wait.upTo(60000).for(common.allExecutionsCompleted(fId, fiId, numEs, numSevs)))
      .then(() => common.getFormulaInstanceExecutions(fiId))
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(executions => validatorWrapper(executions))
      .then(() => common.deleteFormulaInstance(fId, fiId))
      .then(() => common.deleteFormula(fId));
  };

  /**
   * Handles the basic formula execution test for a formula that is triggered by an event
   */
  const eventTriggerTest = (fName, numEvents, numSevs, validator, executionStatus, numSes, eventFileName) => {
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
            expect(flat['trigger.eventId']).to.exist;
          }
        });
      });
      if (typeof validator === 'function') validator(executions);
    };

    const triggerCb = (fId, fiId) => generateXSingleSfdcPollingEvents(sfdcId, numEvents, eventFileName);
    numSes = numSes || f.steps.length + 1; // defaults to steps + trigger but for loop cases, that won't work
    return testWrapper(triggerCb, f, fi, numEvents, numSes, numSevs, validatorWrapper, executionStatus);
  };

  /**
   * Handles the basic formual execution test for a formula that is triggered by a request
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
  const manualTriggerTest = (fName, numSevs, validator, executionStatus) => {
    const f = require(`./assets/formulas/${fName}`);
    const fi = { name: 'churros-manual-formula-instance' };

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

    const triggerCb = (fId, fiId) => cloud.post(`/formulas/${fId}/instances/${fiId}/executions`, { foo: 'bar' });
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
    return manualTriggerTest('manual-trigger', 2, validator);
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

  /** NOTE: The tests below this line have not been re-factored to follow our standard flow and need updated */

  it('should successfully execute a simple event trigger formula triggered manually', () => {
    const formula = require('./assets/formulas/simple-successful-formula');
    formula.singleThreaded = true;
    const formulaInstance = require('./assets/formulas/basic-formula-instance');
    formulaInstance.configuration['trigger-instance'] = sfdcId;

    let fId, fiId;
    return cleaner.formulas.withName(formula.name)
      .then(() => generateXSingleSfdcPollingEvents(sfdcId, 1))
      .then(() => sleep.sleep(5)) // Let the event flow through
      .then(() => cloud.post(test.api, formula, fSchema))
      .then(r => fId = r.body.id)
      .then(() => cloud.post(`/formulas/${fId}/instances`, formulaInstance, fiSchema))
      .then(r => fiId = r.body.id)
      .then(() => cloud.get(`/instances/${sfdcId}/events`))
      .then(r => cloud.post(`/formulas/${fId}/instances/${fiId}/executions`, r.body[0].notifiedData[0]))
      .then(() => sleep.sleep(5))
      .then(() => common.getFormulaInstanceExecutions(fiId))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateSimpleSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.deleteFormulaInstance(fId, fiId))
      .then(() => common.deleteFormula(fId));
  });

  it('should successfully execute three simple formula instances triggered by a single event', () => {
    const formula = require('./assets/formulas/simple-successful-formula');
    const formulaInstance = require('./assets/formulas/basic-formula-instance');

    let fId, fiId1, fiId2, fiId3;
    return cleaner.formulas.withName('simple-successful')
      .then(r => formulaInstance.configuration['trigger-instance'] = sfdcId)
      .then(() => cloud.post(test.api, formula, fSchema))
      .then(r => fId = r.body.id)
      .then(() => cloud.post(`/formulas/${fId}/instances`, formulaInstance, fiSchema))
      .then(r => fiId1 = r.body.id)
      .then(() => cloud.post(`/formulas/${fId}/instances`, formulaInstance, fiSchema))
      .then(r => fiId2 = r.body.id)
      .then(() => cloud.post(`/formulas/${fId}/instances`, formulaInstance, fiSchema))
      .then(r => fiId3 = r.body.id)
      .then(() => generateXSingleSfdcPollingEvents(sfdcId, 1))
      .then(() => sleep.sleep(20))
      .then(() => common.getFormulaInstanceExecutions(fiId1))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateSimpleSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.getFormulaInstanceExecutions(fiId2))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateSimpleSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.getFormulaInstanceExecutions(fiId3))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateSimpleSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.deleteFormulaInstance(fId, fiId1))
      .then(() => common.deleteFormulaInstance(fId, fiId2))
      .then(() => common.deleteFormulaInstance(fId, fiId3))
      .then(() => common.deleteFormula(fId));
  });

  it('should successfully execute three different formula instances triggered by a single event', () => {
    const formula1 = require('./assets/formulas/simple-successful-formula');
    const formulaInstance1 = require(`./assets/formulas/basic-formula-instance`);

    const formula2 = require('./assets/formulas/element-request-successful-formula');
    const formulaInstance2 = require(`./assets/formulas/basic-formula-instance`);

    const formula3 = require('./assets/formulas/loop-successful-formula');
    const formulaInstance3 = require(`./assets/formulas/basic-formula-instance`);

    let fId1, fId2, fId3, fiId1, fiId2, fiId3;
    return cleaner.formulas.withName(['simple-successful', 'element-request-successful', 'loop-successful'])
      .then(r => {
        formulaInstance1.configuration['trigger-instance'] = sfdcId;
        formulaInstance2.configuration['trigger-instance'] = sfdcId;
        formulaInstance3.configuration['trigger-instance'] = sfdcId;
      })
      .then(() => cloud.post(test.api, formula1, fSchema))
      .then(r => fId1 = r.body.id)
      .then(() => cloud.post(test.api, formula2, fSchema))
      .then(r => fId2 = r.body.id)
      .then(() => cloud.post(test.api, formula3, fSchema))
      .then(r => fId3 = r.body.id)
      .then(() => cloud.post(`/formulas/${fId1}/instances`, formulaInstance1, fiSchema))
      .then(r => fiId1 = r.body.id)
      .then(() => cloud.post(`/formulas/${fId2}/instances`, formulaInstance2, fiSchema))
      .then(r => fiId2 = r.body.id)
      .then(() => cloud.post(`/formulas/${fId3}/instances`, formulaInstance3, fiSchema))
      .then(r => fiId3 = r.body.id)
      .then(() => generateXSingleSfdcPollingEvents(sfdcId, 1))
      .then(() => sleep.sleep(10))
      .then(() => common.getFormulaInstanceExecutions(fiId1))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateSimpleSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.getFormulaInstanceExecutions(fiId2))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateElementRequestSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.getFormulaInstanceExecutions(fiId3))
      .then(r => {
        expect(r).to.have.statusCode(200) && expect(r.body).to.have.length(1);
        return r;
      })
      .then(r => Promise.all(r.body.map(fie => common.getFormulaInstanceExecutionWithSteps(fie.id))))
      .then(rs => rs.map(r => validateExecution(r)(validateLoopSuccessfulStepExecutions.forEvents(1))))
      .then(() => common.deleteFormulaInstance(fId1, fiId1))
      .then(() => common.deleteFormulaInstance(fId2, fiId2))
      .then(() => common.deleteFormulaInstance(fId3, fiId3))
      .then(() => common.deleteFormula(fId1))
      .then(() => common.deleteFormula(fId2))
      .then(() => common.deleteFormula(fId3));
  });
});
