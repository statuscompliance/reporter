/*!
governify-project-gauss-reporter 1.0.0, built on: 2018-04-19
Copyright (C) 2018 ISA group
http://www.isa.us.es/
https://github.com/isa-group/governify-project-gauss-reporter

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>. */

'use strict';

const moment = require('moment-timezone');

const InfluxDB = require('../../services/influxService').InfluxDB;
const Reporter = require('../../services/gaussReporterService/').GaussReporter;
const governify = require('governify-commons');
const config = governify.configurator.getConfig('main');
const logger = governify.getLogger().tag('v4-reporter-controller');
const JSONStream = require('JSONStream');
const Promise = require('bluebird');
const objectiveUtils = require('../../utils/objective-utils');

const influx = new InfluxDB(governify.infrastructure.getServiceURL('internal.database.influx-reporter'), config.influx.database, config.influx.measurement, config.influx.fields, config.influx.tags);

const reporter = new Reporter(influx);
var statusCreatePoints = {};

var looper;
/**
 * Start retrieving KPIs information
 *
 * contractId String Contract ID
 * timer String timer (optional)
 * loop String loop (optional)
 * no response value expected for this operation
 **/
exports.contractsContractIdStartGET = (contractId, timer, loop, periods) => {
  return new Promise((resolve, reject) => {
    reporter.contractId = contractId;

    var loopProcess = (timer, loop, resolve, reject) => {
      reporter.isExecutionFinished = true;
      looper = setInterval(() => {
        if (loop && loop === 'false' && reporter.isExecutionFinished) {
          logger.info('Initializing a new process at ' + moment().format());
          reporter.isExecutionFinished = false;

          reporter.process(periods).then(() => {
            logger.info('ExecutionFinished at ' + moment().format());
            reporter.isExecutionFinished = true;
          }).catch((error) => {
            reporter.isExecutionFinished = true;
            return reject({
              code: 'REP-500D',
              message: 'there was an error',
              details: error
            });
          });
          return resolve({
            code: 'REP-200',
            message: 'OK: Initializing a new process at ' + moment().format(),
            details: ''
          });
        } else {
          logger.info('Execution is not finished yet. Loop process will keep trying');
          return resolve({
            code: 'REP-204',
            message: 'Execution is not finished yet. Loop process will keep trying',
            details: ''
          });
        }
      }, timer);
    };

    if (loop && loop === 'true') {
      loopProcess(timer, loop, resolve, reject);
    } else {
      reporter.isExecutionFinished = false;
      reporter.process(periods).then((res) => {
        logger.info('Execution finished at ' + moment().format());
        reporter.isExecutionFinished = true;
        return resolve({
          code: 'REP-200',
          message: 'Execution finished at ' + moment().format(),
          details: ''
        });
      }).catch((error) => {
        return reject({
          code: 'REP-500B',
          message: 'there was an error',
          details: error
        });
      });
    }
  });
};

/**
 * Stop retrieving KPIs information
 *
 * contractId String Contract ID
 * no response value expected for this operation
 **/
exports.contractsContractIdStopGET = (contractId) => {
  return new Promise((resolve, reject) => {
    reporter.isExecutionFinished = false;
    clearTimeout(looper);
    return resolve({
      code: '200',
      message: 'OK: Process stopped at ' + moment().format(),
      details: ''
    });
  });
};

/**
 * Stop retrieving KPIs information
 *
 * contractId String Contract ID
 * no response value expected for this operation
 **/
exports.contractsContractIdCreatePointsFromListGET = (contractId) => {
  return new Promise((resolve, reject) => {
    resolve(statusCreatePoints[contractId]);
  });
};

/**
 * Create history and save points
 *
 * contractId String Contract ID
 * no response value expected for this operation
 **/
exports.contractsContractIdCreateHistoryPOST = async (contractId, period) => {
  logger.info('Creating history for agreementID: ' + contractId);
  return new Promise(async (resolve, reject) => {
    logger.info('Getting the agreements from Registry with contractId = %s', contractId);
    const agreementRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/agreements/' + contractId);
    const agreement = agreementRequest.data;
    var periods = Reporter.getPeriods(agreement, {
      initial: agreement.context.validity.initial,
      period: period
    });

    Promise.each(periods, function (period) {
      return callRegistryAndStorePoints('/api/v6/states/' + contractId + '/guarantees' + '?from=' + period.from + '&to=' + period.to, agreement);
    }).then(function () {
      logger.info('Finished creating history for agreeement ' + contractId);
      resolve();
    }).catch(err => {
      logger.error("Calculation failed for period:", period);
      reject("Calculation failed for period:", period)
    });
  });
};

