// Endfoos Foosilator

// Node StdLib Includes
const path = require('path')

// Load .env
require('envoodoo')()

// ExpressJS Includes
const express = require('express')
const helmet = require('helmet')
const bodyParser = require('body-parser')
const hbs = require('hbs')

// Setup Express
const app = express()
app.use(helmet())
app.use(bodyParser.urlencoded({
  extended: true
}))
app.set('view engine', 'hbs')
// Load partial HBS templates from /views/partials
hbs.registerPartials(path.join(__dirname, '/views/partials'))

require('./lib/hbs-helpers.js')(hbs)

// Postgresql Promise Library
const pgp = require('pg-promise')()
const db = pgp({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD
})

// Initialise Sessions
require('./lib/session.js')(app, db)

// Apply any migrations - then boot app
require('./lib/migrate.js')(db)
.then(() => {
  // Expose static files in /public
  app.use(express.static('public'))

  // League Switching Menu
  const setCurrentLeague = (req, res, next) => {
    req.session.currentLeague = req.params.league_short_name
    next()
  }
  app.use('/:league_short_name/games', setCurrentLeague)
  app.use('/:league_short_name/rankings', setCurrentLeague)
  app.use('/:league_short_name/players', setCurrentLeague)
  app.use((req, res, next) => {
    if (req.session.currentLeague) {
      db.task((task) => {
        return task.batch([
          task.oneOrNone(`
            SELECT id, name, short_name
            FROM league
            WHERE short_name=$1
              AND is_active=true
          `, [req.session.currentLeague]),
          task.any(`
            SELECT id, name, short_name
            FROM league
            WHERE is_active=true
            ORDER BY name ASC
          `)
        ])
      })
      .then((data) => {
        res.locals.currentLeague = data[0]
        res.locals.activeLeagues = data[1].map((league) => {
          return {
            id: league.id,
            name: league.name,
            short_name: league.short_name,
            isCurrentLeague: data[0] ? data[0].short_name === league.short_name : false
          }
        })
        res.locals.multipleLeagues = res.locals.activeLeagues.length > 1
        next()
      })
      .catch(next)
    } else {
      next()
    }
  })

  // Initialise routes
  require('./routes/index.js')(app, db)
  require('./routes/games.js')(app, db)
  require('./routes/rankings.js')(app, db)
  require('./routes/players.js')(app, db)
  require('./routes/leagues.js')(app, db)
  require('./routes/404.js')(app, db)

  // Listen
  app.listen(process.env.PORT || 8080, () => {
    console.log(`Foosilator listening on port ${process.env.PORT || 8080}`)
  })
})
.catch((err) => {
  console.log('Migrations Failed')
  console.error(err)
  process.exit(1)
})
