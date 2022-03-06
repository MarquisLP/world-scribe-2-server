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

    describe('PUT /api/categories/:categoryId/image', () => {
        it('succeeds and saves image to World\'s uploads folder', async () => {
            await sequelize.query(`
                INSERT INTO
                    categories(name, description, image, icon, createdAt, updatedAt)
                VALUES
                    ('Category - No Initial Image', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00')
            `);

            const response = await supertest(server)
                .put('/api/categories/1/image')
                .attach('picture', path.join(__dirname, 'test_image.jpg'))
                .expect(200);

            expect(response.text).to.equal('image has been uploaded for category: 1')

            const imageQueryResult = await sequelize.query('SELECT image FROM categories WHERE id=1');
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
                    categories(name, description, image, icon, createdAt, updatedAt)
                VALUES
                    ('Category - No Initial Image', null, '{"filename": "existingimage"}', null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00')
            `);

            const response = await supertest(server)
                .put('/api/categories/1/image')
                .attach('picture', path.join(__dirname, 'test_image.jpg'))
                .expect(200);

            expect(response.text).to.equal('image has been uploaded for category: 1')

            const imageQueryResult = await sequelize.query('SELECT image FROM categories WHERE id=1');
            expect(imageQueryResult).not.to.be(null);
            const imageData = JSON.parse(imageQueryResult[0][0].image);
            const uploadedImageFilename = imageData.filename;
            expect(uploadedImageFilename).not.to.equal('existingimage');

            const uploadedImagePath = path.join(TEST_WORLD_PATH, 'uploads', uploadedImageFilename);
            expect(fs.existsSync(uploadedImagePath)).to.be(true);
            expect(fs.existsSync(existingImagePath)).to.be(false);
        });
    })

    describe('GET /api/categories', () => {
        describe('with no Categories', () => {
            it('returns an empty list when there are no Categories', async () => {
                const response = await supertest(server)
                    .get('/api/categories?page=1&size=5')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.categories).to.be.an(Array);
                expect(response.body.categories).to.have.length(0);
            });
        });

        describe('with 10 Categories', () => {
            beforeEach(async () => {
                await sequelize.query(`
                    INSERT INTO
                        categories(name, description, image, icon, createdAt, updatedAt)
                    VALUES
                        ('Category A', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category B', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category C', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category F', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category E', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category J', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category G', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category H', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category I', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00'),
                        ('Category D', null, null, null, '2000-01-01 00:00:00.000 +00:00', '2000-01-01 00:00:00.000 +00:00');
                `);
            });

            it('returns first Category when page=1 and size=1', async () => {
                const response = await supertest(server)
                    .get('/api/categories?page=1&size=1')
                    .expect(200);

                expect(response.body.hasMore).to.be(true);
                expect(response.body.categories).to.be.an(Array);
                expect(response.body.categories).to.have.length(1);
                expect(response.body.categories[0]).to.eql({
                    id: 1,
                    name: 'Category A',
                    description: null,
                    image: null,
                    icon: null,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
            });

            it('returns Categories 4-6 sorted by ascending name when page=2 and size=3', async () => {
                const response = await supertest(server)
                    .get('/api/categories?page=2&size=3')
                    .expect(200);

                expect(response.body.hasMore).to.be(true);
                expect(response.body.categories).to.be.an(Array);
                expect(response.body.categories).to.have.length(3);
                expect(response.body.categories[0]).to.eql({
                    id: 10,
                    name: 'Category D',
                    description: null,
                    image: null,
                    icon: null,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
                expect(response.body.categories[1]).to.eql({
                    id: 5,
                    name: 'Category E',
                    description: null,
                    image: null,
                    icon: null,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
                expect(response.body.categories[2]).to.eql({
                    id: 4,
                    name: 'Category F',
                    description: null,
                    image: null,
                    icon: null,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
            });

            it('returns less Categories than specified by size, when the last page is requested and it has less than size items', async () => {
                const response = await supertest(server)
                    .get('/api/categories?page=4&size=3')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.categories).to.be.an(Array);
                expect(response.body.categories).to.have.length(1);
                expect(response.body.categories[0]).to.eql({
                    id: 6,
                    name: 'Category J',
                    description: null,
                    image: null,
                    icon: null,
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                });
            })

            it('returns an empty list when page and size go beyond the range of Categories', async () => {
                const response = await supertest(server)
                    .get('/api/categories?page=3&size=5')
                    .expect(200);

                expect(response.body.hasMore).to.be(false);
                expect(response.body.categories).to.be.an(Array);
                expect(response.body.categories).to.have.length(0);
            })
        });
    });
});
