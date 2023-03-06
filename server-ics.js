const { curry } = require('ramda')
const IC = require('ic-js')
const { ADMIN, ADMIN_HOME, PARTY_MODE } = process.env

// VERY basic cacheing of server index.ic
// this is not meant to scale
const serverIcs = {}


class ServerIcs {
  constructor (fileSystem) {
    if (!fileSystem) throw new Error('fileSystem is required')
    this.fileSystem = fileSystem
    this.serverIcs = {}
  }

  clearServerIc (filePrefix) {
    delete this.serverIcs[filePrefix]
  }

  clearServerAdminIc () {
    this.clearServerIc(ADMIN_HOME)
  }

  async getServerAdminIc () {
    if (!ADMIN || !ADMIN_HOME) return
    return this.serverIc(ADMIN_HOME)
  }

  async serverIc (filePrefix, icOpts = {}) {
    const optsKeys = Object.keys(icOpts)
    if (this.serverIcs[filePrefix] && optsKeys.length === 0) return this.serverIcs[filePrefix]
    const files = await this.fileSystem.readDir(filePrefix + '/')
    const allFiles = await Promise.all(files.map(file => {
      return this.fileSystem.readFile(`${filePrefix}/${file}/index.ic`)
        .then(str => {
          if (!str) return null
          if (str.startsWith('_\n')) return str.replace(/^_/, `_${file}`)
          return `_${file}\n${str}`
        })
    }))
    const icStr = allFiles
      .filter(Boolean)
      .join('\n')
    const ic = new IC(icOpts)
    ic.created = Date.now()
    await ic.import(icStr)
    if (optsKeys.length > 0) return ic
    this.serverIcs[filePrefix] = ic
    return ic
  }
  async getDomainAdmin (host) {
    const adminIc = await this.getServerAdminIc()
    if (adminIc) {
      const admin = adminIc.findTagged(['admin', host])
      if (admin[0]){
        return admin[0]
      }
    }
    return ADMIN
  }
}

module.exports = ServerIcs