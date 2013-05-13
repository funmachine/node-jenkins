var request = require('request')
  , util = require('util')
  , XML = require('xml')

function JenkinsError(err, res) {
  this.name = 'JenkinsError'

  if (err instanceof Error) {
    this.message = err.message
  } else {
    this.message = err || 'unknown error'
  }

  if (typeof res === 'object') {
    this.code = res.statusCode
  }

  Error.captureStackTrace(this, JenkinsError)
}
util.inherits(JenkinsError, Error)

var error = function(message, res) {
  return new JenkinsError(message, res)
}

var jobNotFound = function(name, res) {
  return error('job "' + name + '" does not exist', res)
}

var path = function() {
  var args = Array.prototype.slice.call(arguments)
  return '/' + args.map(encodeURIComponent).join('/')
}

// Create a job from parameters supplied as an object. This function
// will generate a correctly formatted XML config. parameter format
// is borrowed from https://github.com/arangamani/jenkins_api_client
// Param format:
// {
//   keep_dependencies: true|false
//   block_build_when_downstream_building: true|false
//   block_build_when_upstream_building: true|false
//   concurrent_build: true|false
//   scm_provider: git|svn|cvs
//   scm_url: remote url
//   scm_module: module to build (CVS only)
//   scm_branch: branch to build (default:"master")
//   scm_tag: tag to build (CVS only)
//   scm_use_head_if_tag_not_found: true|false (CVS only)
//   timer: for running builds periodically (crontab schedule string)
//   polling: for running builds when changes are detected (crontab schedule string)
//   shell_command: command to execute in shell
//   assigned_node: restrict job to specified node
//   env_inject: a hash of key/value pairs that will be injected to the build environment
// }
var createJobConfig = function(params_in, cb) {

  if(params_in.scm_provider && !params_in.scm_url) {
    return cb(error('SCM provider URL must be specified'))
  }

  var defaults = {
    keep_dependencies: false,
    block_build_when_downstream_building: false,
    block_build_when_upstream_building: false,
    concurrent_build: false,
    scm_branch: "master",
    scm_use_head_if_tag_not_found: false,
    assigned_node: {}
  }

  // Merge defaults
  params = {} 
  for (var key in defaults) { params[key] = defaults[key] }
  for (var key in params_in) { params[key] = params_in[key] }

  // Create job prototype object for XML conversion
  job = {
    project: [
      { actions: {} },
      { description: {} },
      { keepDependencies: params.keep_dependencies },
      { properties: {} },
      { scm: scm() },
      { disabled: false },
      { blockBuildWhenDownstreamBuilding: params.block_build_when_downstream_building },
      { blockBuildWhenUpstreamBuilding: params.block_build_when_upstream_building },
      { triggers: triggers() },
      { concurrentBuild: params.concurrent_build },
      { publishers: {} },
      { buildWrappers: buildWrappers() },
      { builders: builders() },
      { assignedNode: params.assigned_node },
      { canRoam: (typeof(params.assigned_node) != "string") }
    ]
  }

  return cb(null, XML(job))

  function buildWrappers() {
    var wrappers = []
    if(params.env_inject) {

      var content = ''
      for(var prop in params.env_inject) {
        content += prop + "=" + params.env_inject[prop] + "\n"
      }

      var elem = {}
      elem["EnvInjectBuildWrapper"] = [
        { info: [ 
          { propertiesContent: content },
          { loadFilesFromMaster: false }
      ]}] 

      wrappers.push(elem)
    }

    return wrappers;
  }

  function builders() {
    var builders = []

    if(params.shell_command) {
      var elem = {}
      elem["hudson.tasks.Shell"] = [ { command: params.shell_command } ]
      builders.push(elem)
    }

    return builders;
  }

  function triggers() {
    var triggers = [ { _attr: { class: "vector" }} ]
    if(params.timer) {
      var elem = {}
      elem["hudson.triggers.TimerTrigger"] = [ { spec: params.timer } ]
      triggers.push(elem)
    }

    if(params.polling) {
      var elem = {}
      elem["hudson.triggers.SCMTrigger"] = [ { spec: params.polling } ]
      triggers.push(elem)
    }

    return triggers;
  }

  function scm() {
    var elem 
    switch(params.scm_provider) {
    case "git":
      elem = scm_git()
      break
    case "svn":
      elem = scm_svn()
      break
    case "cvs":
      elem = scm_cvs()
      break
    default:
      elem = { _attr: { class: "hudson.scm.NullSCM" } }
    }
    
    return elem
  }

  function scm_git() {
    var remote = {}
    remote["hudson.plugins.git.UserRemoteConfig"] = [
      { name: {} },
      { refspec: {} },
      { url: params.scm_url }
    ]

    var branch = {}
    branch["hudson.plugins.git.BranchSpec"] = [ 
      { name: params.scm_branch } 
    ]

    return [ 
      { _attr: { class: "hudson.plugins.git.GitSCM" } },
      { configVersion: "2" },
      { userRemoteConfigs: [ remote ] },
      { branches: [ branch ] },
      { disableSubmodules: false },
      { recursiveSubmodules: true },
      { doGenerateSubmoduleConfigurations: false },
      { authorOrCommitter: false },
      { clean: false },
      { wipeOutWorkspace: false },
      { pruneBranches: false },
      { remotePoll: false },
      { ignoreNotifyCommit: false },
      { useShallowClone: false },
      { buildChooser: { _attr: { class: "hudson.plugins.git.util.DefaultBuildChooser" }} },
      { gitTool: "Default" },
      { submoduleCfg: { _attr: { class: "list" }} },
      { relativeTargetDir: {} },
      { reference: {} },
      { includedRegions: {} },
      { excludedRegions: {} },
      { excludedUsers: {} },
      { gitConfigName: {} },
      { gitConfigEmail: {} },
      { skipTag: false },
      { scmName: {} }
    ]
  }

  function scm_svn() {
    var loc = {}
    loc["hudson.scm.SubversionSCM_-ModuleLocation"] = [
      { remote: params.scm_url },
      { local: "." }
    ]

    return [
      { _attr: { class: "hudson.scm.SubversionSCM" } },
      { locations: [ loc ] },
      { includedRegions: {} },
      { excludedRegions: {} },
      { excludedUsers: {} },
      { excludedRevprop: {} },
      { excludedCommitMessages: {} },
      { workspaceUpdater: { _attr: { class: "hudson.scm.subversion.UpdateUpdater" }} }
    ]
  }

  function scm_cvs() {
    return [
      { _attr: { class: "hudson.scm.CVSSCM" } },
      { _attr: { plugin: "cvs@1.6" } },
      { cvsroot: params.scm_url },
      { module: params.scm_module },
      { branch: params.scm_branch || params.scm_tag },
      { canUseUpdate: true },
      { useHeadIfNotFound: params.scm_use_head_if_tag_not_found },
      { flatten: true },
      { isTag: (params.scm_tag != null) },
      { excludedRegions: {} }
    ]
  }
}




