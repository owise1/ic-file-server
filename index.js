const { CID } = require('multiformats/cid')
const raw = require('multiformats/codecs/raw')
const { sha256 } = require('multiformats/hashes/sha2')
const { TextEncoder } = require('util')
const fs = require('fs/promises')
const fsReg = require('fs')
const express = require('express')
const serveStatic = require('serve-static')
const fileUpload = require('express-fileupload')
const cors = require('cors')
const bodyParser = require('body-parser')
const { mapObjIndexed, pipe, flatten, values } = require('ramda')
const { ethers } = require('ethers')

const FILE_DIR = 'ic'
// create directory if it doesnt exist
const createDir = async (dir) => {
  if (!fsReg.existsSync(dir)){
    await fs.mkdir(dir)
  }
}
;(async () => {
  createDir(FILE_DIR)
})()

const app = express()
app.use(fileUpload({
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: 'tmp/'
}))
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.text({ type: 'text/ic' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(serveStatic(FILE_DIR, {
  setHeaders: (res, path) => {
    res.setHeader('Content-Type', 'text/ic')
  }
}))

const listDir = async (req, res, pth = '') => {
  let exists
  const host = req.headers.host
  if (pth && !pth.startsWith('/')) {
    pth = '/' + pth
  }
  const dir = FILE_DIR + pth 
  try {
    exists = await fs.stat(dir + '/index.ic')
  } catch (e) {

  }
  if (exists) {
    return fsReg.createReadStream(dir + '/index.ic').pipe(res)
    
  } else if (pth === '') {
    const files = await fs.readdir(dir)
    const icLines = []
    icLines.push(host + pth)
    files.forEach(async file => {
      //CID.asCID(file.replace('.ic', ''))
      icLines.push(`+http://${host}${pth}/${file}/index.ic`)
    })
    res.setHeader('Content-Type', 'text/ic')
    res.send(icLines.join("\n"))
  } else {
    res.sendStatus(404)
  }

}

const serverIndex = async (req, res) => {
  await listDir(req, res)
}
app.get('/', serverIndex)
app.get('/index.ic', serverIndex)

const userIndex = async (req, res) => {
  const { params } = req
  if (/[^A-Za-z0-9]+/.test(params.username)) return res.sendStatus(404)
  await listDir(req, res, params.username)
}
const NONCE_PREFIX = 'Your random nonce: '
const nonces = {}
app.use('/:username', async (req, res, next) => {
  if (!['POST', 'PUT'].includes(req.method)) {
    return next()
  }
  const fail = () => {
    res.sendStatus(401)
  }
  const signedNonce = req.headers['x-ic-nonce']
  if (!signedNonce) return fail()
  const message = NONCE_PREFIX + nonces[req.params.username]
  const verified = await ethers.utils.verifyMessage(message, signedNonce)
  if (verified !== req.params.username) return fail()
  next()
})
app.get('/:username/_nonce', async (req, res) => {
  const { username } = req.params
  if (!nonces[username]) {
    nonces[username] = Math.floor(Math.random() * 1000000)
  }
  res.send(NONCE_PREFIX + nonces[username].toString())
})

app.get('/:username', userIndex)
app.get('/:username/index.ic', userIndex)
app.post('/:username', async (req, res) => {
  const { params } = req
  try {
    // uploading files
    if (req.files) {
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
    // uploading text
    } else if (req.body) {
      const str = req.body
      const bytes = new TextEncoder('utf8').encode(str) 
      const hash = await sha256.digest(bytes)
      const cid = CID.create(1, raw.code, hash)
      const filePath = `/${params.username}/${cid.toString()}.ic`
      const indexPath = `/${params.username}/index.ic` 
      await createDir(FILE_DIR + '/' + params.username)
      await fs.writeFile(FILE_DIR + filePath, str)
      await fs.writeFile(FILE_DIR + indexPath, str)
      res.send({
        ok: true,
        files: [{
          cid: cid.toString(),
          static: filePath,
          dynamic: indexPath
        }]
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
