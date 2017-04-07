var assert = require('assert');
var fs = require('fs');
var path = require('path');
var request = require('request');

var baseUrl = 'http://latex.aslushnikov.com';

describe('/compile', function() {
    this.timeout(5000);
    this.slow(2000);
    describe('git', function() {
        it('https://github.com/aslushnikov/diplom-latex&target=diplom.tex', async function() {
            var url = baseUrl +  '/compile?git=git%3A%2F%2Fgithub.com%2Faslushnikov%2Fdiplom-latex.git&target=diplom.tex';
            var request = createGetRequest(url);
            await expectPdf(request);
        });
    });
    describe('text', function() {
        it('goodText', async function() {
            var goodText = [
                '\\documentclass{article}',
                '\\begin{document}',
                'Correct document.',
                '\\end{document}'
            ].join('\n');
            var url = baseUrl + '/compile?text=' + encodeURIComponent(goodText);
            var request = createGetRequest(url);
            await expectPdf(request);
        });

        it('badText', async function() {
            var badText = [
                '\\documentclass{article}',
                '\\begin{document}',
                'Does not compile!'
            ].join('\n');
            var url = baseUrl + '/compile?text=' + encodeURIComponent(badText);
            var request = createGetRequest(url);
            await expectError(request);
        });
    });
    describe('url', function() {
        it('goodURL', async function() {
            var goodURL = 'https://raw.githubusercontent.com/aslushnikov/latex-online/master/sample/sample.tex';
            var url = baseUrl + '/compile?url=' + encodeURIComponent(goodURL);
            var request = createGetRequest(url);
            await expectPdf(request);
        });
        it('badURL', async function() {
            var badURL = 'https://raw.githubusercontent.com/aslushnikov/latex-online/master/sample/bad.tex';
            var url = baseUrl + '/compile?url=' + encodeURIComponent(badURL);
            var request = createGetRequest(url);
            await expectError(request);
        });
    });
});

describe('/data', function() {
    this.timeout(5000);
    this.slow(2000);
    it('cli-good', async function() {
        var filePath = path.join(__dirname, 'resources', 'good.tar.gz');
        var target = 'short.tex';
        var request = createUploadRequest(filePath, target);
        await expectPdf(request);
    });
    it('cli-bad', async function() {
        var filePath = path.join(__dirname, 'resources', 'bad.tar.gz');
        var target = 'short.tex';
        var request = createUploadRequest(filePath, target);
        await expectError(request);
    });
    it('cli-cache-busting', async function() {
        var filePath = path.join(__dirname, 'resources', 'good.tar.gz');
        var target = 'nonexistent.tex';
        var request = createUploadRequest(filePath, target);
        await expectError(request);
        target = 'short.tex';
        request = createUploadRequest(filePath, target);
        await expectPdf(request);
    });
});

/**
 * @param {!Request} request
 */
async function expectPdf(request) {
    var response = await request
    assert.ok(response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
}

/**
 * @param {string} testName
 * @param {!Request} request
 */
async function expectError( request) {
    var response = await request;
    assert.ok(response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['content-type'], 'text/plain; charset=UTF-8');
}

/**
 * @param {string} url
 * @return {!Promise}
 */
function createGetRequest(url) {
    var options = {
        method: 'get',
        url: url,
        headers: {
            // Pretend to be bot: Avoid analytics-related redirects.
            'User-Agent': 'wget latex-oneline test sanity-test.js'
        }
    };
    return doRequest(options);
}

/**
 * @param {string} filePath
 * @param {string} target
 * @return {!Promise}
 */
function createUploadRequest(filePath, target) {
    var options = {
        method: 'post',
        url: baseUrl + '/data?target=' + encodeURIComponent(target),
        formData: {
            file: fs.createReadStream(filePath)
        }
    };
    return doRequest(options);
}

/**
 * @param {!Object} options
 * @return {!Promise}
 */
function doRequest(options) {
    var fulfill, reject;
    var promise = new Promise((x, y) => {fulfill = x; reject = y});
    request(options).on('response', function(response) {
        fulfill(response);
    }).on('error', function(error) {
        reject(error);
    });
    return promise;
}