module.exports = function(url) {
  var api = { Error: JenkinsError, url: url }

  if (typeof api.url !== 'string' || api.url.length < 1) {
    throw error('url required')
  }

  if (api.url[api.url.length-1] === '/') {
    api.url = api.url.substring(0, api.url.length-1)
  }

  api.request = function(path, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    var defaults = function(name, value) {
      if (!opts.hasOwnProperty(name)) {
        opts[name] = value
      }
    }
    defaults('url', api.url + path)

    var doFormPost = (opts.hasOwnProperty('form_callback') 
        && typeof(opts.form_callback) == "function")

    if (opts.hasOwnProperty('body') || doFormPost) {
      opts.method = 'POST'
    } else {
      opts.method = 'GET'
      defaults('json', true)
    }

    opts.headers = opts.headers || {}
    opts.headers.referer = api.url + '/'

    var r = request(opts, function(err, res) {
      if (err) return cb(error(err, res))
      if ([401, 403, 500].indexOf(res.statusCode) >= 0) {
        return cb(error('Request failed, possibly authentication issue (' +
                  res.statusCode + ')', res))
      }
      cb(err, res)
    })

    if(doFormPost) {
      opts.form_callback(r.form())
    }
  }

  //
  // general
  //

  api.get = function(cb) {
    api.request('/api/json', function(err, res) {
      if (err) return cb(err)
      cb(null, res.body)
    })
  }

  //
  // build
  //

  api.build = {}

  api.build.get = function(name, number, cb) {
    var p = path('job', name, number, 'api', 'json')
      , o = { qs: { depth: 0 } }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      if (res.statusCode == 404) {
        return cb(error('job "' + name + '" build "' + number +
                  '" does not exist', res))
      }
      cb(null, res.body)
    })
  }

  api.build.stop = function(name, number, cb) {
    var o = { body: '', headers: { 'referer': api.url + '/' } }
    api.request(path('job', name, number, 'stop'), o, function(err) {
      if (err) return cb(err)
      cb()
    })
  }

  //
  // job
  //

  api.job = {}

  api.job.build = function(name, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }
    opts = opts || {}
    var p = path('job', name) + '/build'
      , o = {}
    if (opts.parameters) {
      o.qs = opts.parameters
      p += 'WithParameters'
    }
    if (opts.token) {
      if (o.qs) {
        o.qs.token = opts.token
      } else {
        o.qs = { token: opts.token }
      }
    }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      if (res.statusCode == 404) return cb(jobNotFound(name, res))
      cb()
    })
  }

  api.job.config = function(name, xml, cb) {
    var p = path('job', name, 'config.xml')
    if (typeof xml === 'function') {
      cb = xml
      api.request(p, function(err, res) {
        if (err) return cb(err)
        if (res.statusCode == 404) return cb(jobNotFound(name, res))
        cb(null, res.body)
      })
    } else {
      var o = {
        headers: { 'content-type': 'text/xml' },
        body: xml,
      }
      api.request(p, o, function(err, res) {
        if (err) return cb(err)
        if (res.statusCode == 404) return cb(jobNotFound(name, res))
        cb()
      })
    }
  }

  api.job.configFreestyle = function(name, params, cb) {
    createJobConfig(params, function(err, xml) {
      if (err) return cb(err)
      api.job.config(name, xml, cb);
    });
  }

  api.job.copy = function(srcName, dstName, cb) {
    api.job.get(srcName, function(err) {
      if (err) return cb(err)
      var o = { qs: { name: dstName, from: srcName, mode: 'copy' } }
      api.request('/createItem', o, function(err, res) {
        if (err) return cb(err)
        api.job.exists(dstName, function(err, exists) {
          if (err) return cb(err)
          if (!exists) return cb(error('create "' + dstName + '" failed'))
          cb()
        })
      })
    })
  }

  api.job.create = function(name, xml, cb) {
    api.job.exists(name, function(err, exists) {
      if (err) return cb(err)
      if (exists) return cb(error('job "' + name + '" already exists'))
      var o = {
        headers: { 'content-type': 'text/xml' },
        body: xml,
        qs: { name: name },
      }
      api.request('/createItem', o, function(err, res) {
        if (err) return cb(err)
        api.job.exists(name, function(err, exists) {
          if (err) return cb(err)
          if (!exists) return cb(error('create "' + name + '" failed'))
          cb()
        })
      })
    })
  }

  api.job.createFreestyle = function(name, params, cb) {
    createJobConfig(params, function(err, xml) {
      if (err) return cb(err)
      api.job.create(name, xml, cb);
    });
  }

  api.job.delete = function(name, cb) {
    var p = path('job', name, 'doDelete')
      , o = { body: '' }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      api.job.exists(name, function(err, exists) {
        if (err) return cb(err)
        if (exists) return cb(error('delete "' + name + '" failed'))
        cb()
      })
    })
  }

  api.job.disable = function(name, cb) {
    var p = path('job', name, 'disable')
      , o = { body: '' }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      cb()
    })
  }

  api.job.enable = function(name, cb) {
    var p = path('job', name, 'enable')
      , o = { body: '' }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      cb()
    })
  }

  api.job.exists = function(name, cb) {
    api.job.get(name, function(err) {
      if (err) {
        if (err.code == 404) return cb(null, false)
        cb(err)
      } else {
        cb(null, true)
      }
    })
  }

  api.job.get = function(name, cb) {
    var p = path('job', name, 'api', 'json')
      , o = { qs: { depth: 0 } }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      if (res.statusCode == 404) return cb(jobNotFound(name, res))
      cb(null, res.body)
    })
  }

  api.job.list = function(cb) {
    api.get(function(err, data) {
      if (err) return cb(err)
      cb(null, data.jobs)
    })
  }

  //
  // credentials management
  // 

  api.job.credentials = {}

  api.job.credentials.subversion = {}

  api.job.credentials.subversion.password = function(name, url, username, password, cb) {
    var form_callback = function(form) {
      form.append('url', url)
      form.append('kind', 'password')
      form.append('username1', username)
      form.append('password1', password)
    }

    var p = path('job', name, 'descriptorByName', 'hudson.scm.SubversionSCM', 'postCredential')
      , o = { 'form_callback': form_callback }

    api.request(p, o, function(err, res) {
      if(err) return cb(err)
      if(res.statusCode == 400) return cb(error('Failed to update Subversion credentials; verify url, username, and password'))
      cb()
    })
  }

  //
  // node
  //

  api.node = {}

  api.node.create = function(name, opts, cb) {
    opts = opts || {}
    cb(error('not implemented'))
  }

  api.node.delete = function(name, cb) {
    cb(error('not implemented'))
  }

  api.node.disable = function(name, message, cb) {
    if (typeof message === 'function') {
      cb = message
      message = ''
    }
    cb(error('not implemented'))
  }

  api.node.enable = function(name, cb) {
    cb(error('not implemented'))
  }

  api.node.exists = function(name, cb) {
    cb(error('not implemented'))
  }

  api.node.get = function(name, cb) {
    cb(error('not implemented'))
  }

  //
  // queue
  //

  api.queue = {}

  api.queue.get = function(cb) {
    var p = path('queue', 'api', 'json')
      , o = { qs: { depth: 0 } }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      cb(null, res.body)
    })
  }

  api.queue.cancel = function(number, cb) {
    var p = path('queue', 'items', number, 'cancelQueue')
      , o = { body: '' }
    api.request(p, o, function(err) {
      if (err) return cb(err)
      cb()
    })
  }

  //
  // Executor status
  // 
  //
  
  api.computer = {}
  api.computer.get = function(cb) {
    var p = path('computer', 'api', 'json')
      , o = { qs: { depth: 0 } }
    api.request(p, o, function(err, res) {
      if (err) return cb(err)
      cb(null, res.body)
    })
  }

  return api
}
