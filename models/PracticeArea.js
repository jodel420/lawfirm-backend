const { Schema, model, models } = require('mongoose');

const schema = new Schema({
  icon:  { type: String, default: 'FaGavel' },
  title: { type: String, required: true },
  desc:  { type: String, default: '' },
}, { timestamps: true });

schema.set('toJSON', {
  virtuals: true,
  transform: (_, obj) => { delete obj._id; delete obj.__v; return obj; },
});

module.exports = models.PracticeArea || model('PracticeArea', schema);
