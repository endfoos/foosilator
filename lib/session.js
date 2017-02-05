const session = require('express-session')

const NODE_ENV = process.env.NODE_ENV
const cookieSettings = {
  httpOnly: true,
  secure: NODE_ENV !== 'development',
  maxAge: 14 * 86400000 // 14 days
}

module.exports = function (app, db) {
  // Defines a session store using the exiting db connection
  class PgPromiseSessionStore extends session.Store {
    destroy (sid, callback) {
      db.none('DELETE FROM session WHERE sid=$1', [sid])
      .then(callback)
      .catch(callback)
    }
    get (sid, callback) {
      db.any('SELECT data FROM session WHERE sid=$1', [sid])
      .then((results) => {
        if (results[0]) {
          callback(null, results[0].data)
        } else {
          callback()
        }
      })
      .catch(callback)
    }
    set (sid, session, callback) {
      db.task((task) => {
        // Clean up old sessions
        // TODO: Reduce frequency of cleanups - possibly with pgAgent
        return task.none(`
          DELETE FROM session WHERE expires_at < NOW() - INTERVAL '1 minute'
        `)
        .then(() => {
          return task.none(`
            INSERT INTO session(sid, data, expires_at)
            VALUES($1, $2, $3)
            ON CONFLICT (sid) DO UPDATE
            SET data=$2, expires_at=$3
            `,
            [sid, session, session.cookie._expires]
          )
        })
      })
      .then(callback)
      .catch(callback)
    }
    touch (sid, session, callback) {
      db.none(
        'UPDATE session SET expires_at=$2 WHERE sid=$1',
        [sid, session.cookie._expires]
      )
      .then(callback)
      .catch(callback)
    }
  }

  // Initialise express-session using new store
  app.use(session({
    secret: process.env.SESSION_SECRET,
    name: 'foosilatorSid',
    cookie: cookieSettings,
    resave: false,
    saveUninitialized: false,
    store: new PgPromiseSessionStore()
  }))
}
