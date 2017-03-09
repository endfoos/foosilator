const bcrypt = require('bcryptjs')

module.exports = function (app, db) {
  // View list of all leagues
  app.get('/leagues', (req, res) => {
    const userId = req.user.id
    db.task((task) => {
      return task.batch([
        task.manyOrNone(`
            SELECT id, name, short_name, max_score, created_at
            FROM league
            WHERE is_active=true AND owner_id=$1
            ORDER BY created_at DESC
          `,
          [userId]
        ),
        task.manyOrNone(`
            SELECT id, name, short_name, max_score, created_at
            FROM league
            WHERE is_active=false AND owner_id=$1
            ORDER BY created_at DESC
          `,
          [userId]
        )
      ])
    })
    .then((data) => {
      res.render('leagues', {
        leagues: data[0],
        inactiveLeagues: data[1],
        currentPage: 'leagues'
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
    const { name, shortName, maxScore, leaguePassword } = req.body
    const userId = req.user.id
    new Promise((resolve, reject) => {
      if (leaguePassword) {
        bcrypt.hash(leaguePassword, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10))
        .then((leaguePasswordHash) => {
          return db.none(`
              INSERT INTO league(name, short_name, max_score, password, owner_id)
              VALUES($1, $2, $3, $4, $5)
            `,
            [name, shortName, maxScore, leaguePasswordHash, userId]
          )
        })
        .then(resolve)
        .catch(reject)
      } else {
        db.none(
          'INSERT INTO league(name, short_name, max_score, owner_id) VALUES($1, $2, $3, $4)',
          [name, shortName, maxScore, userId]
        )
        .then(resolve)
        .catch(reject)
      }
    })
    .then(() => {
      // Make this the current league if one does not already exist
      if (!req.session.currentLeague) {
        req.session.currentLeague = shortName
      }
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
    db.oneOrNone(`
        SELECT id, name, short_name, max_score,
          CASE WHEN password IS NULL THEN False ELSE True END has_password
        FROM league WHERE id=$1
      `,
      [req.params.id]
    )
    .then((league) => {
      if (!league) {
        return Promise.reject(new Error('404'))
      }
      res.render('league', {
        league: league,
        currentPage: 'leagues',
        currentId: req.params.id
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

  // Modify an existing league
  app.post('/leagues/:id', (req, res) => {
    const { name, shortName, maxScore } = req.body
    db.none(
      'UPDATE league SET name=$1, short_name=$2, max_score=$3 WHERE id=$4',
      [name, shortName, maxScore, req.params.id]
    )
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

  // Update a league's password
  app.post('/leagues/:id/password', (req, res) => {
    const { currentPassword, removePassword, newPassword, newPasswordConfirm } = req.body
    db.task((task) => {
      return task.one(`
          SELECT id, password FROM league WHERE id=$1
        `,
        [req.params.id]
      )
      .then((league) => {
        if (league.password) {
          return bcrypt.compare(currentPassword, league.password)
        } else {
          return Promise.resolve(true)
        }
      })
      .then((result) => {
        if (result !== true) {
          return Promise.reject(new Error('Current Password was incorrect'))
        }

        if (removePassword === 'true') {
          return task.none(`
            UPDATE league SET password = NULL WHERE id=$1
            `,
            [req.params.id]
          )
        } else {
          if (newPassword !== newPasswordConfirm) {
            return Promise.reject(new Error('New Password does not match Confirm Field'))
          } else if (!newPassword) {
            return Promise.reject(new Error('League Password cannot be blank'))
          } else {
            return bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10))
            .then((leaguePasswordHash) => {
              return task.none(`
                  UPDATE league SET password=$1 WHERE id=$2
                `,
                [leaguePasswordHash, req.params.id]
              )
            })
          }
        }
      })
    })
    .then(() => {
      res.redirect(`/leagues`)
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  app.post('/leagues/:id/owner', (req, res) => {
    const newOwnerId = req.body.ownerId
    db.none(`
        UPDATE league SET owner_id=$1 WHERE id=$2
      `,
      [newOwnerId, req.params.id]
    )
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

  // Reset a league
  app.post('/leagues/:id/reset', (req, res) => {
    db.tx((transaction) => {
      return transaction.one(`
          SELECT id, short_name FROM league WHERE id=$1
        `,
        [req.params.id]
      )
      .then((league) => {
        if (league.short_name !== req.body.shortName) {
          return Promise.reject(new Error('Short Name did not match - league has not been reset!'))
        } else {
          return transaction.batch([
            transaction.none(`
                UPDATE league_player
                SET elo_rating=1000
                WHERE league_id=$1
              `,
              [league.id]
            ),
            transaction.none(`
                DELETE FROM game
                WHERE league_id=$1
              `,
              [league.id]
            )
          ])
        }
      })
    })
    .then(() => {
      res.redirect(`/leagues`)
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })

  // Switch to using a league
  app.get('/leagues/:id/switch', (req, res) => {
    db.one('SELECT id, short_name FROM league WHERE id=$1', [req.params.id])
    .then((league) => {
      // Set current league
      req.session.currentLeague = league.short_name
      // Redirect to requested page or to / if none request
      const requestedPage = req.query.page ? req.query.page.toLowerCase() : ''
      switch (requestedPage) {
        case 'games':
          res.redirect(`/${league.short_name}/games`)
          break
        case 'rankings':
          res.redirect(`/${league.short_name}/rankings`)
          break
        case 'players':
          if (req.query.id) {
            res.redirect(`/${league.short_name}/players/${req.query.id}`)
          } else {
            res.redirect(`/${league.short_name}/players`)
          }
          break
        case 'leagues':
          if (req.query.id) {
            res.redirect(`/leagues/${req.query.id}`)
          } else {
            res.redirect('/leagues')
          }
          break
        default:
          res.redirect('/')
      }
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })
}
