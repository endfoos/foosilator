module.exports = function (app, db) {
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
}
