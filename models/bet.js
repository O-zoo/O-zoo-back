const mongoose = require('mongoose')

const betSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 50
  },
  members: {
    type: [
      {
        id: {
          type: String,
          required: true
        },
        name: {
          type: String,
          required: true
        }
      }
    ]
  },
  price: {
    type: String,
  },
  winner: {
    type: {String, String},
  },
  losser: {
    type: {String, String},
  },
  start: {
    type: Date, 
    default: Date.now
  },
  end: {
    type: Date,
  },
})

const Bet = mongoose.model('Bet', betSchema)

module.exports = Bet