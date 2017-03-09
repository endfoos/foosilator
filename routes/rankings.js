module.exports = function (app, db) {
  // Rankings Landing Page
  app.get('/:league_short_name/rankings', (req, res) => {
    let dayLimit = req.query.dayLimit ? parseInt(req.query.dayLimit, 10) : 14
    dayLimit = dayLimit < 366 && dayLimit > 0 ? dayLimit : 14
    // Multiple game limit by 2 to account for games being returned twice (once for each player)
    let gameLimit = req.query.gameLimit ? 2 * parseInt(req.query.gameLimit, 10) : 0
    gameLimit = gameLimit < 10000 && gameLimit >= 0 ? gameLimit : 0
    db.task((task) => {
      return task.oneOrNone(
        'SELECT id, name from league WHERE short_name=$1',
        [req.params.league_short_name]
      )
      .then((league) => {
        if (!league) {
          return Promise.reject(new Error('404'))
        }
        return task.batch([
          league,
          task.manyOrNone(`
            SELECT * FROM (
              SELECT
                id,
                name,
                color,
                (SELECT count(id) FROM game WHERE winner_id=league_player.id AND league_id=$1) as games_won,
                (SELECT count(id) FROM game WHERE loser_id=league_player.id AND league_id=$1) as games_lost,
                (SELECT count(id) FROM game WHERE (winner_id = league_player.id OR loser_id=league_player.id) AND league_id=$1) as total_games,
                elo_rating
              FROM league_player
              WHERE league_id=$1 AND is_active=true
              GROUP BY (id, elo_rating)
            ) as player_stats
            WHERE player_stats.total_games > 0
            ORDER BY elo_rating DESC
          `, [league.id]),
          task.manyOrNone(`
            SELECT league_player.id AS player_id, elo_change.created_at, elo_change.elo_change
            FROM league_player
            JOIN LATERAL (
              SELECT CASE
                WHEN game.winner_id=league_player.id THEN game.winner_elo_change
                WHEN game.loser_id=league_player.id THEN game.loser_elo_change
              END as elo_change,
              created_at
              FROM game
              WHERE (game.winner_id=league_player.id OR game.loser_id=league_player.id)
                AND game.league_id=$1
                AND created_at > CURRENT_DATE - ($2 * INTERVAL '1 days')
              ORDER BY game.created_at DESC
            ) elo_change ON true
            WHERE league_player.is_active=true
            ORDER BY created_at DESC
            LIMIT ${gameLimit ? '$3' : 'ALL'}
          `, [league.id, dayLimit, gameLimit])
        ])
      })
      .then((data) => {
        const league = data[0]
        const players = data[1]
        const recentGames = data[2]

        const gamesByPlayerId = {}
        const startDate = new Date()
        let endDate = new Date(startDate.getTime())
        recentGames.forEach((game) => {
          gamesByPlayerId[game.player_id] = gamesByPlayerId[game.player_id] || []
          gamesByPlayerId[game.player_id].push({
            created_at: game.created_at,
            elo_change: game.elo_change
          })
          if (game.created_at.getTime() < endDate.getTime()) {
            endDate = game.created_at
          }
        })

        endDate.setHours(endDate.getHours() - 1)

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
          gaugeData: JSON.stringify(gaugeData),
          currentPage: 'rankings',
          // Divide gameLimit by 2 again
          gameLimit: gameLimit / 2,
          dayLimit: dayLimit
        })
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
}
