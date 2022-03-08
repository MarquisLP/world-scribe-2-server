const expect = require('expect.js');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const { prepareTestWorld } = require('./test_utils');

const TEST_WORLDS_FOLDER_PATH = path.join(__dirname, 'TESTWORLDS_article');
const TEST_WORLD_PATH = path.join(TEST_WORLDS_FOLDER_PATH, 'Article Test World');

describe('articles', () => {
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

        await sequelize.query(`
                INSERT INTO
                    categories(name, description, image, icon, createdAt, updatedAt)
                VALUES
                    ('Default Category', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00')
        `);
        await sequelize.query(`
                INSERT INTO
                    fields(name, categoryId, createdAt, updatedAt)
                VALUES
                    ('Field 1', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Field 2', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Field 3', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
        `);
    });

    describe('POST /api/articles', () => {
        it('returns 200 and Article object, and creates new Article entry in database along with FieldValue entries for each Field in the Article\'s Category', async () => {
            const response = await supertest(server)
                .post('/api/articles/')
                .send({
                    name: 'New Article',
                    categoryId: 1,
                })
                .expect(200);

            expect(response.body.name).to.equal('New Article');
            expect(response.body.image).to.be(undefined);
            expect(response.body.categoryId).to.equal(1);
            expect(response.body.createdAt).to.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z)?)$/);
            expect(response.body.updatedAt).to.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z)?)$/);

            const numOfNewArticlesInDatabase = await sequelize.query('SELECT COUNT(*) FROM articles WHERE name="New Article"')
            expect(numOfNewArticlesInDatabase[0][0]['COUNT(*)']).to.equal(1);
            const articleFieldValuesInDatabase = await sequelize.query(`
                SELECT
                    fieldId, value
                FROM
                    fieldValues
                WHERE
                    articleId=1
                ORDER BY
                    fieldId
            `)
            expect(articleFieldValuesInDatabase[0]).to.have.length(3);
            expect(articleFieldValuesInDatabase[0][0]['fieldId']).to.equal(1);
            expect(articleFieldValuesInDatabase[0][0]['value']).to.equal('');
            expect(articleFieldValuesInDatabase[0][1]['fieldId']).to.equal(2);
            expect(articleFieldValuesInDatabase[0][1]['value']).to.equal('');
            expect(articleFieldValuesInDatabase[0][2]['fieldId']).to.equal(3);
            expect(articleFieldValuesInDatabase[0][2]['value']).to.equal('');
        });
    });

    describe('PUT /api/articles/:articleId/image', () => {
        it('succeeds and saves image to World\'s uploads folder', async () => {
            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Article - No Initial Image', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            const response = await supertest(server)
                .put('/api/articles/1/image')
                .attach('picture', path.join(__dirname, 'test_image.jpg'))
                .expect(200);

            expect(response.text).to.equal('image has been uploaded for article: 1')

            const imageQueryResult = await sequelize.query('SELECT image FROM articles WHERE id=1;');
            expect(imageQueryResult).not.to.be(null);
            const imageData = JSON.parse(imageQueryResult[0][0].image);
            const uploadedImageFilename = imageData.filename;

            const uploadedImagePath = path.join(TEST_WORLD_PATH, 'uploads', uploadedImageFilename);
            expect(fs.existsSync(uploadedImagePath)).to.be(true);
        });

        it('succeeds, deletes existing image, and saves image to World\'s uploads folder', async () => {
            const existingImagePath = path.join(TEST_WORLD_PATH, 'uploads', 'existingimage');
            fs.copyFileSync(path.join(__dirname, 'test_image.jpg'), existingImagePath);

            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Article - Has Initial Image', '{"filename": "existingimage", "mimetype": "image/jpeg"}', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            const response = await supertest(server)
                .put('/api/articles/1/image')
                .attach('picture', path.join(__dirname, 'test_image.jpg'))
                .expect(200);

            expect(response.text).to.equal('image has been uploaded for article: 1')

            const imageQueryResult = await sequelize.query('SELECT image FROM articles WHERE id=1;');
            expect(imageQueryResult).not.to.be(null);
            const imageData = JSON.parse(imageQueryResult[0][0].image);
            const uploadedImageFilename = imageData.filename;
            expect(uploadedImageFilename).not.to.equal('existingimage');

            const uploadedImagePath = path.join(TEST_WORLD_PATH, 'uploads', uploadedImageFilename);
            expect(fs.existsSync(uploadedImagePath)).to.be(true);
            expect(fs.existsSync(existingImagePath)).to.be(false);
        });
    });
});
