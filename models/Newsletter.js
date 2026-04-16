const { Schema, model, models } = require('mongoose');

const schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
}, { timestamps: true });

module.exports = models.Newsletter || model('Newsletter', schema);
