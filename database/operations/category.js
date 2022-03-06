module.exports = (Sequelize, sequelize, Models) => {
    const Category = Models["Category"];
    const Article = Models["Article"];
    const Snippet = Models["Snippet"];
    const Connection = Models["Connection"];
    const ConnectionDescription = Models["ConnectionDescription"];
    const Field = Models["Field"];
    const FieldValue = Models["FieldValue"];
    const Op = Sequelize.Op;

    Category.createCategory = async function(newCategoryName) {
        let existingCategory = await Category.findOne({
            where: { name: newCategoryName }
        });
        if (existingCategory) {
            throw {
                status: 409,
                message: `The current World already has a Category named '${newCategoryName}'`,
                error: new Error()
            }
        }

        let category = await Category.create({
            name: newCategoryName,
            description: '',
        });

        return category.toJSON();
    }

    Category.getCategories = async function(offset, limit) {
        let categories = await Category.findAll({
            offset: offset,
            limit: limit,
            order: sequelize.col('name')
        });

        return categories;
    }

    Category.getArticlesInCategory = async function(categoryId, offset, limit) {
        let category = await Category.findOne({
            where: { id: categoryId }
        });
        if (!category) {
            throw {
                status: 404,
                message: `Category '${categoryId}' does not exist in the current World`,
                error: new Error()
            }
        }

        let articles = await category.getArticles({
            offset: offset,
            limit: limit,
            order: sequelize.col('name'),
            raw: true
        });
        return articles;
    }

    Category.insertDefaultCategories = async function() {
        await Category.create(
            {
            name: "Person",
            description: "Living entities that occupy this world.",
            fields: [
                { name: "Nicknames / Aliases" },
                { name: "Age" },
                { name: "Gender" },
                { name: "Short Bio" },
            ]},
            {
                include: [{association: Category.Field}]
            }
        );
        await Category.create(
            {
            name: "Group",
            description: "People and other entities that have organized into a clan, team, etc.",
            fields: [
                { name: "Mandate / Description" },
                { name: "History" },
            ]},
            {
                include: [{association: Category.Field}]
            }
        );
        await Category.create(
            {
            name: "Place",
            description: "Locations and settings that make up this world.",
            fields: [
                { name: "Description" },
                { name: "History" },
            ]},
            {
                include: [{association: Category.Field}]
            }
        );
        await Category.create(
            {
            name: "Item",
            description: "Noteworthy objects that affect the lives of those who live in this world.",
            fields: [
                { name: "Properties / Description" },
                { name: "History" },
            ]},
            {
                include: [{association: Category.Field}]
            }
        );
        await Category.create(
            {
            name: "Concept",
            description: "Key ideas and theorems that drive the nature of this world.",
            fields: [
                { name: "Description" },
            ]},
            {
                include: [{association: Category.Field}]
            }
        );
    }

    Category.getCategoryMetadata = async function(categoryId) {
        let category = await Category.findOne({
            attributes: [ 'id', 'name', 'description', 'createdAt', 'updatedAt' ],
            where: { id: categoryId },
            raw: true
        });

        if (!category) {
            throw {
                status: 404,
                message: `Category '${categoryId}' does not exist in the current World`,
                error: new Error()
            };
        }

        return category;
    }

    Category.getImage = async function(categoryId) {
        let category = await Category.findOne({
            attributes: [ 'image' ],
            where: { id: categoryId }
        });

        if (!category) {
            throw {
                status: 404,
                message: `Category '${categoryId}' does not exist in the current World`,
                error: new Error()
            };
        }

        if (category.image) {
            return JSON.parse(category.image);
        }
        else {
            return null;
        }
    };



    Category.updateCategoryImage = async function(categoryId, image) {
        let category = await Category.findOne({
            where: { id: categoryId }
        });

        if (!category) {
            throw {
                status: 404,
                message: `Category '${categoryId}' does not exist in the current World`,
                error: new Error()
            };
        }

        await category.update({
            image: JSON.stringify(image),
        })
    };

    Category.updateCategoryDescription = async function(categoryId, newDescription) {
        let category = await Category.findOne({
            where: { id: categoryId },
        });

        if (!category) {
            throw {
                status: 404,
                message: `Category '${categoryId}' does not exist in the current World`,
                error: new Error()
            };
        }

        category.description = newDescription;
        await category.save();

        return category.toJSON();
    };

    Category.renameCategory = async function(categoryId, name) {
        let category = await Category.findOne({
            where: { id: categoryId }
        });
        if (!category) {
            throw new Error(`Category '${categoryId}' does not exist`);
        }
        if (name && !(name === category.name)) {
            category.name = name;
            await category.save();
        }
        return category;
    }

    Category.deleteCategory = async function(categoryId) {
        let deletedCategory = await Category.findOne({
            where: { id: categoryId },
            raw: true
        });

        if (!deletedCategory) {
            throw {
                status: 404,
                message: `Category '${categoryId}' does not exist in the current World`,
                error: new Error()
            };
        }

        try {
            await sequelize.transaction(t => {
            return Article.findAll({
                where: { categoryId: categoryId }
            }, { transaction: t }).then((articlesInCategory) => {
                let articleIds = articlesInCategory.map(article => {
                return article.id;
                });
                return Snippet.destroy({
                where: { articleId: { [Op.in]: articleIds } }
                }, { transaction: t }).then(numDeletedSnippets => {
                return FieldValue.destroy({
                    where: { articleId: { [Op.in]: articleIds } }
                }, { transaction: t }).then((numDeletedFieldValues) => {
                    return Connection.findAll({
                    attributes: ['connectionDescriptionId'],
                    where: { mainArticleId: { [Op.in]: articleIds } }
                    }, { transaction: t }).then((connections) => {
                    let connectionDescriptionIds = connections.map((connection) => {
                        return connection.connectionDescriptionId
                    });
                    return ConnectionDescription.destroy({
                        where: { id: { [Op.in]: connectionDescriptionIds } }
                    }, { transaction: t }).then((numDeletedFieldValues) => {
                        return Connection.destroy({
                        where: {
                            [Op.or]: [
                        {
                            mainArticleId: { [Op.in]: articleIds }
                        },
                        {
                            otherArticleId: { [Op.in]: articleIds }
                        }]}
                        }, { transaction: t }).then((numConnectionsDeleted) => {
                        return Article.destroy({
                            where: { categoryId: categoryId }
                        }, { transaction: t }).then((numDeletedArticles) => {
                            return Field.destroy({
                            where: { categoryId: categoryId }
                            }, { transaction: t }).then((numDeletedFields) => {
                            return Category.destroy({
                                where: { id: categoryId }
                            }, { transaction: t });
                            });
                        });
                        });
                    });
                    });
                });
                });
            });
            })
            return deletedCategory;
        }
        catch(error) {
            console.log(error);
            throw {
                status: 500,
                message: `Failed to delete Category '${categoryId}' due to an internal server error`,
                error: new Error()
            };
        }
    }

};
