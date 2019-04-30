const merge = require('lodash.merge');
const debug = require('debug')('jest-puppeteer-react');

async function render(reactNode, options) {
    const { currentTestName } = expect.getState();
    debug('rendering for testname ' + currentTestName);
    const config = global._jest_puppeteer_react_default_config;
    const opts = merge({}, config.renderOptions, options);
    const host = config.useDocker ? config.dockerHost : 'localhost';

    const url = `http://${host}:${config.port}?test=${encodeURIComponent(
        currentTestName
    )}`;

    const pageConfig = {};
    if (opts.timeout) {
        pageConfig.timeout = opts.timeout;
    }
    if (opts.waitUntil) {
        pageConfig.waitUntil = opts.waitUntil;
    }

    // jest-puppeteer reuses page (browser tab) beetween tests
    // so this flag needs to avoid subscription duplication
    if (opts.dumpConsole && !page.__jestReactPuppeteerEventsSubscription) {
        page.on('console', msg => {
            console.log(`event "console" from "${currentTestName}"`);
            console[msg.type()](msg.text());
        });
        page.on('error', msg => {
            console.error(`event "error" from "${currentTestName}"`, msg);
        });
        page.on('pageerror', msg => {
            console.error(`event "pageerror" from "${currentTestName}"`, msg);
        });
        page.__jestReactPuppeteerEventsSubscription = true;
    }

    debug('page.goto ' + url);
    await page.goto(url, pageConfig);

    if (opts.viewport) {
        debug('setting a viewport from options');
        await page.setViewport(opts.viewport);
    }

    return page;
}

module.exports = render;
