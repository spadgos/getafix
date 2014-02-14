## Getafix Fixture Getter

Getafix is a program which will automatically create and update your fixture data. Configuration is easy, since all you
need to do is recreate the API's url structure locally.

Perhaps it's easier to show rather than tell...

### Quick start

1. Create a folder to hold your fixtures. Let's call it 'fixtures'.

        app/ $ mkdir fixtures && cd fixtures

2. Start recreating the API structure by creating folders and files to represent endpoints. Each endpoint should be a
   file with a ".json" extension. Leave them as empty files.

        app/fixtures/ $ mkdir users
        app/fixtures/ $ touch users/2.json
        app/fixtures/ $ mkdir users/2
        app/fixtures/ $ touch users/2/tracks.json

3. Configure the base so that Getafix knows where to request the data from. Configuration is done with files named
   ".getafix".

        app/fixtures/ $ touch .getafix

4. Add configuration variables to the .getafix file.

        base: 'https://api.example.com'

5. Run getafix, pointing it to your fixtures directory:

        app/ $ getafix fixtures

In this example, getafix would make requests to:

- `https://api.example.com/users/2`
- `https://api.example.com/users/2/tracks`

And save the results back into the JSON files. Adding more fixtures is just a case of creating more empty files.

### Configuration

Configuration files are interpreted as CoffeeScript.

- `base` *(String)* All files beyond this point use this value as a base for the url to request. Folder structure up to this point
  is ignored.
- `headers` *(Object)* A map of headers to include in the request.
- `query` *(Object)* A map of query parameters to include. Useful if you need to always include a client id or similar in every request.
- `map` *(Function)* A function which allows for a custom method of building the url from the folder structure. It is
  passed one variable: `path` and should return a string which is appended to the `base`.

To create different configs for certain endpoints, add extra `.getafix` configuration files in the appropriate folder.
When more than one config lies in the path to an endpoint, the values are merged together.

#### Examples

```
/fixtures
    .getafix
        # base: 'https://api.example.com'
        # query: client: 123
    /users
        2.json             # requests: https://api.example.com/users/2?client=123
        /2
            tracks.json    # requests: https://api.example.com/users/2/tracks.json?client=123
    /resolve
        .getafix
            # map: (path) -> '/resolve?url=example.com/' + path
        foo.json           # requests: https://api.example.com/resolve?url=example.com/foo&client=123
        /bar
            baz.json       # requests: https://api.example.com/resolve?url=example.com/bar/baz&client=123
    /internal
        .getafix
            # base: 'https://api-int.example.com'
        /users
            2.json         # requests: https://api-int.example.com/users/2.json?client=123
```

## License

MIT

## Author

Nick Fisher (@spadgos), SoundCloud (@soundcloud)
