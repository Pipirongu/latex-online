var Memcached = require('./memcached.js')
  , fs = require('fs')
  , exec  = require('child_process').exec

var memcached;

function fetch(options, callback) {
    var cmd = 'bash ';
    if (options.fetchType == "file") {
        cmd += "fetchFile.sh " + options.file;
    } else if (options.fetchType == "url") {
        cmd += "fetchUrl.sh " + options.url;
    } else {
        throw new Error("Wrong options passed to fetch: " + JSON.stringify(options));
    }
    exec(cmd, function (error, stdout, stderr) {
        if (error !== null) {
            callback(error);
            return;
        }

        var filename = stdout.split('\n')[0];
        var md5 = stdout.split('\n')[1];
        callback(null, filename, md5);
    });
}

function compile(filename, md5, callback) {
    var cmd = 'bash compile.sh ' + filename;
    console.log(cmd);
    exec(cmd, function (error, stdout, stderr) {
        if (error !== null) {
            fs.unlink('./tmp/' + filename);
            console.error("cmd ERR: " + error);
            error = new Error(error.toString() + "\n" + stdout);
            callback(error);
            return;
        }
        var newFileName = './tmp/' + stdout.trim();
        console.log("Compiled file saved as: " + newFileName);
        fs.readFile(newFileName, function(err, data){
            if (err) {
                console.error("File read error: " + err);
                callback(err);
                return;
            }
            console.log("Successfully read " + data.length + " bytes");

            memcached.store(md5, data);

            console.log("calling callback");
            callback(null, data);
            console.log("removing file");
            fs.unlink(newFileName);
        });
    });
}

function createFetchCallback(callback) {
    function fetchCallback(err, filename, md5) {
        if (err)  {
            callback(err);
            return;
        }
        console.log("Fetched file saved as " + filename + " with md5 = " + md5);

        memcached.get(md5, function(err, result) {
            if (err || !result) {
                if (err) {
                    console.log("Memcached GET error: " + err);
                } else {
                    console.error("Memcached doesn't have anything for key = " + md5);
                }
                compile(filename, md5, callback);
            } else {
                console.log("fetched " + result.length + " bytes from memcache for KEY " + md5);
                // don't forget to clear the fetched file
                fs.unlink('./tmp/' + filename);
                callback(null, result);
            }
        });
    }

    return fetchCallback;
}

function processUrl(url, callback) {
    fetch({fetchType: "url", url: url}, createFetchCallback(callback));
}

function processFile(file, callback) {
    fetch({fetchType: "file", file: file}, createFetchCallback(callback));
}

module.exports = function(options) {
    options = options || {
        caching: true
    };
    if (options.caching) {
        memcached = new Memcached();
        memcached.connect();
    } else {
        // creating mock memcached instance
        memcached = {
            store: function(key, data) {
            },
            get: function(key, callback) {
                callback(new Error("Memcached is disabled in the app"));
            }
        }
    }
    return {
        processFile: processFile,
        processUrl: processUrl
    };
}
