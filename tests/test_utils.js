const fs = require('fs');
const multer = require('multer');
const path = require('path');
const Sequelize = require('sequelize');

/**
 * Prepare the uploads folder and database for a World at a given filepath,
 * and connect a World Scribe server instance to that World.
 * 
 * If one or more of the folders in that filepath don't exist, they will be created.
 * 
 * @param args.worldFolderPath The full filepath to where the World will be located
 * @param args.skipMigrations If true, migrations will not be applied to the World's database during creation
 * @returns results.repository A Repository instance connected to the given World's database
 * @returns results.server A World Scribe server instance connected to the given World's folder
 * @returns results.sequelize A Sequelize instance connected to the given World's database
 */
const prepareTestWorld = async function({ worldFolderPath, skipMigrations=true }) {
    if (!fs.existsSync(worldFolderPath)) {
        fs.mkdirSync(worldFolderPath, { recursive: true });
    }

    const repository = await require('../database/repository')({
        worldFolderPath,
        skipMigrations,
    });
    repository.setDatabaseVersionToLatest();

    fs.mkdirSync(path.join(worldFolderPath, 'uploads'));

    const server = require('../server')();
    server.locals.repository = repository;
    server.locals.currentWorldFolderPath = worldFolderPath;
    server.locals.upload = multer({
        dest: path.join(worldFolderPath, 'uploads'),
        limits: {
            fileSize: 2 * 1000 * 1000,
        },
    });

    const sequelize = new Sequelize('database', 'username', 'password', {
        host: 'localhost',
        dialect: 'sqlite',
        operatorsAliases: false,
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        storage: path.join(worldFolderPath, 'database.sqlite'),
    });

    return { repository, server, sequelize };
}

module.exports = {
    prepareTestWorld,
};
