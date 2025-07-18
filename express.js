const express = require('express')
const session = require('express-session')
const qs = require('qs')
const axios = require('axios')
const app = express()
app.use(express.static(__dirname))
app.use(express.json())
require('dotenv').config()

const port = process.env.PORT || 3000
const host = '0.0.0.0'

app.use(
  session({
    secret: "seungjoo",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
)

const cors = require('cors')
app.use(cors())

const client_id = "5089e08676bae2c4b65964f001a0fb20"
const client_secret = "seungjoo"
//const domain = 

const mongoose = require('mongoose')
const url = process.env.MONGODB_URL

mongoose.connect(url)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err))

app.get('/', async (req, res) => {
  res.send('Server On')
})

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
