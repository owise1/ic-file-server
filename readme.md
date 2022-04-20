# ic-file-server

*very basic* file server for storing [.ic files](https://github.com/owise1/ic-js)

### how to get files in there

POST to `/ic`
multipart formdata where the key is your "username" and the value is the file. the file will be renamed into a CID and returned
(optionally) include another key that matches the original filename of the file and it's value will be used to create a symlink to the file