module.exports = function (app, db) {
  // View list of all players
  app.get('/players', (req, res) => {
    db.task((task) => {
      return task.batch([
        task.manyOrNone('SELECT * FROM player WHERE is_active=true ORDER BY created_at DESC'),
        task.manyOrNone('SELECT * FROM player WHERE is_active=false ORDER BY created_at DESC'),
        task.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
      ])
      .then((data) => {
        res.render('players', {
          players: data[0],
          inactivePlayers: data[1],
          activeLeagues: data[2]
        })
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
    db.task((task) => {
      return task.batch([
        task.one('SELECT * FROM player WHERE id=$1', [req.params.id]),
        task.manyOrNone('SELECT id, name, short_name FROM league WHERE is_active=true ORDER BY name ASC')
      ])
    })
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
}
