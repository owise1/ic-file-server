require('dotenv').config()
const { CID } = require('multiformats/cid')
const raw = require('multiformats/codecs/raw')
const { sha256 } = require('multiformats/hashes/sha2')
const { TextEncoder } = require('util')
const express = require('express')
const serveStatic = require('serve-static')
const compression = require('compression')
const fileUpload = require('express-fileupload')
const cors = require('cors')
const bodyParser = require('body-parser')
const { curry, map, join, mapObjIndexed, pipe, flatten, values, filter, path } = require('ramda')
const { ethers } = require('ethers')
const BasicFS = require('./basic-fs')
const S3FileSystem = require('./s3')
const IC = require('ic-js')
const jwt = require('jsonwebtoken')
const { expressjwt } = require("express-jwt")
const { serverIc, clearServerIc } = require('./server-ics')
const { ADMIN, ADMIN_HOME, PARTY_MODE } = process.env

const fileSystem = S3FileSystem.factory() || new BasicFS()
const getServerIc = serverIc(fileSystem)

const app = express()
app.use(compression())
app.use(fileUpload({
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: 'tmp/'
}))
app.use(cors())
app.use(bodyParser.json({ type: '*/json' }))
app.use(bodyParser.text({ type: 'text/*' }))
app.use(bodyParser.urlencoded({ extended: true }))

let JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.log('🔒⚠️ You did not provide a JWT_SECRET. One is being generated for you. That means you will have to reauthenticate every time you restart the server.')
  JWT_SECRET = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) 
}

// admin's master ic
let adminIc
const uberAdminServiceIc = async () => {
  if (!ADMIN || !ADMIN_HOME) return
  clearServerIc(ADMIN_HOME)
  return getServerIc(ADMIN_HOME)
    .then(ic => {
      adminIc = ic
    })
}
uberAdminServiceIc()

const getServerAdmin = host => {
  if (adminIc) {
    const admin = adminIc.findTagged(['admin', host])
    if (admin[0]){
      return admin[0]
    }
  }
  return ADMIN
}

app.use(expressjwt({ 
  secret: JWT_SECRET, 
  algorithms: ['HS256'],
  credentialsRequired: false
}))

app.use((req, res, next) => {
  const host = req.headers.host || 'no-host'
  if (adminIc) {
    const domains = adminIc.findTagged(['domains', 'icfs'])
    if (domains.length > 0 && !domains.includes(host) && host !== ADMIN_HOME) {
      return res.status(401).send('Unauthorized')
    }
  }
  req.filePrefix = `/${host}`
  next()
})


const serverIndex = async (req, res) => {
  const host = req.headers.host
  const { params, query } = req
  if (query && query.findTagged) {
    const ic = await getServerIc(req.filePrefix)
    const tagged = ic.findTagged(query.findTagged.split("\n").map(s => s.trim()), { ic: true })
    return res.send(tagged.export())
  } else if (query && query.seed) {
    const ic = await getServerIc(req.filePrefix)
    const opts = {}
    if (query.depth) {
      opts.depth = parseInt(query.depth)
    }
    return res.send(ic.seed(query.seed.split("\n").map(s => s.trim()), opts).export())

  } else {
    const files = await fileSystem.readDir(req.filePrefix + '/')
    const icLines = []
    icLines.push(host)
    files.forEach(file => {
      icLines.push(`+https://${host}/${file}/index.ic`)
    })
    res.setHeader('Content-Type', 'text/ic')
    let ret = ''
    const serverAdmin = getServerAdmin(host) 
    if (serverAdmin) {
      ret += `${host} admin\n+${serverAdmin}\n`
      // serverAdmin has a file
      if (files.includes(serverAdmin)) {
        const adminIc = await fileSystem.readFile(req.filePrefix + `/${serverAdmin}/index.ic`)
        if (adminIc) {
          const ic = new IC
          await ic.import(adminIc)
          const newIc = ic.seed(['icfs']) 
          ret += `\n${newIc.export().replace(/^_.*\n/, `_${serverAdmin}\n`)}\n_\n`
        }
      }
    }
    ret += pipe(
      join("\n")
    )(icLines)
    res.send(ret)
  }
}

