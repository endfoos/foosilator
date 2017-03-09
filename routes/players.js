module.exports = function (app, db) {
  // View list of all players
  app.get('/:league_short_name/players', (req, res) => {
    db.task((task) => {
      return task.one(
        'SELECT id, short_name FROM league WHERE short_name=$1',
        [req.params.league_short_name]
      )
      .then((league) => {
        if (!league) {
          return Promise.reject(new Error('404'))
        }
        return task.batch([
          task.manyOrNone(
            'SELECT * FROM league_player WHERE league_id=$1 AND is_active=true ORDER BY name ASC',
            [league.id]
          ),
          task.manyOrNone(
            'SELECT * FROM league_player WHERE league_id=$1 AND is_active=false ORDER BY name ASC',
            [league.id]
          )
        ])
      })
      .then((data) => {
        res.render('players', {
          players: data[0],
          inactivePlayers: data[1],
          currentPage: 'players'
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

  // Create a new player
  app.post('/:league_short_name/players', (req, res) => {
    const { name, color } = req.body
    db.task((task) => {
      return task.oneOrNone(
        'SELECT id, short_name FROM league WHERE short_name=$1',
        [req.params.league_short_name]
      )
      .then((league) => {
        if (!league) {
          return Promise.reject(new Error('404'))
        }
        return task.none(`
            INSERT INTO league_player(league_id, name, color, elo_rating)
            VALUES($1, $2, $3, (
              SELECT COALESCE(ROUND(AVG(elo_rating)), 1000)
              FROM league_player WHERE league_id=$1
            ))
          `,
          [league.id, name, color]
        )
      })
    })
    .then(() => {
      res.redirect(`/${req.params.league_short_name}/players`)
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

  // View an existing player
  app.get('/:league_short_name/players/:id', (req, res) => {
    db.task((task) => {
      return task.batch([
        task.oneOrNone(
          'SELECT id, short_name FROM league WHERE short_name=$1',
          [req.params.league_short_name]
        ),
        task.oneOrNone(
          'SELECT * FROM league_player WHERE id=$1',
          [req.params.id]
        )
      ])
      .then((data) => {
        const league = data[0]
        const player = data[1]
        if (!league || !player) {
          return Promise.reject(new Error('404'))
        }
        res.render('player', {
          player: player,
          currentPage: 'players',
          currentId: req.params.id
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

  // Modify an existing player
  app.post('/:league_short_name/players/:id', (req, res) => {
    const { name, color } = req.body
    db.task((task) => {
      return task.batch([
        task.oneOrNone(
          'SELECT id, short_name FROM league WHERE short_name=$1',
          [req.params.league_short_name]
        ),
        task.oneOrNone(
          'SELECT id, name FROM league_player WHERE id=$1',
          [req.params.id]
        )
      ])
      .then((data) => {
        const league = data[0]
        const player = data[1]
        if (!league || !player) {
          return Promise.reject(new Error('404'))
        }

        return task.none(
          'UPDATE league_player SET name=$3, color=$4 WHERE id=$1 AND league_id=$2',
          [player.id, league.id, name, color]
        )
      })
    })
    .then(() => {
      res.redirect(`/${req.params.league_short_name}/players`)
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

  // Deactivate a player
  app.post('/:league_short_name/players/:id/deactivate', (req, res) => {
    db.task((task) => {
      return task.batch([
        task.oneOrNone(
          'SELECT id, short_name FROM league WHERE short_name=$1',
          [req.params.league_short_name]
        ),
        task.oneOrNone(
          'SELECT id, name FROM league_player WHERE id=$1',
          [req.params.id]
        )
      ])
      .then((data) => {
        const league = data[0]
        const player = data[1]
        if (!league || !player) {
          return Promise.reject(new Error('404'))
        }

        return task.none(
          'UPDATE league_player SET is_active=false WHERE league_id=$1 AND id=$2',
          [league.id, player.id]
        )
      })
    })
    .then(() => {
      res.redirect(`/${req.params.league_short_name}/players`)
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

  // Reactivate a player
  app.post('/:league_short_name/players/:id/reactivate', (req, res) => {
    db.task((task) => {
      return task.batch([
        task.oneOrNone(
          'SELECT id, short_name FROM league WHERE short_name=$1',
          [req.params.league_short_name]
        ),
        task.oneOrNone(
          'SELECT id, name FROM league_player WHERE id=$1',
          [req.params.id]
        )
      ])
      .then((data) => {
        const league = data[0]
        const player = data[1]
        if (!league || !player) {
          return Promise.reject(new Error('404'))
        }

        return task.none(
          'UPDATE league_player SET is_active=true WHERE league_id=$1 AND id=$2',
          [league.id, player.id]
        )
      })
    })
    .then(() => {
      res.redirect(`/${req.params.league_short_name}/players`)
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
