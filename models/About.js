const { Schema, model, models } = require('mongoose');

const schema = new Schema({
  image:      { type: String, default: '' },
  heading:    { type: String, default: 'Committed To Helping\nOur Clients Succeed' },
  paragraph1: { type: String, default: '' },
  paragraph2: { type: String, default: '' },
  bullets:    { type: [String], default: [] },
}, { timestamps: true });

schema.set('toJSON', {
  virtuals: true,
  transform: (_, obj) => { delete obj._id; delete obj.__v; return obj; },
});

module.exports = models.About || model('About', schema);
