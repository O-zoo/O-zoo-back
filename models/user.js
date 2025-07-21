const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  profile_img: {
    type: String
  },
  exp: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  birth: {
    type: String,
    required: true
  },
  wins: {
    type: Number,
    default: 0
  },
  losses: {
    type: Number,
    default: 0
  },
})

const User = mongoose.model('User', userSchema)

module.exports = User