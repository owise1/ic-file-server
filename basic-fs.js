const fs = require('fs/promises')
const fsReg = require('fs')
const path = require('path')

const FILE_DIR = 'ic'

class BasicFS {
  constructor() {
    ;(async () => {
      this.createDir(FILE_DIR)
    })()
  }

  _path (pth) {
    if (pth && !pth.startsWith('/')) {
      pth = '/' + pth
    }
    return FILE_DIR + pth 
  }

  async createDir (dir) {
    if (!fsReg.existsSync(dir)){
      await fs.mkdir(dir)
    }
  }

  async exists (pth) {
    try {
      return await fs.stat(this._path(pth))
    } catch (e) {
      return false
    }
  }

  createReadStream (pth) {
    return fsReg.createReadStream(this._path(pth))
  }

  async readDir (pth) {
    return fs.readdir(this._path(pth))
  }

  async writeFile (pth, str) {
    await this.createDir(FILE_DIR + path.dirname(pth))
    return fs.writeFile(this._path(pth), str)
  }
}
module.exports = BasicFS
