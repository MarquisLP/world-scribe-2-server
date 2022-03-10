module.exports = (Sequelize, sequelize, Models) => {
    const Article = Models["Article"];
    const Snippet = Models["Snippet"];
    const Connection = Models["Connection"];
    const ConnectionDescription = Models["ConnectionDescription"];
    const Field = Models["Field"];
    const FieldValue = Models["FieldValue"];
    const Op = Sequelize.Op;

    Article.createArticle = async function(name, categoryId) {
        let newArticle = await Article.create({
            name: name,
            categoryId: categoryId,
        });

        // Generate default values for the Article's Fields.
        let fields = await Field.findAll({
            where: { categoryId: categoryId }
        });
        await Promise.all(fields.map((field) => FieldValue.create({
            fieldId: field.id,
            articleId: newArticle.id,
            value: '',
        })));

        return newArticle;
    };

    Article.getArticleMetadata = async function(articleId) {
        let article = await Article.findOne({
            attributes: [ 'id', 'name', 'createdAt', 'updatedAt' ],
            where: { id: articleId },
            include: [
                { association: Article.Category, as: 'category', attributes: [ 'id', 'name' ] }
            ]
        });

        let returnedObject = {};
        returnedObject.id = article.id;
        returnedObject.name = article.name;
        returnedObject.createdAt = article.createdAt;
        returnedObject.updatedAt = article.updatedAt;
        returnedObject.categoryId = article.category.id;
        returnedObject.categoryName = article.category.name;

        return returnedObject;
    };

    Article.getArticlesInWorld = async function(offset, limit) {
        let articles = await Article.findAll({
            offset: offset,
            limit: limit,
            order: sequelize.col('name')
        });
        return articles;
        }

    Article.updateImage = async function(articleId, image) {
        let article = await Article.findOne({
            where: { id: articleId }
        });

        if (!article) {
            throw new Error(`Article '${articleId}' does not exist`);
        }

        await article.update({
            image: JSON.stringify(image),
        })
    };

    Article.getImage = async function(articleId) {
        let article = await Article.findOne({
            attributes: [ 'image' ],
            where: { id: articleId }
        });

        if (article.image) {
            return JSON.parse(article.image);
        }
        else {
            return null;
        }
    };

    Article.renameArticle = async function(articleId, name) {
        let article = await Article.findOne({
            where: { id: articleId }
        });
        if (!article) {
            throw new Error(`Article '${articleId}' does not exist`);
        }
        if (name && !(name === article.name)) {
            article.name = name;
            await article.save();
        }
        return article;
    }

    Article.deleteArticle = async function(articleId) {
        let deletedArticle = await Article.findOne({
            where: { id: articleId },
            raw: true
        });

        if (!deletedArticle) {
            throw {
            status: 404,
            message: `Article '${articleId}' does not exist in the current World`,
            error: new Error()
            };
        }

        try {
            await sequelize.transaction(t => {
            return Snippet.destroy({
                where: { articleId: articleId }
            }, { transaction: t }).then(numDeletedSnippets => {
                return FieldValue.destroy({
                where: { articleId: articleId }
                }, { transaction: t }).then((numDeletedFieldValues) => {
                return Connection.findAll({
                    attributes: ['connectionDescriptionId'],
                    where: { mainArticleId: articleId }
                }, { transaction: t }).then((connections) => {
                    let connectionDescriptionIds = connections.map((connection) => {
                    return connection.connectionDescriptionId
                    });
                    return ConnectionDescription.destroy({
                    where: {
                        id: {
                            [Op.in]: connectionDescriptionIds
                        }
                    },
                    }, { transaction: t }).then((numDeletedFieldValues) => {
                    return Connection.destroy({
                        where: {
                        [Op.or]: [
                        {
                        mainArticleId: articleId
                        },
                        {
                        otherArticleId: articleId
                        }
                    ]
                    }
                }, { transaction: t }).then((numConnectionsDeleted) => {
                    return Article.destroy({
                    where: { id: articleId }
                    }, { transaction: t });
                    });
                    });
                });
                });
            });
            })
            return deletedArticle;
        }
        catch(error) {
            console.log(error);
            throw {
            status: 500,
            message: `Failed to delete Article '${articleId}' due to an internal server error`,
            error: new Error()
            };
        }
    }

};
