const { curry } = require('ramda')
const IC = require('ic-js')

// VERY basic cacheing of server index.ic
// this is not meant to scale
const serverIcs = {}
const serverIc = curry(async (fileSystem, filePrefix) => {
  if (serverIcs[filePrefix]) return serverIcs[filePrefix]
  const files = await fileSystem.readDir(filePrefix + '/')
  const allFiles = await Promise.all(files.map(file => {
    return fileSystem.readFile(`${filePrefix}/${file}/index.ic`)
      .then(str => {
        if (!str) return null
        if (str.startsWith('_\n')) return str.replace(/^_/, `_${file}`)
        return `_${file}\n${str}`
      })
  }))
  const icStr = allFiles
    .filter(Boolean)
    .join('\n')
  const ic = new IC
  ic.created = Date.now()
  await ic.import(icStr)
  serverIcs[filePrefix] = ic
  return ic
})

const clearServerIc = (filePrefix) => {
  delete serverIcs[filePrefix]
}
module.exports = {
  serverIc,
  clearServerIc
}