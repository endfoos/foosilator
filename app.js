// Endfoos Foosilator

// Node StdLib Includes
const path = require('path')

// Load .env
require('envoodoo')()

// ExpressJS Includes
const express = require('express')
const bodyParser = require('body-parser')
const hbs = require('hbs')

// Setup Express
const app = express()
app.use(bodyParser.urlencoded({
  extended: true
}))
app.set('view engine', 'hbs')
// Load partial HBS templates from /views/partials
hbs.registerPartials(path.join(__dirname, '/views/partials'))

// Postgresql Promise Library
const pgp = require('pg-promise')()
const db = pgp({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD
})

// Elo Library
const EloJs = require('elo-js')
const elo = new EloJs()

// Expose static files in /public
app.use(express.static('public'))

// Landing page
app.get('/', (req, res) => {
  res.redirect('/games')
})

// Games played landing page
app.get('/games', (req, res) => {
  Promise.all([
    // TODO: Implement per-league landing pages
    db.one('SELECT id, name from league WHERE id=1'),
    db.manyOrNone('SELECT id, name FROM player'),
    db.manyOrNone(`
      SELECT game.id, w.name as winner_name, winner_score, l.name as loser_name, loser_score
      FROM game
      LEFT JOIN player w ON winner_id=w.id
      LEFT JOIN player l ON loser_id=l.id
      WHERE league_id = 1
      ORDER BY game.created_at DESC
      LIMIT 15
    `)
  ])
  .then((data) => {
    res.render('games', {
      league: data[0],
      players: data[1],
      latestGames: data[2]
    })
  })
  .catch((err) => {
    res.render('error', {
      error: err
    })
    console.error(err)
  })
})

// Add a new game result
app.post('/games', (req, res) => {
  const { winnerId, loserId, loserScore, leagueId } = req.body
  if (!winnerId || !loserId || !(loserScore >= 0) || !(loserScore < 8) || !leagueId || parseInt(winnerId, 10) === parseInt(loserId, 10)) {
    res.render('error', {
      error: 'Invalid game - winner, loser and loser score are required. Winner and loser cannot be the same user.'
    })
  } else {
    db.tx((t) => {
      return Promise.all([
        db.one(`
          SELECT player.id, player_to_league.id as player_to_league_id, player_to_league.elo_rating as elo_rating
          FROM player
          INNER JOIN player_to_league ON player.id=player_to_league.player_id
          WHERE
          player_to_league.league_id=$1
          AND
          player.id=$2`,
          [leagueId, winnerId]
        ),
        db.one(`
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
          db.none(
            'UPDATE player_to_league SET elo_rating=$1 WHERE player_to_league.id=$2',
            [winnerNewRating, winner.player_to_league_id]
          ),
          db.none(
            'UPDATE player_to_league SET elo_rating=$1 WHERE player_to_league.id=$2',
            [loserNewRating, loser.player_to_league_id]
          ),
          // Store game result and elo change
          db.none(
            'INSERT INTO game(winner_id, winner_score, winner_elo_change, loser_id, loser_score, loser_elo_change, league_id) values($1, $2, $3, $4, $5, $6, $7)',
            [winnerId, 8, (winnerNewRating - winner.elo_rating), loserId, loserScore, (loserNewRating - loser.elo_rating), leagueId]
          )
        ])
      })
    })
    .then(() => {
      res.redirect('/')
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
app.post('/games/:id/delete', (req, res) => {
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
        db.none(
          'UPDATE player_to_league SET elo_rating=(elo_rating - $1) WHERE player_to_league.id=$2',
          [gameForDeletion.winner_elo_change, gameForDeletion.winner_id]
        ),
        db.none(
          'UPDATE player_to_league SET elo_rating=(elo_rating - $1) WHERE player_to_league.id=$2',
          [gameForDeletion.loser_elo_change, gameForDeletion.loser_id]
        )
      ])
    })
    .then(() => {
      // Delete game
      return t.none('DELETE FROM game WHERE id=$1', [req.params.id])
    })
  }).then(() => {
    res.redirect('/')
  }).catch((err) => {
    res.render('error', {
      error: err
    })
    console.error(err)
  })
})

// Rankings Landing Page
app.get('/rankings', (req, res) => {
  Promise.all([
    // TODO: Implement per-league landing pages
    db.one('SELECT id, name from league WHERE id=1'),
    db.manyOrNone(`
      SELECT
        player.id,
        name,
        count(won.id) as games_won,
        count(lost.id) as games_lost,
        count(won.id) + count(lost.id) as total_games,
        player_to_league.elo_rating as elo_rating
      FROM player
      LEFT JOIN game won ON player.id=won.winner_id
      LEFT JOIN game lost ON player.id=lost.loser_id
      INNER JOIN player_to_league ON player_to_league.player_id=player.id
      WHERE player_to_league.league_id=1
      GROUP BY (player.id, player_to_league.elo_rating)
      ORDER BY elo_rating DESC
    `)
  ])
  .then((data) => {
    res.render('rankings', {
      league: data[0],
      players: data[1]
    })
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
})
