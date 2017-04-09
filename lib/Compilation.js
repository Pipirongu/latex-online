var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;
var utils = require('./utilities');
var logger = utils.logger('Compilation');

var compileScriptPath = path.join(__dirname, '..', 'shells', 'compile.sh');

var compilationId = 0;

class Compilation {
    /**
     * @param {!CompilationRequest} compilationRequest
     * @param {!Downloader} downloader
     * @param {string} resultsFolder
     */
    constructor(compilationRequest, downloader, resultsFolder) {
        this.id = 'compilation_' + (++compilationId);
        this._downloader = downloader;
        this._resultsFolder = resultsFolder;
        this._outputFolder = null;
        this._compilationRequest = compilationRequest;

        var timestamp = Date.now();
        this.fingerprint = compilationRequest.fingerprint;
        this.finished = false;
        this.success = false;
        this.startTime = timestamp;
        this.accessTime = timestamp;
        this.endTime = timestamp;
        this.userError = null;
    }

    _logData(meta) {
        var data = {
            id: this.id,
            fingerprint: this.fingerprint,
            outputfolder: this._outputFolder,
        };
        if (meta)
            Object.assign(data, meta);
        return data;
    }

    /**
     * @return {?string}
     */
    logPath() {
        return this._outputFolder ? path.join(this._outputFolder, 'log.txt') : null;
    }

    /**
     * @return {?string}
     */
    outputPath() {
        return this._outputFolder ? path.join(this._outputFolder, 'output.pdf') : null;
    }

    /**
     * @return {!Promise<!Compilation>}
     */
    async run() {
        if (this._runningPromise)
            return this._runningPromise;
        this._runningPromise = this._innerRunCompilation()
            .catch(e => {
                logger.error(`ERROR: Compiler crashed during execution - ${e.message}`, this._logData());
            })
            .then(() => {
                this._downloader.dispose();
                return this;
            });
        return this._runningPromise;
    }

    /**
     * @return {!Promise}
     */
    async _innerRunCompilation() {
        // Try to create directory for compilation.
        this._outputFolder = path.join(this._resultsFolder, this.id);
        var success = await utils.mkdir(this._outputFolder);
        if (!success) {
            this._finishCompilation(false, 'Compiation Job failed due to internal reasons');
            return;
        }

        var {folderPath, userError} = await this._downloader.downloadIfNeeded();
        if (!folderPath) {
            this._finishCompilation(false /* success */, userError);
            return;
        }
        var timeout = utils.minutes(5);
        var target = this._compilationRequest.target;
        var command = this._compilationRequest.command;
        var success = await this._runShellScript(folderPath, target, command, this.outputPath(), this.logPath(), timeout);
        this._finishCompilation(success, null);
    }

    dispose() {
        if (!this.finished) {
            logger.error(`ERROR: cannot dispose running task.`, this._logData());
            return;
        }
        // We failed to create output folder.
        if (!this._outputFolder)
            return;
        // No need to wait for removal.
        utils.rmdirRecursive(this._outputFolder).then(success => {
            if (!success)
                logger.error(`ERROR: failed to cleanup compilation`, this._logData());
        });
        logger.info(`Compilation disposed.`, this._logData());
    }

    /**
     * @param {boolean} success
     * @param {string} userError
     */
    _finishCompilation(success, userError) {
        this.userError = userError;
        this.finished = true;
        this.success = success;
        var time = Date.now();
        this.endTime = time;
        this.accessTime = time;
        var duration = this.endTime - this.startTime;
        logger.info('Compilation finished', this._logData({
            duration,
            success: this.success,
            userError: this.userError
        }));
    }

    /**
     * @param {string} workdirPath
     * @param {string} targetRelativePath
     * @param {string} outputPath
     * @param {string} logPath
     * @param {number} timeout
     * @return {!Promise<boolean>}
     */
    _runShellScript(workdirPath, targetRelativePath, command, outputPath, logPath, timeout) {
        logger.info('Running compilation', this._logData({
            inputfolder: workdirPath,
            command: command,
            target: targetRelativePath
        }));
        var process = spawn('bash', [compileScriptPath, workdirPath, targetRelativePath, command, outputPath, logPath]);

        var fulfill;
        var promise = new Promise(x => fulfill = x);
        var jobTimeout = setTimeout(() => process.kill(), timeout);
        process.on('close', (code) => {
            clearTimeout(jobTimeout);
            fulfill(code === 0);
        });
        return promise;
    }
}

module.exports = Compilation;