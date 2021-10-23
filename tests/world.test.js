const expect = require('expect.js');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');
const Sequelize = require('sequelize');

const WORLDS_FOLDER_PATH = path.join(__dirname, 'TESTWORLDS_world');

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
        const EXISTING_WORLD_NAME = 'Existing World';
        const EXISTING_WORLD_PATH = path.join(WORLDS_FOLDER_PATH, EXISTING_WORLD_NAME);

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
});
