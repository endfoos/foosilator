const bcrypt = require('bcryptjs')

module.exports = function (app, db) {
  const checkLeaguePassword = (req, res, next) => {
    const leagueShortName = req.params.league_short_name
    db.one('SELECT id, password FROM league WHERE short_name=$1', [leagueShortName])
    .then((league) => {
      if (!league.password) {
        // If league has no password set then continue
        return next()
      } else if (req.session.leaguePublicAccess &&
        // If user has already validated
        req.session.leaguePublicAccess[leagueShortName]) {
        const expiry = new Date(req.session.leaguePublicAccess[leagueShortName].expiry)
        const now = new Date(Date.now())
        if (expiry >= now) {
          // Continue
          return next()
        } else {
          delete req.session.leaguePublicAccess[leagueShortName]
        }
      }

      // User must enter password
      res.redirect(`/auth/leagueAccess?league=${leagueShortName}&page=${req.baseUrl}`)
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  }

  app.use('/:league_short_name/games', checkLeaguePassword)
  app.use('/:league_short_name/rankings', checkLeaguePassword)

  app.get('/auth/leagueAccess', (req, res) => {
    const leagueShortName = req.query.league
    const page = req.query.page

    db.one('SELECT id, name FROM league WHERE short_name=$1', [leagueShortName])
    .then((league) => {
      res.render('auth/leagueAccess', {
        league: league,
        page: page
      })
    })
  })

  app.post('/auth/leagueAccess', (req, res) => {
    const { leagueId, leaguePassword, page } = req.body
    db.one('SELECT id, name, short_name, password FROM league WHERE id=$1', [leagueId])
    .then((league) => {
      return bcrypt.compare(leaguePassword, league.password)
      .then((result) => {
        if (result === true) {
          // 24 Hour Expiry
          const expiry = new Date(Date.now())
          expiry.setDate(expiry.getDate() + 1)
          req.session.leaguePublicAccess = req.session.leaguePublicAccess || {}
          req.session.leaguePublicAccess[league.short_name] = {
            expiry: expiry
          }
          res.redirect(page)
        } else {
          res.render('auth/leagueAccess', {
            // Don't leak password hash
            league: {
              id: league.id,
              name: league.name
            },
            page: page,
            errors: {
              leaguePassword: 'Invalid Password'
            }
          })
        }
      })
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })
}
