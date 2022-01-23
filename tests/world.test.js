const expect = require('expect.js');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const supertest = require('supertest');
const Sequelize = require('sequelize');

const WORLDS_FOLDER_PATH = path.join(__dirname, 'TESTWORLDS_world');
const EXISTING_WORLD_NAME = 'Existing World';
const EXISTING_WORLD_PATH = path.join(WORLDS_FOLDER_PATH, EXISTING_WORLD_NAME);

describe('worlds', () => {
    let sequelize;

    before(() => {
        if (fs.existsSync(WORLDS_FOLDER_PATH)) {
            fs.rmSync(WORLDS_FOLDER_PATH, { recursive: true });
        }
        fs.mkdirSync(WORLDS_FOLDER_PATH, { recursive: true });
    })

    afterEach(async () => {
        if (sequelize) {
            sequelize.close();
            sequelize = undefined;
        }
    });

    describe('POST /api/worlds', () => {
        before(() => {
            fs.mkdirSync(EXISTING_WORLD_PATH, { recursive: true });
        });

        after(() => {
            fs.rmSync(EXISTING_WORLD_PATH, { recursive: true });
        });

        it('returns 400 when newWorldName is empty', async () => {
            const server = require('../server')();

            const response = await supertest(server)
                .post('/api/worlds/')
                .send({
                    newWorldName: '',
                })
                .expect(400);
            expect(response.text).to.equal('World name cannot be empty');
        });

        it('returns 400 when newWorldName ends on a space', async () => {
            const server = require('../server')();
            const response = await supertest(server)
                .post('/api/worlds/')
                .send({
                    newWorldName: 'World Name Ending on Space ',
                })
                .expect(400);
            expect(response.text).to.equal('World name cannot end on a space');
        });

        describe('returns 400 when newWorldName contains forbidden characters:', () => {
            ['/', '\\', '.', '<', '>', ':', '"', '|', '?', '*'].forEach(forbiddenCharacter => {
                it(forbiddenCharacter, async () => {
                    const server = require('../server')();
                    const response = await supertest(server)
                        .post('/api/worlds/')
                        .send({
                            newWorldName: `World With Forbidden Character ${forbiddenCharacter}`,
                        })
                        .expect(400);
                    expect(response.text).to.equal('World name contains forbidden characters');
                })
            });
        })

        it('returns 409 when new world\'s path conflicts with existing world folder', async () => {
            const server = require('../server')();
            const response = await supertest(server)
                .post('/api/worlds/')
                .send({
                    worldsFolderPath: WORLDS_FOLDER_PATH,
                    newWorldName: EXISTING_WORLD_NAME,
                })
                .expect(409);
            expect(response.text).to.equal(`A World already exists with the name ${EXISTING_WORLD_NAME}`);
        });

        it('returns 200 and creates new world with default Categories', async () => {
            const server = require('../server')();
            const response = await supertest(server)
                .post('/api/worlds/')
                .send({
                    worldsFolderPath: WORLDS_FOLDER_PATH,
                    newWorldName: 'New World',
                })
                .expect(200);
            expect(response.body.message).to.equal('Created World and default Categories successfully');

            const createdWorldDatabasePath = path.join(WORLDS_FOLDER_PATH, 'New World', 'database.sqlite');
            expect(fs.existsSync(createdWorldDatabasePath)).to.be(true);

            sequelize = new Sequelize('database', 'username', 'password', {
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
                storage: createdWorldDatabasePath,
            });

            const categories = await sequelize.query('SELECT name FROM categories ORDER BY name;', { type: sequelize.QueryTypes.SELECT })
            expect(categories).to.have.length(5);
            expect(categories[0].name).to.equal('Concept');
            expect(categories[1].name).to.equal('Group');
            expect(categories[2].name).to.equal('Item');
            expect(categories[3].name).to.equal('Person');
            expect(categories[4].name).to.equal('Place');

            const fields = await sequelize.query(`
            SELECT
                fields.name AS fieldName,
                categories.name AS categoryName
            FROM fields
                INNER JOIN categories ON categories.id = fields.categoryId
            ORDER BY
                categories.name,
                fields.name
            ;`, { type: sequelize.QueryTypes.SELECT });
            expect(fields).to.have.length(11);
            expect(fields[0]).to.eql({ categoryName: 'Concept', fieldName: 'Description' });
            expect(fields[1]).to.eql({ categoryName: 'Group', fieldName: 'History' });
            expect(fields[2]).to.eql({ categoryName: 'Group', fieldName: 'Mandate / Description' });
            expect(fields[3]).to.eql({ categoryName: 'Item', fieldName: 'History' });
            expect(fields[4]).to.eql({ categoryName: 'Item', fieldName: 'Properties / Description' });
            expect(fields[5]).to.eql({ categoryName: 'Person', fieldName: 'Age' });
            expect(fields[6]).to.eql({ categoryName: 'Person', fieldName: 'Gender' });
            expect(fields[7]).to.eql({ categoryName: 'Person', fieldName: 'Nicknames / Aliases' });
            expect(fields[8]).to.eql({ categoryName: 'Person', fieldName: 'Short Bio' });
            expect(fields[9]).to.eql({ categoryName: 'Place', fieldName: 'Description' });
            expect(fields[10]).to.eql({ categoryName: 'Place', fieldName: 'History' });
        });
    });

    describe('POST /api/worldAccesses', () => {
        beforeEach(async () => {
            fs.rmdirSync(EXISTING_WORLD_PATH, { recursive: true });
            fs.mkdirSync(EXISTING_WORLD_PATH, { recursive: true });
        });

        it('returns 404 if worldFolderPath refers to nonexistent folder', async () => {
            const server = require('../server')();

            const worldFolderPath = path.join(__dirname, 'Worlds', 'Nonexistent World');
            const response = await supertest(server)
                .post('/api/worldAccesses')
                .send({
                    worldFolderPath,
                })
                .expect(404);
            expect(response.text).to.equal(`World at "${worldFolderPath}" not found`);
            expect(server.locals.upload).to.be(null);
            expect(server.locals.currentWorldFolderPath).to.be(null);
            expect(server.locals.repository).to.be(null);
        });

        [
            {},
            { worldFolderPath: '' },
        ].forEach(requestBody => {
            describe(`request body: ${JSON.stringify(requestBody)}`, () => {
                it('returns 200, disconnects multer, and closes database when disconnecting from World', async () => {
                    const server = require('../server')();

                    const repository = await require('../database/repository')({
                        worldFolderPath: EXISTING_WORLD_PATH,
                        skipMigrations: true,
                    });
                    await repository.Category.insertDefaultCategories();
                    repository.setDatabaseVersionToLatest();
                    fs.mkdirSync(path.join(EXISTING_WORLD_PATH, 'uploads'));

                    server.locals.repository = repository;
                    server.locals.currentWorldFolderPath = EXISTING_WORLD_PATH;
                    server.locals.upload = multer({
                        dest: path.join(EXISTING_WORLD_PATH, 'uploads'),
                        limits: {
                            fileSize: 2 * 1000 * 1000,
                        },
                    });

                    const response = await supertest(server)
                        .post('/api/worldAccesses')
                        .send(requestBody)
                        .expect(200);
                    expect(response.body.message).to.equal('Disconnected from World successfully');
                    expect(server.locals.upload).to.be(null);
                    expect(server.locals.currentWorldFolderPath).to.be(null);
                    expect(server.locals.repository).to.be(null);
                });

                it('returns 200 and disconnects multer when disconnecting from World while database is NOT open using request body', async () => {
                    const server = require('../server')();

                    server.locals.repository = null;
                    server.locals.currentWorldFolderPath = EXISTING_WORLD_PATH;
                    server.locals.upload = multer({
                        dest: path.join(EXISTING_WORLD_PATH, 'uploads'),
                        limits: {
                            fileSize: 2 * 1000 * 1000,
                        },
                    });

                    const response = await supertest(server)
                        .post('/api/worldAccesses')
                        .send(requestBody)
                        .expect(200);
                    expect(response.body.message).to.equal('Disconnected from World successfully');
                    expect(server.locals.upload).to.be(null);
                    expect(server.locals.currentWorldFolderPath).to.be(null);
                    expect(server.locals.repository).to.be(null);
                });
            });
        });

        it('initializes multer, saves worldFolderPath, opens repository to World database, and returns 200 on success', async () => {
            const server = require('../server')();

            const repository = await require('../database/repository')({
                worldFolderPath: EXISTING_WORLD_PATH,
                skipMigrations: true,
            });
            await repository.Category.insertDefaultCategories();
            repository.setDatabaseVersionToLatest();
            fs.mkdirSync(path.join(EXISTING_WORLD_PATH, 'uploads'));

            const response = await supertest(server)
                .post('/api/worldAccesses')
                .send({ worldFolderPath: EXISTING_WORLD_PATH })
                .expect(200);
            expect(response.body.message).to.equal('Connected to World successfully');
            expect(typeof server.locals.upload.single).to.equal('function');
            expect(server.locals.currentWorldFolderPath).to.equal(EXISTING_WORLD_PATH);
            expect(server.locals.repository).to.have.keys([
                'setDatabaseVersionToLatest',
                'disconnectFromDatabase',
                'Category',
                'Field',
                'Article',
                'FieldValue',
                'Connection',
                'ConnectionDescription',
                'Snippet',
            ]);
        });
    });

    describe('GET /api/worlds/', () => {
        const EMPTY_WORLDS_FOLDER_PATH = path.join(__dirname, 'TESTWORLDS_world_empty');
        const GET_WORLDS_FOLDER_PATH = path.join(__dirname, 'TESTWORLDS_world_get');

        let server;

        beforeEach(() => {
            if (fs.existsSync(EMPTY_WORLDS_FOLDER_PATH)) {
                fs.rmSync(EMPTY_WORLDS_FOLDER_PATH, { recursive: true });
            }
            fs.mkdirSync(EMPTY_WORLDS_FOLDER_PATH, { recursive: true });

            if (fs.existsSync(GET_WORLDS_FOLDER_PATH)) {
                fs.rmSync(GET_WORLDS_FOLDER_PATH, { recursive: true });
            }
            fs.mkdirSync(GET_WORLDS_FOLDER_PATH, { recursive: true });

            // Create World folders spanning the alphabet from A to T. (T instead of Z so that we have a nice round number of 20.)
            for (let i = 1; i < 21; i++) {
                const worldLetter = (i + 9).toString(36).toUpperCase();
                fs.mkdirSync(path.join(GET_WORLDS_FOLDER_PATH, `World ${worldLetter}`), { recursive: true });
            }

           server = require('../server')();
        });

        it('returns an empty list when there are no worlds in the Worlds folder', async () => {
            const response = await supertest(server)
                .get('/api/worlds/')
                .query({
                    path: EMPTY_WORLDS_FOLDER_PATH,
                })
                .expect(200);
            expect(response.body.hasMore).to.equal(false);
            expect(response.body.worlds).to.be.empty();
        });

        it('returns the first 10 worlds alphabetically when no pagination parameters are given', async () => {
            const response = await supertest(server)
                .get('/api/worlds/')
                .query({
                    path: GET_WORLDS_FOLDER_PATH,
                })
                .expect(200);
            expect(response.body.hasMore).to.equal(true);
            expect(response.body.worlds).to.have.length(10);
            expect(response.body.worlds[0]).to.equal('World A');
            expect(response.body.worlds[1]).to.equal('World B');
            expect(response.body.worlds[2]).to.equal('World C');
            expect(response.body.worlds[3]).to.equal('World D');
            expect(response.body.worlds[4]).to.equal('World E');
            expect(response.body.worlds[5]).to.equal('World F');
            expect(response.body.worlds[6]).to.equal('World G');
            expect(response.body.worlds[7]).to.equal('World H');
            expect(response.body.worlds[8]).to.equal('World I');
            expect(response.body.worlds[9]).to.equal('World J');
        });

        it('returns an alphabetically-sorted list of all existing worlds when their amount is less than the page size', async () => {
            const response = await supertest(server)
                .get('/api/worlds/')
                .query({
                    path: GET_WORLDS_FOLDER_PATH,
                    size: 50,
                })
                .expect(200);
            expect(response.body.hasMore).to.equal(false);
            expect(response.body.worlds).to.have.length(20);
            expect(response.body.worlds[0]).to.equal('World A');
            expect(response.body.worlds[1]).to.equal('World B');
            expect(response.body.worlds[2]).to.equal('World C');
            expect(response.body.worlds[3]).to.equal('World D');
            expect(response.body.worlds[4]).to.equal('World E');
            expect(response.body.worlds[5]).to.equal('World F');
            expect(response.body.worlds[6]).to.equal('World G');
            expect(response.body.worlds[7]).to.equal('World H');
            expect(response.body.worlds[8]).to.equal('World I');
            expect(response.body.worlds[9]).to.equal('World J');
            expect(response.body.worlds[10]).to.equal('World K');
            expect(response.body.worlds[11]).to.equal('World L');
            expect(response.body.worlds[12]).to.equal('World M');
            expect(response.body.worlds[13]).to.equal('World N');
            expect(response.body.worlds[14]).to.equal('World O');
            expect(response.body.worlds[15]).to.equal('World P');
            expect(response.body.worlds[16]).to.equal('World Q');
            expect(response.body.worlds[17]).to.equal('World R');
            expect(response.body.worlds[18]).to.equal('World S');
            expect(response.body.worlds[19]).to.equal('World T');
        });

        it('returns the appropriate list of worlds according to the given page number and page size', async () => {
            const response = await supertest(server)
                .get('/api/worlds/')
                .query({
                    path: GET_WORLDS_FOLDER_PATH,
                    page: 2,
                    size: 6,
                })
                .expect(200);
            expect(response.body.hasMore).to.equal(true);
            expect(response.body.worlds).to.have.length(6);
            expect(response.body.worlds[0]).to.equal('World G');
            expect(response.body.worlds[1]).to.equal('World H');
            expect(response.body.worlds[2]).to.equal('World I');
            expect(response.body.worlds[3]).to.equal('World J');
            expect(response.body.worlds[4]).to.equal('World K');
            expect(response.body.worlds[5]).to.equal('World L');
        });

        it('returns a response with "hasMore: false" when there are no further pages of worlds', async () => {
            const response = await supertest(server)
                .get('/api/worlds/')
                .query({
                    path: GET_WORLDS_FOLDER_PATH,
                    page: 5,
                    size: 4,
                })
                .expect(200);
            expect(response.body.hasMore).to.equal(false);
            expect(response.body.worlds).to.have.length(4);
            expect(response.body.worlds[0]).to.equal('World Q');
            expect(response.body.worlds[1]).to.equal('World R');
            expect(response.body.worlds[2]).to.equal('World S');
            expect(response.body.worlds[3]).to.equal('World T');
        });
    });

    describe('GET /api/worlds/current/name', () => {
        beforeEach(async () => {
            fs.rmdirSync(EXISTING_WORLD_PATH, { recursive: true });
            fs.mkdirSync(EXISTING_WORLD_PATH, { recursive: true });
        });

        it('returns 400 when server is not connected to a World', async () => {
            const server = require('../server')();

            const response = await supertest(server)
                .get('/api/worlds/current/name')
                .expect(400);
            expect(response.body.message).to.equal('Server is not connected to a World. Please configure the World connection using the POST /api/worldAccesses endpoint.');
        });

        it('returns 200 and World name when server is connected to a World', async () => {
            const server = require('../server')();

            const repository = await require('../database/repository')({
                worldFolderPath: EXISTING_WORLD_PATH,
                skipMigrations: true,
            });
            await repository.Category.insertDefaultCategories();
            repository.setDatabaseVersionToLatest();
            fs.mkdirSync(path.join(EXISTING_WORLD_PATH, 'uploads'));

            server.locals.repository = repository;
            server.locals.currentWorldFolderPath = EXISTING_WORLD_PATH;
            server.locals.upload = multer({
                dest: path.join(EXISTING_WORLD_PATH, 'uploads'),
                limits: {
                    fileSize: 2 * 1000 * 1000,
                },
            });

            const response = await supertest(server)
                .get('/api/worlds/current/name')
                .expect(200);
            expect(response.body.name).to.equal(EXISTING_WORLD_NAME);
        });
    });
});
