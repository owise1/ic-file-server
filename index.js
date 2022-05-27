const { CID } = require('multiformats/cid')
const raw = require('multiformats/codecs/raw')
const { sha256 } = require('multiformats/hashes/sha2')
const { TextEncoder } = require('util')
const fs = require('fs/promises')
const express = require('express')
const serveStatic = require('serve-static')
const fileUpload = require('express-fileupload')
const cors = require('cors')
const bodyParser = require('body-parser')
const { mapObjIndexed, pipe, flatten, values } = require('ramda')

const FILE_DIR = 'ic'


const app = express()
app.use(fileUpload({
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: 'tmp/'
}))
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(serveStatic(FILE_DIR, {
  setHeaders: (res, path) => {
    res.setHeader('Content-Type', 'text/ic')
  }
}))

app.post('/:username', async (req, res) => {
  try {
    if (req.files) {
      const { params } = req
      const files = await Promise.all(values(mapObjIndexed(async (file, key) => {
        const ret = {}
        const str = await fs.readFile(file.tempFilePath, 'utf8')
        const bytes = new TextEncoder('utf8').encode(str) 
        const hash = await sha256.digest(bytes)
        const cid = CID.create(1, raw.code, hash)
        const filePath = `${params.username}/${cid.toString()}.ic`
        ret.cid = cid.toString()
        ret.static = filePath
        await file.mv(FILE_DIR + '/' + filePath)
        // they also want a symlink
        if (file.name && /\.ic$/.test(file.name)) {
          const symlink = `${params.username}/${file.name}` 
          try{
            await fs.unlink(`${FILE_DIR}/${symlink}`)
          } catch (e) {
            // do nothing
          }
          await fs.symlink(__dirname + '/' + FILE_DIR + '/' + filePath, `${FILE_DIR}/${symlink}`)
          ret.dynamic = symlink
        }
        return ret 
      }, req.files)))
      //send response
      res.send({
        ok: true,
        files: flatten(files)
      })
    }
  } catch (err) {
    res.status(500).send(err)
  }
})

// start app
const port = process.env.PORT || 3002

app.listen(port, () =>
  console.log(`App is listening on port ${port}.`)
)
