require('dotenv').config()
const { CID } = require('multiformats/cid')
const raw = require('multiformats/codecs/raw')
const { sha256 } = require('multiformats/hashes/sha2')
const { TextEncoder } = require('util')
const express = require('express')
const serveStatic = require('serve-static')
const fileUpload = require('express-fileupload')
const cors = require('cors')
const bodyParser = require('body-parser')
const { mapObjIndexed, pipe, flatten, values } = require('ramda')
const { ethers } = require('ethers')
const BasicFS = require('./basic-fs')
const S3FileSystem = require('./s3')

const fileSystem = S3FileSystem.factory() || new BasicFS()

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

const listDir = async (req, res, pth = '') => {
  const host = req.headers.host
  if (await fileSystem.exists(pth + '/index.ic')) {
    return fileSystem.createReadStream(pth + '/index.ic').pipe(res)
    
  } else if (pth === '') {
    const files = await fileSystem.readDir(pth)
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
  if (!['POST', 'PUT'].includes(req.method) || process.env.PARTY_MODE === 'true') {
    return next()
  }
  const fail = () => {
    res.sendStatus(401)
  }
  const signedNonce = req.headers['x-ic-nonce']
  if (!signedNonce) return fail()
  const storedNonce = await fileSystem.readFile(`${req.params.username}/_nonce`)
  if (!storedNonce) return fail()
  const message = NONCE_PREFIX + storedNonce 
  const verified = await ethers.utils.verifyMessage(message, signedNonce)
  if (verified !== req.params.username) return fail()
  await fileSystem.unlink(`${req.params.username}/_nonce`)
  next()
})
app.get('/:username/_nonce', async (req, res) => {
  const { username } = req.params
  let userNonce = await fileSystem.readFile(`/${username}/_nonce`)
  if (!userNonce) {
    userNonce = Math.floor(Math.random() * 1000000)
    await fileSystem.writeFile(`/${username}/_nonce`, userNonce.toString())
  }
  res.send(NONCE_PREFIX + userNonce)
})

app.get('/:username', userIndex)
app.get('/:username/index.ic', userIndex)
app.post('/:username', async (req, res) => {
  const { params } = req
  try {
    if (req.body) {
      const str = req.body
      const bytes = new TextEncoder('utf8').encode(str) 
      const hash = await sha256.digest(bytes)
      const cid = CID.create(1, raw.code, hash)
      const filePath = `/${params.username}/${cid.toString()}.ic`
      const indexPath = `/${params.username}/index.ic` 
      await fileSystem.writeFile(filePath, str)
      await fileSystem.writeFile(indexPath, str)
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

app.listen(port, () => {
  console.log(`App is listening on port ${port}.`)
  if (process.env.PARTY_MODE === 'true') {
    console.log('🍾 IT IS PARTY!1! 🕺🏻💃🏽');
  }
})