const userIndex = async (req, res) => {
  const { params, query } = req
  if (/[^A-Za-z0-9]+/.test(params.username)) return res.sendStatus(404)
  const fileName = req.filePrefix + `/${params.username}/index.ic` 
  if (await fileSystem.exists(fileName)) {
    if (query && query.seed) {
      const ic = new IC
      const icFile = await fileSystem.readFile(fileName)
      await ic.import(icFile || '')
      const opts = {}
      if (query.depth) {
        opts.depth = parseInt(query.depth)
      }
      const seedIc = ic.seed(query.seed.split("\n").map(s => s.trim()), opts)
      return res.send(seedIc.export())
    } else if (query && query.findTagged) {
      const ic = new IC
      const icFile = await fileSystem.readFile(fileName)
      await ic.import(icFile || '')
      return res.send(ic.findTagged(query.findTagged.split("\n").map(s => s.trim())).join("\n"))
    } else {
      return fileSystem.createReadStream(fileName).pipe(res)
    }
  } else {
    res.sendStatus(404)
  }
}

const writeUserFiles = async (req, str) => {
  const { params } = req
  // const bytes = new TextEncoder('utf8').encode(str) 
  // const hash = await sha256.digest(bytes)
  // const cid = CID.create(1, raw.code, hash)
  // const filePath = `/${params.username}/${cid.toString()}.ic`
  const indexPath = `/${params.username}/index.ic` 
  clearServerIc(req.filePrefix)
  // await fileSystem.writeFile(req.filePrefix + filePath, str)
  await fileSystem.writeFile(req.filePrefix + indexPath, str)
  if (params.username === ADMIN) {
    uberAdminServiceIc()
  }
  return [{
    // cid: cid.toString(),
    // static: filePath,
    dynamic: indexPath
  }]
}


const NONCE_PREFIX = 'Your random nonce: '

const verifyNonce = async (req, signedNonce) => {
  const { username } = req.params
  if (!signedNonce) return
  const storedNonce = await fileSystem.readFile(req.filePrefix + `/${username}/_nonce`)
  if (!storedNonce) return
  const message = NONCE_PREFIX + storedNonce 
  const verified = await ethers.utils.verifyMessage(message, signedNonce)
  if (verified !== username) return
  await fileSystem.unlink(req.filePrefix + `/${username}/_nonce`)
  return username 
}
app.use('/:username', async (req, res, next) => {
  if (!['POST', 'PATCH'].includes(req.method)) {
    return next()
  }
  const fail = () => {
    res.sendStatus(401)
  }
  const { username } = req.params
  if (req.path === '/_jwt' || path(['auth', 'username'], req) === username || (await verifyNonce(req, req.headers['x-ic-nonce']))) {
    if (PARTY_MODE === 'true' || username === ADMIN) {
      return next()
    }
    const ic = await getServerIc(req.filePrefix)
    const invites = ic.findTagged(['.ic invites'])
    if (invites.length === 0 || invites.find(i => i === `${req.headers.host}/${username}`)) {
      return next()
    }
  }
  fail()
})
app.get('/:username/_nonce', async (req, res) => {
  const { username } = req.params
  let userNonce = await fileSystem.readFile(req.filePrefix + `/${username}/_nonce`)
  if (!userNonce) {
    userNonce = Math.floor(Math.random() * 1000000)
    await fileSystem.writeFile(req.filePrefix + `/${username}/_nonce`, userNonce.toString())
  }
  res.send(NONCE_PREFIX + userNonce)
})
app.post('/:username/_jwt', async (req, res) => {
  const nonce = path(['body', 'nonce'], req) || req.body
  if (await verifyNonce(req, nonce)) {
    const { username } = req.params
    const token = jwt.sign(Object.assign({ username }, req.body.data), JWT_SECRET)
    res.send(token)
  } else {
    res.sendStatus(401)
  }
})

app.get('/', serverIndex)
app.get('/index.ic', serverIndex)
app.get('/:username', userIndex)
app.get('/:username/index.ic', userIndex)

app.post('/:username', async (req, res) => {
  const { params } = req
  try {
    if (req.body) {
      const files = await writeUserFiles(req, req.body)
      res.send({
        ok: true,
        files
      })
    }
  } catch (err) {
    res.status(500).send(err)
  }
})
app.patch('/:username', async (req, res) => {
  const { params, auth = {} } = req
  const { tags } = auth
  try {
    if (req.body) {
      // verify that they can write to this tag
      if (tags) {
        const ic = new IC({ importDepth: 1 })
        await ic.import(req.body)
        const allowedTags = tags.split('\n').map(IC.clean)
        const badTags = ic.all().filter(t => !allowedTags.includes(t.to))
        if (badTags.length) return res.status(401).send('Unauthorized')
      }
      const existingFile = await fileSystem.readFile(req.filePrefix + `/${params.username}/index.ic`)
      const str = `${existingFile ? existingFile + '\n' : ''}${req.body}`
      const files = await writeUserFiles(req, str)
      res.send({
        ok: true,
        files
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