/**
 * Create history and save points
 *
 * contractId String Contract ID
 * no response value expected for this operation
 **/
exports.contractsContractIdCreatePointsFromListPOST = async (contractId, listDates) => {
  logger.info('Creating points from List for agreementID: ' + contractId);

  return new Promise((resolve, reject) => async function () {
    if (statusCreatePoints[contractId]) {
      resolve(); // return "A process to create Points from List is already started."
    } else {
      statusCreatePoints[contractId] = { current: 0, total: 1 };
      try {
        logger.info('Getting the agreements from Registry with contractId = %s', contractId);
        const agreementRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/agreements' + contractId);
        const agreement = agreementRequest.data;
        var periods = listDates.map(x => { return { from: x, to: moment(x).add(1, 'second').toISOString() }; });
        Promise.each(periods, function (period) {
          statusCreatePoints[contractId] = { current: statusCreatePoints[contractId].current + 1, total: periods.length };
          return callRegistryAndStorePoints('/api/v6/states/' + contractId + '/guarantees' + '?from=' + period.from + '&to=' + period.to + '&newPeriodsFromGuarantees=false', agreement);
        }).then(function () {
          statusCreatePoints[contractId] = undefined;
          logger.info('Finished creating history for agreeement ' + contractId);
          resolve();
        });
      } catch (error) {
        logger.error(error);
        statusCreatePoints[contractId] = undefined;
      }
    }
  });
};

/**
 * Updates KPIs information
 *
 * contractId String Contract ID
 * no response value expected for this operation
 **/
exports.contractsContractIdUpdateGET = (contractId) => {
  return new Promise(async (resolve, reject) => {
    var urlRegistryRequest = '/api/v6/states/' + contractId + '/guarantees' + '?from=' + moment().toISOString() + '&to=' + moment().add(3, 'week').toISOString() + '&newPeriodsFromGuarantees=false';
    logger.info('Getting the agreements from Registry with contractId = %s', contractId);
    const agreementRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/agreements/' + contractId);
    const agreement = agreementRequest.data;
    callRegistryAndStorePoints(urlRegistryRequest, agreement);
    // TODO: Add feedback about request. And create tasks for get status of requests
    resolve();
  });
};

exports.resetPOST = function (args, res, next) {
  try {
    logger.info('Trying to reset Reporter and  Influx database!');
    var agreementId = args.contractId.value;

    // Delete influx db for the agreement

    influx.influx.dropSeries({
      measurement: m => m.name(config.influx.measurement),
      where: e => e.tag('agreement').equals.value(agreementId),
      database: config.influx.database
    });

    influx.influx.dropSeries({
      measurement: m => m.name(config.influx.measurement_historical),
      where: e => e.tag('agreement').equals.value(agreementId),
      database: config.influx.database
    });

    // Create database if it does not exist yet.
    influx.influx.getDatabaseNames().then(names => {
      logger.info('DBs in influxdb', names);
      if (!names.includes(config.influx.database)) {
        return influx.createDatabase(config.influx.database);
      }
    }).then(() => {
      logger.info('InfluxDb: DB created');
    }).catch(err => {
      logger.info('Error creating Influx database!');
    });

    res.status(200).json({
      code: 200,
      message: "Influx '" + config.influx.measurement_historical + "' and '" + config.influx.measurement + "' measurements have been removed."
    });
  } catch (err) {
    logger.error('Error when trying to stop reporter: ' + err);
    res.status(200).json({
      code: 500,
      message: 'Internal error'
    });
  }
};

var timeBetweenRequests = 10000;

