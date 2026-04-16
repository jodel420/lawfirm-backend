const { Schema, model, models } = require('mongoose');

const schema = new Schema({
  title:    { type: String, required: true },
  category: { type: String, default: 'General' },
  date:     { type: String, default: '' },
  excerpt:  { type: String, default: '' },
  image:    { type: String, default: '' },
}, { timestamps: true });

schema.set('toJSON', {
  virtuals: true,
  transform: (_, obj) => { delete obj._id; delete obj.__v; return obj; },
});

module.exports = models.Post || model('Post', schema);
