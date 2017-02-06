// Elo Library
const EloJs = require('elo-js')
const elo = new EloJs()

module.exports = function (app, db) {
   // Games played landing page
  app.get('/:league_short_name/games', (req, res) => {
    db.task((task) => {
      return task.oneOrNone(
        'SELECT id, max_score from league WHERE short_name=$1 AND is_active=true',
        [req.params.league_short_name]
      )
      .then((league) => {
        if (!league) {
          return Promise.reject(new Error('404'))
        }
        return task.batch([
          league,
          task.manyOrNone(`
            SELECT player.id, player.name
            FROM player
            INNER JOIN player_to_league ptl ON player.id=ptl.player_id
            WHERE player.is_active=true AND ptl.league_id=$1
          `, [league.id]),
          task.manyOrNone(`
            SELECT game.id, w.name as winner_name, winner_score, l.name as loser_name, loser_score
            FROM game
            LEFT JOIN player w ON winner_id=w.id
            LEFT JOIN player l ON loser_id=l.id
            WHERE league_id=$1
            ORDER BY game.created_at DESC
            LIMIT 15
          `, [league.id])
        ])
      })
      .then((data) => {
        // Redirect to manage players if no players in this league
        if (data[1].length <= 0) {
          res.redirect(`/leagues/${data[0].id}`)
        } else {
          res.render('games', {
            league: data[0],
            players: data[1],
            latestGames: data[2],
            currentPage: 'games'
          })
        }
      })
    })
    .catch((err) => {
      if (err.message === '404') {
        res.redirect('/404')
      } else {
        res.render('error', {
          error: err
        })
        console.error(err)
      }
    })
  })

  // Add a new game result
  app.post('/:league_short_name/games', (req, res) => {
    const { winnerId, loserId, loserScore } = req.body
    if (!winnerId || !loserId || !(loserScore >= 0) || parseInt(winnerId, 10) === parseInt(loserId, 10)) {
      res.render('error', {
        error: 'Invalid game - winner, loser and loser score are required. Winner and loser cannot be the same user.'
      })
    } else {
      db.tx((transaction) => {
        return transaction.one(`
            SELECT id, max_score
            FROM league
            WHERE short_name=$1
          `,
          [req.params.league_short_name]
        )
        .then((league) => {
          if (loserScore > league.max_score) {
            return Promise.reject(new Error('Invalid loser score'))
          }
          return transaction.batch([
            transaction.one(`
                SELECT player.id, player_to_league.id as player_to_league_id, player_to_league.elo_rating as elo_rating
                FROM player
                INNER JOIN player_to_league ON player.id=player_to_league.player_id
                WHERE player_to_league.league_id=$1
                  AND player.id=$2
              `,
              [league.id, winnerId]
            ),
            transaction.one(`
                SELECT player.id, player_to_league.id as player_to_league_id, player_to_league.elo_rating as elo_rating
                FROM player
                INNER JOIN player_to_league ON player.id=player_to_league.player_id
                WHERE player_to_league.league_id=$1
                  AND player.id=$2`,
              [league.id, loserId]
            ),
            league
          ])
        })
        .then((data) => {
          const winner = data[0]
          const loser = data[1]
          const league = data[2]

          // Update Elo scores
          const winnerNewRating = elo.ifWins(winner.elo_rating, loser.elo_rating)
          const loserNewRating = elo.ifLoses(loser.elo_rating, winner.elo_rating)

          return transaction.batch([
            // Update Elo score for this league
            transaction.none(
              'UPDATE player_to_league SET elo_rating=$1 WHERE player_to_league.id=$2',
              [winnerNewRating, winner.player_to_league_id]
            ),
            transaction.none(
              'UPDATE player_to_league SET elo_rating=$1 WHERE player_to_league.id=$2',
              [loserNewRating, loser.player_to_league_id]
            ),
            // Store game result and elo change
            transaction.none(`
              INSERT INTO game(
                winner_id,
                winner_score,
                winner_elo_change,
                loser_id,
                loser_score,
                loser_elo_change,
                league_id
              )
              VALUES($1, $2, $3, $4, $5, $6, $7)
              `, [
                winnerId,
                league.max_score,
                (winnerNewRating - winner.elo_rating),
                loserId,
                loserScore,
                (loserNewRating - loser.elo_rating),
                league.id
              ]
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
    db.tx((transaction) => {
      // Check target game exists
      return transaction.one('SELECT id, league_id FROM game WHERE id=$1', [req.params.id])
      .then((targetGame) => {
        // Fetch latest game from this games league
        return transaction.one(`
            SELECT id, league_id, winner_id, winner_elo_change, loser_id, loser_elo_change, created_at
            FROM game WHERE league_id=$1
            ORDER BY created_at
            DESC LIMIT 1
          `,
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
        return transaction.batch([
          transaction.none(`
              UPDATE player_to_league SET elo_rating=(elo_rating - $1)
              WHERE player_to_league.player_id=$2
                AND player_to_league.league_id=$3
            `,
            [gameForDeletion.winner_elo_change, gameForDeletion.winner_id, gameForDeletion.league_id]
          ),
          transaction.none(`
              UPDATE player_to_league SET elo_rating=(elo_rating - $1)
              WHERE player_to_league.player_id=$2
                AND player_to_league.league_id=$3
            `,
            [gameForDeletion.loser_elo_change, gameForDeletion.loser_id, gameForDeletion.league_id]
          )
        ])
      })
      .then(() => {
        // Delete game
        return transaction.none('DELETE FROM game WHERE id=$1', [req.params.id])
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
}
