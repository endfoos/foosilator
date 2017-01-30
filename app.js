// Endfoos Foosilator

// Node StdLib Includes
const path = require('path')

// Load .env
require('envoodoo')()
const NODE_ENV = process.env.NODE_ENV || 'production'

// Postgresql Promise Library
const pgp = require('pg-promise')()
const db = pgp({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD
})

// Migrations
// Outer transaction t1 for entire migration sequence
db.tx((t1) => {
  // Create tracking table if it does not exist
  return t1.none(`
    CREATE TABLE IF NOT EXISTS migration(
      id bigint NOT NULL,
      name text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY(id)
    )
  `)
  .then(() => {
    // Read migrations directory
    const path = require('path')
    const fs = require('fs')
    return new Promise((resolve, reject) => {
      fs.readdir(path.join('.', 'migrations'), (err, files) => {
        if (err !== null) {
          return reject(err)
        }

        files = files.filter((file) => {
          return file.split('.').reverse()[0].toLowerCase() === 'sql'
        })

        files = files.map((file) => {
          return new Promise((resolve, reject) => {
            fs.readFile(path.join('.', 'migrations', file), 'utf8', (err, sql) => {
              if (err !== null) {
                return reject(err)
              }

              resolve({
                id: file.split('_')[0],
                name: file,
                sql: sql
              })
            })
          })
        })

        resolve(Promise.all(files))
      })
    })
  })
  .then((migrations) => {
    // Sort by id
    migrations.sort((a, b) => {
      return a.id - b.id
    })
    // Run each migration in sequence (requires a generator)
    return t1.sequence(function * () {
      // Can't yield from nested functions... wtfjs!
      for (let i = 0; i < migrations.length; i++) {
        let migration = migrations[i]
        // Each migration runs in its own inner transaction t2
        yield t1.tx((t2) => {
          return t2.oneOrNone('SELECT * FROM migration WHERE id=$1', migration.id)
          .then((existingMigration) => {
            if (!existingMigration) {
              return t2.any(migration.sql)
              .then(() => {
                console.log(`${migration.name} applied`)
                return t2.none(
                  'INSERT INTO migration(id, name) VALUES($1, $2)',
                  [migration.id, migration.name]
                )
              })
            } else {
              console.log(`${migration.name} already applied - skipping.`)
            }
          })
          .catch((err) => {
            console.log(`Error applying ${migration.name}`)
            return Promise.reject(err)
          })
        })
      }
    })
  })
})
.then(() => {
  // Boot App after successfully migrating
  // ExpressJS Includes
  const express = require('express')
  const bodyParser = require('body-parser')
  const hbs = require('hbs')

  // Setup Express
  const app = express()
  const helmet = require('helmet')
  app.use(helmet())
  const session = require('express-session')
  const cookieSettings = {
    httpOnly: true,
    secure: NODE_ENV !== 'development',
    maxAge: 14 * 86400000 // 14 days
  }
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
      // Clean up old sessions
      db.none(`
        DELETE FROM session WHERE expires_at < NOW() - INTERVAL '1 minute'
      `)
      .then(() => {
        return db.none(`
          INSERT INTO session(sid, data, expires_at)
          VALUES($1, $2, $3)
          ON CONFLICT (sid) DO UPDATE
          SET data=$2, expires_at=$3
          `,
          [sid, session, session.cookie._expires]
        )
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
  app.use(session({
    secret: 'q4IDJtrvnfCPUSVx9OxdQrufur6whFhD7rGLNrlY',
    cookie: cookieSettings,
    resave: false,
    saveUninitialized: false,
    store: new PgPromiseSessionStore()
  }))
  app.use(bodyParser.urlencoded({
    extended: true
  }))
  app.set('view engine', 'hbs')
  // Load partial HBS templates from /views/partials
  hbs.registerPartials(path.join(__dirname, '/views/partials'))
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  hbs.registerHelper('formatDate', function (d) {
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}`
  })

  // Elo Library
  const EloJs = require('elo-js')
  const elo = new EloJs()

  // Expose static files in /public
  app.use(express.static('public'))

  // Landing page
  app.get('/', (req, res) => {
    // Redirect to first league if one exists
    // otherwise redirect to league management
    db.manyOrNone('SELECT id, short_name FROM league ORDER BY created_at ASC LIMIT 1')
    .then((leagues) => {
      if (leagues.length <= 0) {
        res.redirect('/leagues')
      } else {
        res.redirect(`${leagues[0].short_name}/games`)
      }
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Games played landing page
  app.get('/:league_short_name/games', (req, res) => {
    db.one('SELECT id, name from league WHERE short_name=$1 AND is_active=true', [req.params.league_short_name])
    .then((league) => {
      return Promise.all([
        league,
        db.manyOrNone(`
          SELECT player.id, player.name
          FROM player
          INNER JOIN player_to_league ptl ON player.id=ptl.player_id
          WHERE player.is_active=true AND ptl.league_id=$1
        `, [league.id]),
        db.manyOrNone(`
          SELECT game.id, w.name as winner_name, winner_score, l.name as loser_name, loser_score
          FROM game
          LEFT JOIN player w ON winner_id=w.id
          LEFT JOIN player l ON loser_id=l.id
          WHERE league_id=$1
          ORDER BY game.created_at DESC
          LIMIT 15
        `, [league.id]),
        db.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
      ])
    })
    .then((data) => {
      // Redirect to manage players if no players in this league
      if (data[1].length <= 0) {
        res.redirect(`/leagues/${data[0].id}`)
      } else {
        const activeLeagues = data[3].map((league) => {
          return {
            name: league.name,
            short_name: league.short_name,
            isCurrentLeague: league.short_name === req.params.league_short_name
          }
        })

        res.render('games', {
          league: data[0],
          players: data[1],
          latestGames: data[2],
          currentLeague: req.params.league_short_name,
          activeLeagues: activeLeagues
        })
      }
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Add a new game result
  app.post('/:league_short_name/games', (req, res) => {
    const { winnerId, loserId, loserScore, leagueId } = req.body
    if (!winnerId || !loserId || !(loserScore >= 0) || !(loserScore < 8) || !leagueId || parseInt(winnerId, 10) === parseInt(loserId, 10)) {
      res.render('error', {
        error: 'Invalid game - winner, loser and loser score are required. Winner and loser cannot be the same user.'
      })
    } else {
      db.tx((t) => {
        return Promise.all([
          t.one(`
            SELECT player.id, player_to_league.id as player_to_league_id, player_to_league.elo_rating as elo_rating
            FROM player
            INNER JOIN player_to_league ON player.id=player_to_league.player_id
            WHERE
            player_to_league.league_id=$1
            AND
            player.id=$2`,
            [leagueId, winnerId]
          ),
          t.one(`
            SELECT player.id, player_to_league.id as player_to_league_id, player_to_league.elo_rating as elo_rating
            FROM player
            INNER JOIN player_to_league ON player.id=player_to_league.player_id
            WHERE
            player_to_league.league_id=$1
            AND
            player.id=$2`,
            [leagueId, loserId]
          )
        ])
        .then((data) => {
          const winner = data[0]
          const loser = data[1]

          // Update Elo scores
          const winnerNewRating = elo.ifWins(winner.elo_rating, loser.elo_rating)
          const loserNewRating = elo.ifLoses(loser.elo_rating, winner.elo_rating)

          return Promise.all([
            // Update Elo score for this league
            t.none(
              'UPDATE player_to_league SET elo_rating=$1 WHERE player_to_league.id=$2',
              [winnerNewRating, winner.player_to_league_id]
            ),
            t.none(
              'UPDATE player_to_league SET elo_rating=$1 WHERE player_to_league.id=$2',
              [loserNewRating, loser.player_to_league_id]
            ),
            // Store game result and elo change
            t.none(
              'INSERT INTO game(winner_id, winner_score, winner_elo_change, loser_id, loser_score, loser_elo_change, league_id) values($1, $2, $3, $4, $5, $6, $7)',
              [winnerId, 8, (winnerNewRating - winner.elo_rating), loserId, loserScore, (loserNewRating - loser.elo_rating), leagueId]
            )
          ])
        })
      })
      .then(() => {
        res.redirect(`/${req.params.league_short_name}/games`)
      })
      .catch((err) => {
        res.render('error', {
          error: err
        })
        console.error(err)
      })
    }
  })

  // Delete the latest game result
  app.post('/:league_short_name/games/:id/delete', (req, res) => {
    db.tx((t) => {
      // Check target game exists
      return t.one('SELECT id, league_id FROM game WHERE id=$1', [req.params.id])
      .then((targetGame) => {
        // Fetch latest game from this games league
        return t.one(
          'SELECT id, league_id, winner_id, winner_elo_change, loser_id, loser_elo_change, created_at FROM game WHERE league_id=$1 ORDER BY created_at DESC LIMIT 1',
          [targetGame.league_id]
        )
      })
      .then((latestGameInLeague) => {
        // Check target game is latest game in its league
        if (parseInt(latestGameInLeague.id, 10) !== parseInt(req.params.id, 10)) {
          return Promise.reject(new Error('Cannot delete a game that is not the latest game for that league.'))
        }
        return latestGameInLeague
      })
      .then((gameForDeletion) => {
        // Update player Elo Ratings to revert score changes
        return Promise.all([
          t.none(
            `UPDATE player_to_league SET elo_rating=(elo_rating - $1)
            WHERE player_to_league.player_id=$2
              AND player_to_league.league_id=$3
            `,
            [gameForDeletion.winner_elo_change, gameForDeletion.winner_id, gameForDeletion.league_id]
          ),
          t.none(
            `UPDATE player_to_league SET elo_rating=(elo_rating - $1)
            WHERE player_to_league.player_id=$2
              AND player_to_league.league_id=$3
            `,
            [gameForDeletion.loser_elo_change, gameForDeletion.loser_id, gameForDeletion.league_id]
          )
        ])
      })
      .then(() => {
        // Delete game
        return t.none('DELETE FROM game WHERE id=$1', [req.params.id])
      })
    }).then(() => {
      res.redirect(`/${req.params.league_short_name}/games`)
    }).catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Rankings Landing Page
  app.get('/:league_short_name/rankings', (req, res) => {
    db.one('SELECT id, name from league WHERE short_name=$1', [req.params.league_short_name])
    .then((league) => {
      return Promise.all([
        league,
        db.manyOrNone(`
          SELECT
            player.id,
            name,
            color,
            (SELECT count(id) FROM game WHERE winner_id=player.id AND league_id=$1) as games_won,
            (SELECT count(id) FROM game WHERE loser_id=player.id AND league_id=$1) as games_lost,
            (SELECT count(id) FROM game WHERE (winner_id = player.id OR loser_id=player.id) AND league_id=$1) as total_games,
            player_to_league.elo_rating as elo_rating
          FROM player
          INNER JOIN player_to_league ON player_to_league.player_id=player.id
          WHERE player_to_league.league_id=$1
          GROUP BY (player.id, player_to_league.elo_rating)
          ORDER BY elo_rating DESC
        `, [league.id]),
        db.manyOrNone(`
          SELECT player.id AS player_id, elo_change.created_at, elo_change.elo_change
          FROM PLAYER
          JOIN LATERAL (
            SELECT CASE
              WHEN game.winner_id=player.id THEN game.winner_elo_change
              WHEN game.loser_id=player.id THEN game.loser_elo_change
            END as elo_change,
            created_at
            FROM game
            WHERE (game.winner_id=player.id OR game.loser_id=player.id)
              AND game.league_id=$1
              AND created_at > CURRENT_DATE - INTERVAL '14 days'
            ORDER BY game.created_at DESC
          ) elo_change ON true
          ORDER BY player.id
        `, [league.id]),
        db.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
      ])
    })
    .then((data) => {
      const league = data[0]
      const players = data[1]
      const lastTengames = data[2]
      const activeLeagues = data[3].map((league) => {
        return {
          name: league.name,
          short_name: league.short_name,
          isCurrentLeague: league.short_name === req.params.league_short_name
        }
      })

      const gamesByPlayerId = {}
      lastTengames.forEach((game) => {
        gamesByPlayerId[game.player_id] = gamesByPlayerId[game.player_id] || []
        gamesByPlayerId[game.player_id].push({
          created_at: game.created_at,
          elo_change: game.elo_change
        })
      })

      const startDate = new Date()
      const endDate = new Date(startDate.getTime())
      endDate.setDate(endDate.getDate() - 14)

      // Map of player_id -> [{player_name, elo_rating, date}]
      const playerEloSeries = {}
      players.forEach((player) => {
        // Initialize array
        // Current elo ranking is from last game to current time
        playerEloSeries[player.id] = [
          {
            player_name: player.name,
            color: player.color,
            elo_rating: player.elo_rating,
            date: startDate
          }
        ]
        // If they have a last game then use this for next interval at current rank
        const lastGames = gamesByPlayerId[player.id]
        if (lastGames) {
          playerEloSeries[player.id].push(
            {
              player_name: player.name,
              color: player.color,
              elo_rating: player.elo_rating,
              date: gamesByPlayerId[player.id][0].created_at
            }
          )
          // Iterate over last games
          for (var i = 0; i < lastGames.length; i++) {
            playerEloSeries[player.id].push(
              {
                player_name: player.name,
                color: player.color,
                elo_rating: playerEloSeries[player.id][playerEloSeries[player.id].length - 1].elo_rating - lastGames[i].elo_change,
                date: lastGames[i + 1] ? lastGames[i + 1].created_at : endDate
              }
            )
          }
        } else {
          // Append an end value
          playerEloSeries[player.id].push(
            {
              player_name: player.name,
              color: player.color,
              elo_rating: playerEloSeries[player.id][playerEloSeries[player.id].length - 1].elo_rating,
              date: endDate
            }
          )
        }
        // Reverse so time goes forward
        playerEloSeries[player.id].reverse()
      })

      const gaugeData = []
      for (var i = 0; i < players.length && i < 4; i++) {
        gaugeData[i] = {
          name: players[i].name,
          color: players[i].color,
          title: 'Games Won',
          value: players[i].games_won / players[i].total_games
        }
      }

      res.render('rankings', {
        league: league,
        players: players,
        playerEloSeries: JSON.stringify(playerEloSeries),
        currentLeague: req.params.league_short_name,
        currentPage: '/rankings',
        activeLeagues: activeLeagues,
        gaugeData: JSON.stringify(gaugeData)
      })
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // View list of all players
  app.get('/players', (req, res) => {
    Promise.all([
      db.manyOrNone('SELECT * FROM player WHERE is_active=true ORDER BY created_at DESC'),
      db.manyOrNone('SELECT * FROM player WHERE is_active=false ORDER BY created_at DESC'),
      db.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
    ])
    .then((data) => {
      res.render('players', {
        players: data[0],
        inactivePlayers: data[1],
        activeLeagues: data[2]
      })
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Create a new player
  app.post('/players', (req, res) => {
    const { name, color } = req.body
    db.none('INSERT INTO player(name, color) VALUES($1, $2)', [name, color])
    .then(() => {
      res.redirect('/players')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // View an existing player
  app.get('/players/:id', (req, res) => {
    Promise.all([
      db.one('SELECT * FROM player WHERE id=$1', [req.params.id]),
      db.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
    ])
    .then((data) => {
      res.render('player', {
        player: data[0],
        activeLeagues: data[1]
      })
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Modify an existing player
  app.post('/players/:id', (req, res) => {
    const { name, color } = req.body
    db.none('UPDATE player SET name=$1, color=$2 WHERE id=$3', [name, color, req.params.id])
    .then(() => {
      res.redirect('/players')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Deactivate a player
  app.post('/players/:id/deactivate', (req, res) => {
    db.none('UPDATE player SET is_active=false WHERE id=$1', [req.params.id])
    .then(() => {
      res.redirect('/players')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Reactivate a player
  app.post('/players/:id/reactivate', (req, res) => {
    db.none('UPDATE player SET is_active=true WHERE id=$1', [req.params.id])
    .then(() => {
      res.redirect('/players')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // View list of all leagues
  app.get('/leagues', (req, res) => {
    Promise.all([
      db.manyOrNone('SELECT * FROM league WHERE is_active=true ORDER BY created_at DESC'),
      db.manyOrNone('SELECT * FROM league WHERE is_active=false ORDER BY created_at DESC')
    ])
    .then((data) => {
      res.render('leagues', {
        leagues: data[0],
        inactiveLeagues: data[1],
        // Include it again for the nav menu
        activeLeagues: data[0]
      })
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Create a new league
  app.post('/leagues', (req, res) => {
    const { name, shortName } = req.body
    db.none('INSERT INTO league(name, short_name) VALUES($1, $2)', [name, shortName])
    .then(() => {
      res.redirect('/leagues')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // View an existing league
  app.get('/leagues/:id', (req, res) => {
    Promise.all([
      db.one('SELECT * FROM league WHERE id=$1', [req.params.id]),
      db.manyOrNone(`
        SELECT player.id, player.name, player.color, ptl.elo_rating as elo_rating
        FROM player
        INNER JOIN player_to_league ptl ON player.id=ptl.player_id
        WHERE ptl.league_id=$1 AND player.is_active=true
        ORDER BY ptl.elo_rating DESC
      `, [req.params.id]),
      db.manyOrNone(`
        SELECT * FROM player WHERE player.id NOT IN (
          SELECT player.id
          FROM player
          INNER JOIN player_to_league ptl ON player.id=ptl.player_id
          WHERE ptl.league_id=$1
        ) AND player.is_active=true
      `, [req.params.id]),
      db.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
    ])
    .then((data) => {
      res.render('league', {
        league: data[0],
        currentPlayers: data[1],
        unaffiliatedPlayers: data[2],
        activeLeagues: data[3]
      })
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Add an existing player to this league
  app.post('/leagues/:id/players', (req, res) => {
    // Insert with an average Elo rating for this league
    db.none(
      'INSERT INTO player_to_league(league_id, player_id, elo_rating) VALUES($1, $2, (SELECT COALESCE(ROUND(AVG(elo_rating)), 1000) FROM player_to_league WHERE league_id=$1))',
      [req.params.id, req.body.playerId]
    ).then(() => {
      res.redirect(`/leagues/${req.params.id}`)
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Remove a player from this league
  app.post('/leagues/:leagueId/players/:playerId/delete', (req, res) => {
    db.none(
      'DELETE FROM player_to_league WHERE league_id=$1 AND player_id=$2',
      [req.params.leagueId, req.params.playerId]
    ).then(() => {
      res.redirect(`/leagues/${req.params.leagueId}`)
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Modify an existing league
  app.post('/leagues/:id', (req, res) => {
    const { name, shortName } = req.body
    db.none('UPDATE league SET name=$1, short_name=$2 WHERE id=$3', [name, shortName, req.params.id])
    .then(() => {
      res.redirect('/leagues')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Deactivate a league
  app.post('/leagues/:id/deactivate', (req, res) => {
    db.none('UPDATE league SET is_active=false WHERE id=$1', [req.params.id])
    .then(() => {
      res.redirect('/leagues')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Reactivate a league
  app.post('/leagues/:id/reactivate', (req, res) => {
    db.none('UPDATE league SET is_active=true WHERE id=$1', [req.params.id])
    .then(() => {
      res.redirect('/leagues')
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  app.get('*', (req, res) => {
    res.render('404')
  })

  app.listen(process.env.PORT || 8080, () => {
    console.log(`Foosilator listening on port ${process.env.PORT || 8080}`)
    console.log(`NODE_ENV=${NODE_ENV}`)
  })
})
.catch((err) => {
  // Catch failing migration on app start
  console.log('Rolling back...')
  console.error(err)
  process.exit(1)
})
