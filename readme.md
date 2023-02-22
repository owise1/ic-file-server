# ic-file-server (ic-fs)

*very basic* file server for storing [.ic files](https://github.com/owise1/ic-js)

Everything in `ic-fs` is based on the domain of the requests. That allows you to map many domains/subdomains to the same server and have them appear different.

# Server index

Let say our domain is `yes.aye.si`. A `GET` to `yes.aye.si/index.ic` will return the server index.  By default the server index will return an .ic file with all the users' index files. ex:
```
yes.aye.si
+https://yes.aye.si/0x040888d58cb4004E8d37DcaC3BE97AA659157dc2/index.ic
+https://yes.aye.si/0x040448d58cb4004E8d37DcaC3BE97AA659157dc2/index.ic
+https://yes.aye.si/0xe5C5a36842FBCEc4bd69B9ba3cD99B8B52036eCa/index.ic
```

### Server Admin

Every server has an admin that is configured using [ENV vars](#env-vars).  This admin user's public key will appear in the server index like so

```
yes.aye.si admin
+0xE11E29773B60049AaBA3576aE29F1b7290A09Dd2
```

One special property of this user is that anything tagged `icfs` at `yes.aye.si/{ADMIN}/index.ic` will also be included in the server index. This allows the admin to add useful context to the server. For example, my NooDu client uses the first thot tagged `icfs` and `name` as the server name.


Additionally, there is the [ENV var](#env-vars) `ADMIN_HOME`. This is the (sub)domain where the admin's master .ic file resides. This file can be used for server-wide settings. Right now it's used to greenlist subdomains. So if the env var `ADMIN_HOME` exists, *and* a .ic file resides at `{ADMIN_HOME}/{ADMIN}/index.ic`, *and* said .ic file contains domains tagged both `domains` and `icfs` then those will be the only (sub)domains allowed on the server. Otherwise, the only way to control which domains the server controls would be via DNS. 

# User index

Issuing a `GET` request to a user like `/:username` or `/:username/index.ic` will return the user's entire .ic

# IC methods

Right now two IC methods are honored via `GET`: `seed`, and `findTagged`. These will return the result of calling that method on the user's IC *or* the entire server. Use the query string to pass parameters. Both methods take an array of strings and it's important to note that the delimiter is a newline (`%0A`)

* Seeding from a user's .ic - `/:username/?seed=tag one%0Atag two` will return a valid .ic
* findTagged for a user - `/:username/?findTagged=tag one%0Atag two` will return a newline delimited list of thots
* Seed from entire server `/?seed=ic`

`seed` also accepts an optional `depth` param for controlling seed depth. ex: `/?seed=ic&depth=1` will return an ic containing everything 1 step from `ic`


# Authorization

Right now anyone can add a file to the server, *but* they have to prove who they are.  The process for that is like so:

1. `GET` `/:username/_nonce` where `:username` is your public key
2. Sign the returned nonce like [this](https://docs.ethers.io/v5/getting-started/#getting-started--signing)
3. Put the signed nonce in the body of a `POST` to `/:username/_jwt`. You'll get a jwt
	1. the signed nonce can be the entire post body or, if you want more info included in your jwt..
	2. you can send a json object like 
    ```
    { 
      "nonce": "SINGED_NONCE",
      "data": {
        "exp": 1674143282872,
        "tags": "parent tags that are allowed\nnewline separated"
      }
    }
    ```
4. Use that jwt for `POST` and `PATCH` in the header `Authorization: Bearer {JWT}`


# Getting ICs in there 

1. [Authorize](#authorization)
2. `POST` to `/:username` to overwrite whatever is there with the post body
3. `PATCH` to `/:username` to append what's in the body (or create if none exists). This is the safer option



## ENV vars
```
PARTY_MODE=false // if true anyone can add file to any user (i.e. no auth)
ADMIN= // 0x.... address of admin
ADMIN_HOME= // domain that the master admin .ic lives

JWT_SECRET= // if this doesnt exist one will be generated on every restart

// If all of the following are present we'll use s3 instead of local file system
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET=
AWS_REGION=
```