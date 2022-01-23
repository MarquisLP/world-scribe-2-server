const expect = require('expect.js');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const { prepareTestWorld } = require('./test_utils');

const TEST_WORLDS_FOLDER_PATH = path.join(__dirname, 'TESTWORLDS_category');
const TEST_WORLD_PATH = path.join(TEST_WORLDS_FOLDER_PATH, 'Category Test World');

describe('categories', () => {
    let repository;
    let server;
    let sequelize;

    beforeEach(async () => {
        if (repository) {
            await repository.disconnectFromDatabase();
        }
        if (sequelize) {
            await sequelize.close();
        }
        if (fs.existsSync(TEST_WORLDS_FOLDER_PATH)) {
            fs.rmSync(TEST_WORLDS_FOLDER_PATH, { recursive: true });
        }
        ({ repository, server, sequelize } = await prepareTestWorld({ worldFolderPath: TEST_WORLD_PATH }));
    });

    describe('POST /api/categories/', () => {
        it('returns 200 and Category object, and creates new Category entry in database', async () => {
            const response = await supertest(server)
                .post('/api/categories/')
                .send({
                    name: 'New Category',
                })
                .expect(200);

            expect(response.body.name).to.equal('New Category');
            expect(response.body.description).to.be('');
            expect(response.body.image).to.be(undefined);
            expect(response.body.icon).to.be(undefined);
            expect(response.body.createdAt).to.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z)?)$/);
            expect(response.body.updatedAt).to.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z)?)$/);

            const numOfNewCategoriesInDatabase = await sequelize.query('SELECT COUNT(*) FROM categories WHERE name="New Category"')
            expect(numOfNewCategoriesInDatabase[0][0]['COUNT(*)']).to.equal(1);
        });

        it('returns 409 when another Category with the same name already exists in the same World', async () => {
            await sequelize.query(`
                INSERT INTO
                    categories(name, description, image, icon, createdAt, updatedAt)
                VALUES
                    ('Existing Category', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00')
            `);

            const response = await supertest(server)
                .post('/api/categories/')
                .send({
                    name: 'Existing Category',
                })
                .expect(409);

            expect(response.text).to.equal('The current World already has a Category named \'Existing Category\'');

            const numOfExistingCategoriesInDatabase = await sequelize.query('SELECT COUNT(*) FROM categories WHERE name="Existing Category"')
            expect(numOfExistingCategoriesInDatabase[0][0]['COUNT(*)']).to.equal(1);
        });
    });
});
