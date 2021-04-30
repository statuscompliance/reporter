'use strict';

console.log('Deploy request received');

let server = null;
const governify = require('governify-commons');
let logger;

governify.init({
  configurations: [{
    name: 'main',
    location: './configurations/main.' + (process.env.NODE_ENV || 'development') + '.yaml',
    default: true
  }]
}).then(function () {
  logger = require('./src/backend/logger');
  server = require('./server');
  server.deploy(null, function () {
    logger.info('Deploy successfully done');
  });
})


// quit on ctrl-c when running docker in terminal
process.on('SIGINT', function onSigint() {
  logger.info('Got SIGINT (aka ctrl-c in docker). Graceful shutdown ', new Date().toISOString());
  shutdown();
});

// quit properly on docker stop
process.on('SIGTERM', function onSigterm() {
  logger.info('Got SIGTERM (docker container stop). Graceful shutdown ', new Date().toISOString());
  shutdown();
});

// shut down server
function shutdown() {
  server.undeploy(function onServerClosed(err) {
    if (err) {
      logger.error(err);
      process.exitCode = 1;
    }
    process.exit();
  });
}
