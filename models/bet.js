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
  price_name: {
    type: String,
  },
  winner: {
    type: {String, String},
  },
  loser: {
    type: [
      {
        id: {
          type: String,
        },
        name: {
          type: String,
        }
      }
    ],
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