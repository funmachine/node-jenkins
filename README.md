# Jenkins [![Build Status](https://secure.travis-ci.org/silas/node-jenkins.png?branch=master)](http://travis-ci.org/silas/node-jenkins)

This is a Node.js client for [Jenkins](http://jenkins-ci.org/).

Get

    npm install jenkins

Use

    var jenkins = require('jenkins')('http://user:pass@localhost:8080')

    jenkins.job.list(function(err, list) {
        if (err) throw err
        console.log(list)
    })

See code/tests for all available functions.

## License

This work is licensed under the MIT License (see the LICENSE file).

## Notes

[python-jenkins](https://launchpad.net/python-jenkins) (BSD License, see NOTES)
was used as a reference when implementing this client and its
create/reconfigure job XML was used in the tests.
