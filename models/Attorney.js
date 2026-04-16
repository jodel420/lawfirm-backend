const { Schema, model, models } = require('mongoose');

const schema = new Schema({
  name:      { type: String, required: true },
  role:      { type: String, default: '' },
  specialty: { type: String, default: '' },
  image:     { type: String, default: '' },
  linkedin:  { type: String, default: '' },
  twitter:   { type: String, default: '' },
  email:     { type: String, default: '' },
}, { timestamps: true });

schema.set('toJSON', {
  virtuals: true,
  transform: (_, obj) => { delete obj._id; delete obj.__v; return obj; },
});

module.exports = models.Attorney || model('Attorney', schema);
