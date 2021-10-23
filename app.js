module.exports = function(corsAllowList, logFunctions) {
    const server = require('./server')(corsAllowList, logFunctions);

    const http = require('http');
    let port = 49000;

    http.createServer(server).listen(port, function (err) {
        if (err) console.log(err);
        console.log(`World Scribe 2 Server is now running at http://localhost:${port}`);
    });
}
