const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = function(app) {
    app.post('/api/worldAccesses', function (req, res, next) {
        const worldFolderPath = req.body.worldFolderPath;

        if (!worldFolderPath || (worldFolderPath === '')) {
            app.locals.upload = null;
            app.locals.currentWorldFolderPath = null;

            if (app.locals.repository) {
                app.locals.repository.disconnectFromDatabase()
                .then(function() {
                    app.locals.repository = null;
                    app.locals.currentWorldFolderPath = null;
                    return res.status(200).json({message: "Disconnected from World successfully"});
                })
                .catch(function(error) {
                    console.log(error);
                    return res.status(500).end("Failed to disconnect from World");
                });
            }
            else {
                return res.status(200).json({message: "Disconnected from World successfully"});
            }
        } else {
            if (!fs.existsSync(worldFolderPath)) {
                return res.status(404).end('World at "' + worldFolderPath + '" not found');
            }

            app.locals.upload = multer({
                dest: path.join(worldFolderPath, 'uploads'),
                limits: {
                    fileSize: 2 * 1000 * 1000,
                },
            });

            require('../database/repository')({worldFolderPath})
            .then(function(result) {
                app.locals.repository = result;
                app.locals.currentWorldFolderPath = worldFolderPath;
                return res.status(200).json({message: "Connected to World successfully"});
            })
            .catch(function(error) {
                console.log('Error during database setup:')
                console.log(error);
                return res.status(500).end("Failed to connect to World");
            });
        }
    })

    const reservedFileSystemCharacters = Object.freeze(['/', '\\', '.', '<', '>', ':', '"', '|', '?', '*']);

    // CURL -b cookie.txt -X POST -H "Content-Type: application/json" -d '{"newWorldName":"name", "worldsFolderPath":"/home/user/WorldScribe/Worlds"}' http://localhost:8080/api/worlds/
    app.post('/api/worlds/', function (req, res, next) {
        const worldsFolderPath = req.body.worldsFolderPath;
        const newWorldName = req.body.newWorldName;

        if (!newWorldName) {
            return res.status(400).end('World name cannot be empty');
        }

        if (newWorldName[newWorldName.length - 1] === ' ') {
            return res.status(400).end('World name cannot end on a space');
        }

        if (reservedFileSystemCharacters.some((character) => newWorldName.includes(character))) {
            return res.status(400).end('World name contains forbidden characters');
        }

        const newWorldFolderPath = path.join(worldsFolderPath, newWorldName);
        if (fs.existsSync(newWorldFolderPath)) {
            return res.status(409).end('A World already exists with the name ' + newWorldName);
        }

        fs.mkdirSync(newWorldFolderPath, {recursive: true});

        const worldUploadsFolderPath = path.join(newWorldFolderPath, 'uploads');
        fs.mkdirSync(worldUploadsFolderPath, {recursive: true});

        require('../database/repository')({worldFolderPath: newWorldFolderPath, skipMigrations: true})
        .then(function(repository) {
            repository.Category.insertDefaultCategories()
            .then(function() {
                repository.setDatabaseVersionToLatest()
                .then(function() {
                    return res.status(200).json({message: "Created World and default Categories successfully"});
                })
                .catch(function(error) {
                    console.log(error);
                    return res.status(500).end("Failed to set new database's version to latest");
                });
            })
            .catch(function(error) {
                console.log(error);
                return res.status(500).end("Failed to insert default Categories into World");
            });
        })
        .catch(function(error) {
            console.log(error);
            return res.status(500).end("Failed to connect to newly-created World");
        });
    });

    // CURL -b cookie.txt http://localhost:8080/api/worlds?page=1&size=10&path=/home/user/WorldScribe/Worlds
    app.get('/api/worlds/', function (req, res, next) {
        const worldsFolderPath = decodeURI(req.query.path);
        let offset = (parseInt(req.query.page) - 1) * parseInt(req.query.size);
        let limit = parseInt(req.query.size);
        if (isNaN(offset)) {offset = 0}
        if (isNaN(limit)) {limit = 10}

        const worldFolders = fs.readdirSync(worldsFolderPath).filter(function (filename) {
            return fs.statSync(worldsFolderPath + '/' + filename).isDirectory();
        });
        const worldsToReturn = worldFolders.slice(offset, offset + limit);

        const hasMore = offset + limit + 1 < worldFolders.length - 1;

        return res.status(200).json({
            hasMore,
            worlds: worldsToReturn,
        });
    });

    app.get('/api/worlds/current/name', function(req, res, next) {
        if (app.locals.currentWorldFolderPath && app.locals.currentWorldFolderPath.length > 0) {
            const currentWorldName = app.locals.currentWorldFolderPath.split('/').pop(0);
            return res.json({
                name: currentWorldName
            });
        }
        return res.status(400).json({message: "Server is not connected to a World. Please configure the World connection using the POST /api/worldAccesses endpoint."});
    });
}