function callRegistryAndStorePoints(path, agreement) {
  return new Promise((resolve, reject) => {
    setTimeout(async function () {
      logger.info('URLRegistry: ' + path);
      var requestMetrics = await governify.infrastructure.getService('internal.registry').request({
        url: path,
        responseType: 'stream'
      }).catch(err => {
        logger.error('Error in registry state call: ', err);
        reject(err);
      });
      const requestStream = requestMetrics.data;
      requestStream.pipe(JSONStream.parse()).on('data', guaranteeStates => {
        logger.info('Receiving agreement states');
        console.log(1)
        console.log(requestStream.data)
        try {
          for (var i in guaranteeStates) {
            var guaranteeResult = guaranteeStates[i];
            var timestamp = moment(guaranteeResult.period.from).valueOf() * 1000000;

            var influxPoint = {
              measurement: config.influx.measurement,
              tags: {
                agreement: guaranteeResult.agreementId,
                id: guaranteeResult.id
              },
              fields: {
                guaranteeValue: objectiveUtils.calculateObjective(agreement.terms.guarantees.find(x => x.id === guaranteeResult.id).of[0].objective, guaranteeResult.metrics).value,
                guaranteeResult: guaranteeResult.value
              },
              timestamp: timestamp
            };

            for (const [key, value] of Object.entries(guaranteeResult.metrics)) {
              influxPoint.fields['metric_' + key] = value;
            }
            for (const [key, value] of Object.entries(guaranteeResult.scope)) {
              influxPoint.tags['scope_' + key] = value;
            }

            influxInsert([influxPoint], function () { });
          }

          resolve();
        } catch (err) {
          logger.error('Error while processing guarantee data received. Adding to queue');
          logger.error(err);
          return addToRequestsQueue(path, agreement).then(() => { resolve(); });
        }
      }).on('error', err => {
        logger.error('Error while getting data from registry, retrying connection:');
        setTimeout(function () {
          return callRegistryAndStorePoints(path, agreement).then(function () { resolve(); });
        }, 1500);

        return res.status(500).json(err);
      });
    }

      , timeBetweenRequests);
  });
}

var queue = [];
var running = false;
var timeBetweenQueueRequests = 20000;

function addToRequestsQueue(urlRegistry, agreement) {
  queue.push([urlRegistry, agreement]);
  timeBetweenRequests += 20000;
  timeBetweenRequests > 160000 ? timeBetweenRequests = 160000 : undefined;

  if (!running) {
    running = true;
    computeQueue();
  }
  return Promise.resolve('Added to queue');
}

async function computeQueue() {
  while (running) {
    logger.info('Queue lenght: [', queue.length, '] - Time Between requests: [', timeBetweenRequests, ']');
    if (queue.length === 0) {
      logger.info('There are no more items in the queue.');
      running = false;
    } else {
      var element = queue.shift();
      await new Promise(async (resolve, reject) => { // Waits for the function to complete
        callRegistryAndStorePoints(element[0], element[1]).then(async () => {
          setTimeout(function () {
            resolve();
          }, timeBetweenQueueRequests); // Time between Queue requests
        });
      });
    }
  }
}

var influxInsert = (elements, callback, repetitions) => {
  influx.influx.writePoints(elements, {
    maxRetries: 50,
    requestTimeout: 600000
  }).then(callback).catch((err, data) => {
    logger.info('Error Writing in db ', err);
    if (!repetitions) { repetitions = 0; }
    if (repetitions < 10) {
      return influxInsert(elements, callback, repetitions + 1)
    }
  });
};

/**
 * Create history and save points
 *
 * contractId String Contract ID
 * no response value expected for this operation
 **/
exports.contractsContractIdCreatePointsFromPeriodsPOST = (contractId, periods) => {
  logger.info('Creating points from List for agreementID: ' + contractId);

  return new Promise(async (resolve, reject) => {
    /* if (statusCreatePoints[contractId]) {
     resolve(); //return "A process to create Points from List is already started."
    }
    else {
      statusCreatePoints[contractId] = { current: 0, total: 1 }; */
    try {
      logger.info('Getting the agreements from Registry with contractId = %s', contractId);
      const agreementRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/agreements/' + contractId);
      const agreement = agreementRequest.data;
      Promise.each(periods, function (period) {
        // statusCreatePoints[contractId] = { current: statusCreatePoints[contractId].current + 1, total: periods.length }

        return callRegistryAndStorePoints('/api/v6/states/' + contractId + '/guarantees' + '?from=' + period.from + '&to=' + period.to + '&newPeriodsFromGuarantees=false', agreement);
      }).then(function () {
        // statusCreatePoints[contractId] = undefined;
        logger.info('Finished creating event collector metrics for agreeement ' + contractId);
        resolve();
      });
    } catch (error) {
      logger.error(error);
      // statusCreatePoints[contractId] = undefined;
    }

    // }
  });
};
