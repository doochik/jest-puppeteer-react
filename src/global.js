const setupPuppeteer = require('jest-environment-puppeteer/setup');
const teardownPuppeteer = require('jest-environment-puppeteer/teardown');
const WS_ENDPOINT_PATH = require('jest-environment-puppeteer/lib/constants')
    .WS_ENDPOINT_PATH;

const debug = require('debug')('jest-puppeteer-react');
const webpack = require('webpack');
const fetch = require('node-fetch');
const WebpackDevServer = require('webpack-dev-server');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const glob = promisify(require('glob'));
const docker = require('./docker');

let webpackDevServer;

const getConfig = () =>
    require(path.join(process.cwd(), 'jest-puppeteer-react.config.js'));

module.exports.setup = async function setup(
    { noInfo = true, rootDir, testPathPattern } = { noInfo: true }
) {
    debug('setup jest-puppeteer');
    await setupPuppeteer();

    // build only files matching testPathPattern
    const testPathPatterRe = new RegExp(testPathPattern, 'i');
    const testFiles = (await glob(`${rootDir}/**/*.browser.js`)).filter(
        file => !file.includes('node_modules') && testPathPatterRe.test(file)
    );

    const config = getConfig();

    const entryFiles = [
        '@babel/polyfill',
        path.resolve(__dirname, 'webpack/globals.browser.js'),
        ...testFiles,
        path.resolve(__dirname, 'webpack/entry.browser.js'),
    ];
    const aliasObject = {
        'jest-puppeteer-react': path.resolve(
            __dirname,
            'webpack/render.browser.js'
        ),
    };

    // TODO: document the conventions used here (and in the build / files) in README
    const webpackConfig = config.generateWebpackConfig(entryFiles, aliasObject);

    const compiler = webpack(webpackConfig);

    webpackDevServer = new WebpackDevServer(compiler, {
        noInfo,
        disableHostCheck: true,
        stats: 'minimal',
        ...(webpackConfig.devServer || {})
    });

    const port = config.port || 1111;
    debug('starting webpack-dev-server on port ' + port);
    webpackDevServer.listen(port);

    debug('Waiting for webpack build to succeed');
    const startTime = Date.now();
    while (true) {
        try {
            await fetch('http://localhost:' + port);
            break;
        } catch (e) {
            console.log(
                `request timed out, retrying (${Math.round(
                    (Date.now() - startTime) / 1000
                )}s)`
            );
        }
    }

    if (config.useDocker) {
        try {
            debug('calling docker.start()');
            const ws = await docker.start(config);
            debug('websocket is ' + ws);
            fs.writeFileSync(WS_ENDPOINT_PATH, ws);
            debug('wrote websocket to file ' + WS_ENDPOINT_PATH);
            console.log('\nStarting Docker for screenshots...');
        } catch (e) {
            console.error(e);
            throw new Error('Failed to start docker for screenshots');
        }
    }
};

module.exports.teardown = async function teardown() {
    debug('stopping webpack-dev-server');
    webpackDevServer.close();

    const config = getConfig();
    try {
        if (config.useDocker) {
            debug('stopping docker');
            await docker.stop(config);
        }
    } catch (e) {
        console.error(e);
    }

    debug('teardown jest-puppeteer');
    await teardownPuppeteer();
};
