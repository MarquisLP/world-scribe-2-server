module.exports = function(corsAllowList, logFunctions) {
    // Redirect logs to another logging service, such as electron-log.
    if (logFunctions) {
        Object.assign(console, logFunctions);
    }

    require('dotenv').config();

    const express = require('express');
    const server = express();

    const bodyParser = require('body-parser');
    server.use(bodyParser.json());

    if (corsAllowList) {
        const cors = require('cors');
        const serverCors = cors({
            origin: corsAllowList,
            credentials: true
        });
        server.use(serverCors);
    }

    // Dummy handler for top-level route '/'.
    // The concurrently package (used in the desktop app) needs this, as it will not deem a port "ready" until it returns a 200 response.
    server.get('/', function (req, res, next) {
        return res.status(200).json({ message: "World Scribe server is running" });
    });

    // These are GLOBAL server variables that can be accessed from any route.
    server.locals.upload = null; // multer instance for file upload
    server.locals.currentWorldFolderPath = null; // Filepath to the World that the client has currently opened
    server.locals.repository = null; // An instance of ./database/repository.js, containing functions for database operations

    require('./routes/world')(server);

    server.use(function(req, res, next) {
        if (!server.locals.currentWorldFolderPath || !server.locals.upload || !server.locals.repository) {
            return res.status(400).json({message: "Server is not connected to a World. Please configure the World connection using the POST /api/worldAccesses endpoint."});
        }
        else {
            next();
        }
    });

    require('./routes/category')(server);
    require('./routes/article')(server);
    require('./routes/field')(server);
    require('./routes/connection')(server);
    require('./routes/snippet')(server);

    return server;
}
