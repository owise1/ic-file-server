const express = require('express')
const fileUpload = require('express-fileupload')
const cors = require('cors')
const bodyParser = require('body-parser')

const app = express()

app.use(fileUpload({
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: 'tmp/'
}))

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/ic', async (req, res) => {
  try {
    if (!req.files) {
      res.send({
        status: false,
        message: 'No file uploaded'
      })
    } else {
      console.log(req.files)

      //send response
      res.send({
        status: true,
        message: 'File is uploaded',
        data: {
          // name: avatar.name,
          // mimetype: avatar.mimetype,
          // size: avatar.size
        }
      })
    }
  } catch (err) {
    res.status(500).send(err)
  }
})

// start app
const port = process.env.PORT || 3000

app.listen(port, () =>
  console.log(`App is listening on port ${port}.`)
)
