const mongoose = require('mongoose');

/**
 *
 * @param {string} modelName
 * @param {mongoose.Schema} schema
 */
const getModel = (modelName, schema) => {
    if (mongoose.models[modelName]) {
        return mongoose.models[modelName];
    }
    return mongoose.model(modelName, schema);
};

module.exports = { getModel };
