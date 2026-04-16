const { Schema, model, models } = require('mongoose');

const schema = new Schema({
  name:   { type: String, required: true },
  role:   { type: String, default: '' },
  avatar: { type: String, default: '' },
  text:   { type: String, required: true },
}, { timestamps: true });

schema.set('toJSON', {
  virtuals: true,
  transform: (_, obj) => { delete obj._id; delete obj.__v; return obj; },
});

module.exports = models.Testimonial || model('Testimonial', schema);
