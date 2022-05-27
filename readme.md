# ic-file-server

*very basic* file server for storing [.ic files](https://github.com/owise1/ic-js)

### how to get files in there

POST to `/:username`
multipart formdata with any key and where the value is the file. the file will be renamed into a CID and returned

(optionally) include a file name for the file (extension .ic) and it will be used to create a symlink to the file