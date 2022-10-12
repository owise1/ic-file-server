const AWS = require('aws-sdk')
const { uniq } = require('ramda')

const checkEnvs = () => {
  let ok = 0 
  ;['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_BUCKET'].forEach(key => {
    if (process.env[key]) {
      ok++ 
    }
  })
  if (ok > 0 && ok < 4) {
    console.log('⚠️ Missing AWS environment variables')
  }
  return ok === 4
}

class S3FileSystem {
  constructor () {
    if (!checkEnvs()) {
      throw new Error('Missing AWS environment variables')
    }
    this.s3 = new AWS.S3()
    this.bucket = process.env.AWS_BUCKET
    this._allUsers = {}
  }
  _path (pth) {
    if (pth && pth.startsWith('/')) {
      return pth.substring(1) 
    }
    return pth
  }
  async exists (pth) {
    return this.s3.headObject({ Bucket: this.bucket, Key: this._path(pth) }).promise()
      .catch(err => false)
  }

  createReadStream (pth) {
    return this.s3.getObject({ Bucket: this.bucket, Key: this._path(pth) }).createReadStream()
  }

  async listAllObjectsFromS3Bucket(bucket, prefix) {
    let isTruncated = true;
    let marker;
    const elements = [];
    while(isTruncated) {
      let params = { Bucket: bucket };
      if (prefix) params.Prefix = prefix;
      if (marker) params.Marker = marker;
      try {
        const response = await this.s3.listObjects(params).promise();
        response.Contents.forEach(item => {
          elements.push(item.Key);
        });
        isTruncated = response.IsTruncated;
        if (isTruncated) {
          marker = response.Contents.slice(-1)[0].Key;
        }
    } catch(error) {
        throw error;
      }
    }
    return elements;
  }

  // fetches all users 
  async readDir (pth = '') {
    const host = this._path(pth).split('/')[0]
    if (!this._allUsers[host]) {
      const res = await this.listAllObjectsFromS3Bucket(this.bucket, this._path(pth))
      this._allUsers[host] = uniq(res.map(c => c.replace(this._path(pth), '').split('/')[0]))
    }
    return this._allUsers[host]
  }

  async writeFile (pth, str) {
    // check if user exists in listing
    const pieces = this._path(pth).split('/')
    if (this._allUsers[pieces[0]] && !this._allUsers[pieces[0]].includes(pieces[1])) {
      this._allUsers[pieces[0]] = null
    }
    return this.s3.upload({
      Bucket: this.bucket,
      Key: this._path(pth),
      Body: Buffer.from(str, 'utf-8')
    }).promise()
  }

  async unlink (pth) {
    return this.s3.deleteObject({ Bucket: this.bucket, Key: this._path(pth) }).promise()
  }

  async readFile (pth) {
    try {
      const res = await this.s3.getObject({ Bucket: this.bucket, Key: this._path(pth) }).promise()
      return res.Body.toString('utf-8')
    } catch (e) {
      return null
    }
  }

}

// looks for env vars and returns a file system
S3FileSystem.factory = function() {
  if (!checkEnvs()) return null
  console.log(`📦 Using S3 file system: ${process.env.AWS_BUCKET} (${process.env.AWS_REGION})`)
  return new S3FileSystem()
}

module.exports = S3FileSystem