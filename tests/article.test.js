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

    describe('GET /api/articles', () => {
        describe('with no Articles', () => {
            it('returns an empty list when there are no Articles', async () => {
                const response = await supertest(server)
                    .get('/api/articles?page=1&size=5')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(0);
            });
        });

        describe('with 10 Categories', () => {
            beforeEach(async () => {
                await sequelize.query(`
                    INSERT INTO
                        articles(name, image, categoryId, createdAt, updatedAt)
                    VALUES
                        ('Article A', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article B', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article C', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article F', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article E', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article J', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article G', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article H', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article I', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article D', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
                `);
            });

            it('returns first Article when page=1 and size=1', async () => {
                const response = await supertest(server)
                    .get('/api/articles?page=1&size=1')
                    .expect(200);

                expect(response.body.hasMore).to.be(true);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(1);
                expect(response.body.articles[0]).to.eql({
                    id: 1,
                    name: 'Article A',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
            });

            it('returns Articles 4-6 sorted by ascending name when page=2 and size=3', async () => {
                const response = await supertest(server)
                    .get('/api/articles?page=2&size=3')
                    .expect(200);

                expect(response.body.hasMore).to.be(true);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(3);
                expect(response.body.articles[0]).to.eql({
                    id: 10,
                    name: 'Article D',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
                expect(response.body.articles[1]).to.eql({
                    id: 5,
                    name: 'Article E',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
                expect(response.body.articles[2]).to.eql({
                    id: 4,
                    name: 'Article F',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
            });

            it('returns less Articles than specified by size, when the last page is requested and it has less than size items', async () => {
                const response = await supertest(server)
                    .get('/api/articles?page=4&size=3')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(1);
                expect(response.body.articles[0]).to.eql({
                    id: 6,
                    name: 'Article J',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
            })

            it('returns an empty list when page and size go beyond the range of Articles', async () => {
                const response = await supertest(server)
                    .get('/api/articles?page=3&size=5')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(0);
            })
        });
    });

    describe('GET /api/articles/:articleId/metadata', () => {
        it('returns Article metadata for an existing Article', async () => {
            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Article with Metadata', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            const response = await supertest(server)
                .get('/api/articles/1/metadata')
                .expect(200);

            expect(response.body).to.eql({
                id: 1,
                name: 'Article with Metadata',
                categoryId: 1,
                categoryName: 'Default Category',
                createdAt: '2000-01-01T00:00:00.000Z',
                updatedAt: '2000-01-01T00:00:00.000Z',
            });
        });
    });

    describe('GET /api/articles/:articleId/image', () => {
        it('returns 200 with image Content-Type when Article has an image', async () => {
            const existingImagePath = path.join(TEST_WORLD_PATH, 'uploads', 'existingimage');
            fs.copyFileSync(path.join(__dirname, 'test_image.jpg'), existingImagePath);

            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Article with Image', '{"filename": "existingimage", "mimetype": "image/jpeg"}', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00')
            `);

            const response = await supertest(server)
                .get('/api/articles/1/image')
                .expect(200);

            console.log(response.headers);

            expect(response.headers['content-type']).to.be('image/jpeg');
        });

        it('returns 404 when Article does not have an image', async () => {
            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Article with No Image', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00')
            `);

            const response = await supertest(server)
                .get('/api/articles/1/image')
                .expect(404);

            expect(response.text).to.be('Image does not exist for Article \'1\'');
        });
    });

    describe('GET /api/categories/:categoryId/articles', () => {
        describe('with no Articles in the Category', () => {
            it('returns an empty list when there are no Articles', async () => {
                await sequelize.query(`
                    INSERT INTO
                        categories(name, description, image, icon, createdAt, updatedAt)
                    VALUES
                        ('Other Category', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
                `);

                await sequelize.query(`
                    INSERT INTO
                        articles(name, image, categoryId, createdAt, updatedAt)
                    VALUES
                        ('Other Article A', null, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Other Article B', null, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Other Article C', null, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
                `);

                const response = await supertest(server)
                    .get('/api/categories/1/articles?page=1&size=5')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(0);
            });
        });

        describe('with 10 Articles in the Category', () => {
            beforeEach(async () => {
                await sequelize.query(`
                    INSERT INTO
                        categories(name, description, image, icon, createdAt, updatedAt)
                    VALUES
                        ('Other Category', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
                `);

                await sequelize.query(`
                    INSERT INTO
                        articles(name, image, categoryId, createdAt, updatedAt)
                    VALUES
                        ('Article A', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article B', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article C', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article F', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article E', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article J', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article G', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article H', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article I', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Article D', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Other Article A', null, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Other Article B', null, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Other Article C', null, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
                `);
            });

            it('returns first Article when page=1 and size=1', async () => {
                const response = await supertest(server)
                    .get('/api/categories/1/articles?page=1&size=1')
                    .expect(200);

                expect(response.body.hasMore).to.be(true);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(1);
                expect(response.body.articles[0]).to.eql({
                    id: 1,
                    name: 'Article A',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01 00:00:00.000 +00:00',
                    updatedAt: '2000-01-01 00:00:00.000 +00:00',
                });
            });

            it('returns Articles 4-6 sorted by ascending name when page=2 and size=3', async () => {
                const response = await supertest(server)
                    .get('/api/categories/1/articles?page=2&size=3')
                    .expect(200);

                expect(response.body.hasMore).to.be(true);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(3);
                expect(response.body.articles[0]).to.eql({
                    id: 10,
                    name: 'Article D',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01 00:00:00.000 +00:00',
                    updatedAt: '2000-01-01 00:00:00.000 +00:00',
                });
                expect(response.body.articles[1]).to.eql({
                    id: 5,
                    name: 'Article E',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01 00:00:00.000 +00:00',
                    updatedAt: '2000-01-01 00:00:00.000 +00:00',
                });
                expect(response.body.articles[2]).to.eql({
                    id: 4,
                    name: 'Article F',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01 00:00:00.000 +00:00',
                    updatedAt: '2000-01-01 00:00:00.000 +00:00',
                });
            });

            it('returns less Articles than specified by size, when the last page is requested and it has less than size items', async () => {
                const response = await supertest(server)
                    .get('/api/categories/1/articles?page=4&size=3')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(1);
                expect(response.body.articles[0]).to.eql({
                    id: 6,
                    name: 'Article J',
                    image: null,
                    categoryId: 1,
                    createdAt: '2000-01-01 00:00:00.000 +00:00',
                    updatedAt: '2000-01-01 00:00:00.000 +00:00',
                });
            })

            it('returns an empty list when page and size go beyond the range of Articles', async () => {
                const response = await supertest(server)
                    .get('/api/categories/1/articles?page=3&size=5')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.articles).to.be.an(Array);
                expect(response.body.articles).to.have.length(0);
            })
        });
    });

    describe('PATCH /api/articles/:articleId/name', () => {
        it('updates Article name in the database', async () => {
            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Old Article Name', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            const response = await supertest(server)
                .patch('/api/articles/1/name')
                .send({
                    name: 'New Article Name',
                })
                .expect(200);

            expect(response.body.name).to.equal('New Article Name');
            expect(response.body.image).to.be(null);
            expect(response.body.categoryId).to.equal(1);
            expect(response.body.createdAt).to.equal('2000-01-01T00:00:00.000Z');
            expect(response.body.updatedAt).to.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z)?)$/);

            const nameQueryResult = await sequelize.query('SELECT name FROM articles WHERE id=1');
            expect(nameQueryResult).not.to.be(null);
            const actualName = nameQueryResult[0][0].name;
            expect(actualName).to.be('New Article Name');
        });
    });

    describe('DELETE /api/articles/:articleId', () => {
        it('deletes Article image along with Article database entry and related FieldValue, Connection, and Snippet entries', async () => {
            fs.copyFileSync(path.join(__dirname, 'test_image.jpg'), path.join(TEST_WORLD_PATH, 'uploads', 'article1image'));
            fs.copyFileSync(path.join(__dirname, 'test_image.jpg'), path.join(TEST_WORLD_PATH, 'uploads', 'article2image'));

            await sequelize.query(`
                INSERT INTO
                    articles(name, image, categoryId, createdAt, updatedAt)
                VALUES
                    ('Article to Delete', '{"filename": "article1image", "mimetype": "image/jpeg"}', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Other Article 1 - should not be deleted', '{"filename": "article2image", "mimetype": "image/jpeg"}', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Other Article 2 - should not be deleted', null, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            await sequelize.query(`
                INSERT INTO
                    fieldValues(value, fieldId, articleId, createdAt, updatedAt)
                VALUES
                    ('Article 1 - Field 1', 1, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Article 1 - Field 2', 2, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Article 1 - Field 3', 3, 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Article 2 - Field 1', 1, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Article 2 - Field 2', 2, 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            await sequelize.query(`
                INSERT INTO
                    connectionDescriptions(content, createdAt, updatedAt)
                VALUES
                    ('Connection Description to Delete', '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Other Connection Description - should not be deleted', '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            await sequelize.query(`
                INSERT INTO
                    connections(mainArticleId, otherArticleId, otherArticleRole, connectionDescriptionId, createdAt, updatedAt)
                VALUES
                    (1, 2, 'Was connected to the Article being deleted', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    (2, 1, 'Soon-to-be-nonexistent Connection', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    (2, 3, 'Unaffected Connection 1', 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    (3, 2, 'Unaffected Connection 2', 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            await sequelize.query(`
                INSERT INTO
                    snippets(name, content, articleId, createdAt, updatedAt)
                VALUES
                    ('Snippet to Delete', 'This should be deleted', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Snippet to Delete 2', 'This should also be deleted', 1, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                    ('Other Snippet - should not be deleted', 'This should NOT be deleted', 2, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
            `);

            const response = await supertest(server)
                .delete('/api/articles/1');

            expect(response.body.name).to.equal('Article to Delete');
            expect(response.body.image).to.be('{"filename": "article1image", "mimetype": "image/jpeg"}');
            expect(response.body.categoryId).to.equal(1);
            expect(response.body.createdAt).to.equal('2000-01-01 00:00:00.000 +00:00');
            expect(response.body.updatedAt).to.equal('2000-01-01 00:00:00.000 +00:00');

            const articlesQueryResult = await sequelize.query(`
                SELECT
                    id, name
                FROM
                    articles
            `);
            expect(articlesQueryResult).not.to.be(null);
            expect(articlesQueryResult[0]).have.length(2);
            expect(articlesQueryResult[0][0].id).to.be(2);
            expect(articlesQueryResult[0][0].name).to.be('Other Article 1 - should not be deleted');
            expect(articlesQueryResult[0][1].id).to.be(3);
            expect(articlesQueryResult[0][1].name).to.be('Other Article 2 - should not be deleted');

            const fieldValuesQueryResult = await sequelize.query(`
                SELECT
                    id, value
                FROM
                    fieldValues
            `);
            expect(fieldValuesQueryResult).not.to.be(null);
            expect(fieldValuesQueryResult[0]).have.length(2);
            expect(fieldValuesQueryResult[0][0].id).to.be(4);
            expect(fieldValuesQueryResult[0][0].value).to.be('Article 2 - Field 1');
            expect(fieldValuesQueryResult[0][1].id).to.be(5);
            expect(fieldValuesQueryResult[0][1].value).to.be('Article 2 - Field 2');

            const connectionDescriptionsQueryResult = await sequelize.query(`
                SELECT
                    id, content
                FROM
                    connectionDescriptions
            `);
            expect(connectionDescriptionsQueryResult[0]).not.to.be(null);
            expect(connectionDescriptionsQueryResult[0]).to.have.length(1);
            expect(connectionDescriptionsQueryResult[0][0].id).to.be(2);
            expect(connectionDescriptionsQueryResult[0][0].content).to.be('Other Connection Description - should not be deleted');

            const connectionsQueryResult = await sequelize.query(`
                SELECT
                    id, mainArticleId, otherArticleId, otherArticleRole
                FROM
                    connections
            `);
            expect(connectionsQueryResult[0]).not.to.be(null);
            expect(connectionsQueryResult[0]).to.have.length(2);
            expect(connectionsQueryResult[0][0].id).to.be(3);
            expect(connectionsQueryResult[0][0].mainArticleId).to.be(2);
            expect(connectionsQueryResult[0][0].otherArticleId).to.be(3);
            expect(connectionsQueryResult[0][0].otherArticleRole).to.be('Unaffected Connection 1');
            expect(connectionsQueryResult[0][1].id).to.be(4);
            expect(connectionsQueryResult[0][1].mainArticleId).to.be(3);
            expect(connectionsQueryResult[0][1].otherArticleId).to.be(2);
            expect(connectionsQueryResult[0][1].otherArticleRole).to.be('Unaffected Connection 2');

            const snippetsQueryResult = await sequelize.query(`
                SELECT
                    id, name, content
                FROM
                    snippets
            `);
            expect(snippetsQueryResult[0]).not.to.be(null);
            expect(snippetsQueryResult[0]).to.have.length(1);
            expect(snippetsQueryResult[0][0].id).to.be(3);
            expect(snippetsQueryResult[0][0].name).to.be('Other Snippet - should not be deleted');
            expect(snippetsQueryResult[0][0].content).to.be('This should NOT be deleted');

            expect(fs.existsSync(path.join(TEST_WORLD_PATH, 'uploads', 'article1image'))).to.be(false);
            expect(fs.existsSync(path.join(TEST_WORLD_PATH, 'uploads', 'article2image'))).to.be(true);
        });
    });
});
