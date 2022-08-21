const AWS = require('aws-sdk')
const { uniq } = require('ramda')

const checkEnvs = () => {
  let ok = true
  ;['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_BUCKET'].forEach(key => {
    if (!process.env[key]) {
      ok = false
    }
  })
  return ok
}

class S3FileSystem {
  constructor () {
    if (!checkEnvs()) {
      throw new Error('Missing AWS environment variables')
    }
    this.s3 = new AWS.S3()
    this.bucket = process.env.AWS_BUCKET
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
  async readDir (pth) {
    if (!this._allUsers) {
      const res = await this.listAllObjectsFromS3Bucket(this.bucket, '')
      this._allUsers = uniq(res.map(c => c.split('/')[0]))
    }
    return this._allUsers
  }

  async writeFile (pth, str) {
    // check if user exists in listing
    const users = await this.readDir()
    const username = pth.split('/')[0]
    if (!users.includes(username)) {
      this._allUsers = null
    }
    return this.s3.upload({
      Bucket: this.bucket,
      Key: this._path(pth),
      Body: Buffer.from(str, 'utf-8')
    }).promise()
  }

}

// looks for env vars and returns a file system
S3FileSystem.factory = function() {
  if (!checkEnvs()) return null
  return new S3FileSystem()
}

module.exports = S3FileSystem