## v0.1.0 <sub><sup>(2016-1-29)</sup></sub>

#### Highlights
* Changed name of props file to be `sauce.json` as opposed to `churros.json` cause I'm weird like that ...
* Stub out default properties needed to provision each element during `churros init` in the `sauce.template.json` file
* Continuing to add more elements to the elements catalog
* Added support for `should.have.schemaAnd200` `chakram` assertion as I found that I was always doing both of those at the same time and also because the error message for each of those wasn't good enough so wanted to improve it
* Added support for `should.have.statusCode` which is the *exact* same as `should.have.status` but gives more logging when the assertion fails to help debug the issue more easily.
* Many common tests available under `core/tester` and can be found under the `tester.test.` namespace.  This library will continue to grow as we add more and more tests and find out the commonalities throughout more elements.
* Event tests that create an instance of an element with notifications enabled, register a local URL that is exposed (can use ngrok, localtunnel, ssh tunneling) and then listen on that URL for incoming events from the platform.  Also supports specifying how many events to send and how long to wait to receive the webhook notification.
* `churros add` sub-command to help setup a new platform or element suite

## v0.0.0 <sub><sup>(2016-1-15)</sup></sub>

#### Highlights
* `$ churros init` support for initializing `churros` with any default values that will be used when running tests
* `$ churros test` support for running a a suite of tests, one to many files in a suite, or a subset of tests in a suite

```bash
$ churros test notifications
$ churros test notifications --file subscriptions
$ churros test notifications --file subscriptions --file notifications
$ churros test notifications --file subscriptions --file notifications --test \'should throw a 400\'
```

> __NOTE:__ The `--test` searches all of the `describe(...)` and `it(...)` strings to determine which test(s) to run.

* Ability to override the default user, password and url by passing optional arguments to `churros test`, for example:

```bash
$ churros test notifications --user frank_ricard --password old_school --url frank.old-school.com
```

* `$ churros props` support for interfacing with the `$HOME/.churros/churros.json` property file that contains all sensitive data
* [CircleCI](https://circleci.com/gh/cloud-elements/churros) support
* Gracefully handles if endpoint that tests are running against is not currently running