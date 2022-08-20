# ic-file-server

*very basic* file server for storing [.ic files](https://github.com/owise1/ic-js)

### how to get files in there

1. GET `/:username/_nonce`
2. Sign the returned nonce like [this](https://docs.ethers.io/v5/getting-started/#getting-started--signing)
3. POST to `/:username`. body should be text of ic file. Use the custom header `x-ic-nonce` in the request for the signed nonce

## ENV vars
`PARTY_MODE`=false // if true anyone can add file to any user (i.e. no auth)