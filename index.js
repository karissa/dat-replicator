var protocol = require('dat-replication-protocol')
var through = require('through2')

var STREAM_OPTS = {highWaterMark:16}

var replication = function(dat) {
  var that = {}

  that.createPushStream = that.send = function() {
    var p = protocol()

    var writeAttachments = function(attachments, cb) {
      if (!attachments) return cb()

      var keys = Object.keys(attachments)
      var loop = function() {
        if (!keys.length) return cb()
        var bl = attachments[keys.shift()]
        dat.blobs.createReadStream(bl.hash).pipe(p.blob(bl.size, cb))
      }

      loop()
    }

    var write = function(doc, enc, cb) {
      writeAttachments(doc.data.attachments, function(err) {
        if (err) return cb(err)
        p.document(doc.data, cb)
      })
    }

    var flush = function(cb) {
      p.finalize()
      cb()
    }

    var ready = function(meta) {
      var rs = dat.createChangesStream({
        since: meta.change,
        data: true
      })

      rs.pipe(through.obj(STREAM_OPTS, write, flush))
    }

    p.on('meta', function(meta, cb) {
      ready(meta)
      cb()
    })

    return p
  }

  that.createPullStream = that.receive = function() {
    var p = protocol()
    var ws = dat.createWriteStream({objects:true})

    p.meta({
      change: dat.storage.change,
      schema: dat.schema.toJSON()
    })

    p.on('blob', function(blob, cb) {
      blob.pipe(dat.blobs.createWriteStream(cb))
    })

    p.on('document', function(doc, cb) {
      ws.write(doc, cb)
    })

    p.on('finish', function() {
      ws.end(function() {
        p.finalize()
      })
    })

    return p
  }

  return that
}

module.exports = replication