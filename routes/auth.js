const bcrypt = require('bcryptjs')
const passport = require('passport')
const PassportLocalStrategy = require('passport-local').Strategy
const PassportGoogleStrategy = require('passport-google-oauth20').Strategy
const PassportFacebookStrategy = require('passport-facebook').Strategy

// Returns a safe subset of user fields for templates
const userPublicFields = (userData) => {
  return {
    id: userData.id,
    name: userData.name,
    hasEmail: Boolean(userData.email && userData.password),
    hasFacebook: Boolean(userData.facebook_id),
    hasGoogle: Boolean(userData.google_id)
  }
}

module.exports = function (app, db) {
  // Configure an email/password strategy
  passport.use(new PassportLocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    (email, password, done) => {
      db.oneOrNone(`
        SELECT * FROM foosilator_user
        WHERE email=$1
        `,
        [email]
      )
      .then((user) => {
        if (!user) {
          return done(null, false)
        } else {
          return bcrypt.compare(password, user.password)
          .then((passwordIsCorrect) => {
            if (!passwordIsCorrect) {
              return done(null, false)
            } else {
              return done(null, userPublicFields(user))
            }
          })
        }
      })
      .catch(done)
    }
  ))

  // Configure a Facebook strategy
  passport.use(new PassportFacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL
    },
    (accessToken, refreshToken, profile, done) => {
      db.task((task) => {
        return task.oneOrNone(`
          SELECT * FROM foosilator_user
          where facebook_id=$1
          `,
          [profile.id]
        )
        .then((user) => {
          // Create new user
          if (!user) {
            return task.one(`
              INSERT INTO foosilator_user(name, facebook_id) VALUES($1, $2) RETURNING *
              `,
              [profile.displayName, profile.id]
            )
          } else {
            return Promise.resolve(user)
          }
        })
      })
      .then((user) => {
        return done(null, userPublicFields(user))
      })
      .catch(done)
    }
  ))

  // Configure a Goole strategy
  passport.use(new PassportGoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    (accessToken, refreshToken, profile, done) => {
      db.task((task) => {
        return task.oneOrNone(`
          SELECT * FROM foosilator_user
          where google_id=$1
          `,
          [profile.id]
        )
        .then((user) => {
          // Create new user
          if (!user) {
            return task.one(`
              INSERT INTO foosilator_user(name, google_id) VALUES($1, $2) RETURNING *
              `,
              [profile.displayName, profile.id]
            )
          } else {
            return Promise.resolve(user)
          }
        })
      })
      .then((user) => {
        return done(null, userPublicFields(user))
      })
      .catch(done)
    }
  ))

  passport.serializeUser((user, done) => {
    done(null, user.id)
  })

  passport.deserializeUser((id, done) => {
    db.oneOrNone('SELECT * FROM foosilator_user WHERE id=$1', [id])
    .then((user) => {
      done(null, userPublicFields(user))
    })
    .catch(done)
  })

  app.use(passport.initialize())
  app.use(passport.session())

  // Pass user object to templates
  app.use(function (req, res, next) {
    res.locals.user = req.user
    next()
  })

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
            SELECT id, name, short_name, owner_id
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
        res.locals.currentLeague = data[0] ? {
          id: data[0].id,
          name: data[0].name,
          short_name: data[0].short_name,
          canManage: req.user && req.user.id === data[0].owner_id
        } : null
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

  // Login landing page
  app.get('/auth/login', (req, res) => {
    res.render('auth/login')
  })

  // Login with email/password
  app.post(
    '/auth/login',
    passport.authenticate(
      'local',
      {
        failureRedirect: '/auth/login'
      }
    ),
    (req, res) => {
      if (req.session.attemptedUrl) {
        const attemptedUrl = req.session.attemptedUrl
        delete req.session.attemptedUrl
        res.redirect(attemptedUrl)
      } else {
        res.redirect('/')
      }
    }
  )

  // Login with Google
  app.get(
    '/auth/google',
    passport.authenticate(
      'google',
      {
        scope: ['https://www.googleapis.com/auth/plus.login'],
        prompt: 'select_account'
      }
    )
  )

  // Google OAuth2 Callback
  app.get(
    '/auth/google/callback',
    passport.authenticate(
      'google',
      { failureRedirect: '/login' }
    ),
    (req, res) => {
      if (req.session.attemptedUrl) {
        const attemptedUrl = req.session.attemptedUrl
        delete req.session.attemptedUrl
        res.redirect(attemptedUrl)
      } else {
        res.redirect('/')
      }
    }
  )

  // Login with Facebook
  app.get(
    '/auth/facebook',
    passport.authenticate('facebook')
  )

  // Facebook OAuth2 Callback
  app.get(
    '/auth/facebook/callback',
    passport.authenticate(
      'facebook',
      {
        failureRedirect: '/login'
      }
    ),
    (req, res) => {
      if (req.session.attemptedUrl) {
        const attemptedUrl = req.session.attemptedUrl
        delete req.session.attemptedUrl
        res.redirect(attemptedUrl)
      } else {
        res.redirect('/')
      }
    }
  )

  // Create new account
  app.post('/auth/register', (req, res) => {
    let { name, email, password } = req.body
    name = name.trim()
    email = email.trim()
    const gCaptureResponse = req.body['g-recaptcha-response']
    const errors = {}
    if (name.length < 1) {
      errors.name = 'Name too short'
    }
    if (!/.+@.+/.test(email)) {
      errors.email = 'Email address invalid.'
    }
    if (password.length <= 8) {
      errors.password = 'Password must be longer than 8 characters.'
    }
    if (!gCaptureResponse) {
      errors.capture = 'Please prove you are not a bot.'
    }
    // Fail fast - then do more expensive checks
    if (Object.keys(errors).length > 0) {
      res.render('auth/login', {
        registerErrors: errors,
        registerValues: {
          email: email,
          name: name
        }
      })
    } else {
      db.oneOrNone('SELECT * FROM foosilator_user WHERE email=$1', [email])
      .then((user) => {
        if (user) {
          res.render('auth/login', {
            registerErrors: {
              email: 'This email address has already been registered.'
            },
            registerValues: {
              email: email,
              name: name
            }
          })
        } else {
          // Validate Google Capture
          return new Promise((resolve, reject) => {
            const https = require('https')
            const querystring = require('querystring')

            const postData = querystring.stringify({
              secret: process.env.GOOGLE_RECAPTCHA_SECRET,
              response: gCaptureResponse
            })

            const requestOptions = {
              hostname: 'www.google.com',
              path: '/recaptcha/api/siteverify',
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
              }
            }

            const req = https.request(requestOptions, (res) => {
              res.setEncoding('utf8')
              let data = ''
              res.on('data', (chunk) => {
                data += chunk
              })
              res.on('end', () => {
                try {
                  const result = JSON.parse(data)

                  if (!result.success) {
                    return reject(new Error('Google Capture Error'))
                  }
                  resolve()
                } catch (err) {
                  return reject(err)
                }
              })
            })

            req.on('error', (err) => {
              reject(err)
            })

            req.write(postData)
            req.end()
          })
          .then(() => {
            return bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10))
          })
          .then((hashedPassword) => {
            return db.one(`
                INSERT INTO foosilator_user(name, email, password)
                VALUES($1, $2, $3)
                RETURNING *
              `,
              [name, email, hashedPassword]
            )
          })
          .then((user) => {
            // Login user using passport
            return new Promise((resolve, reject) => {
              req.login(userPublicFields(user), (err) => {
                if (err) {
                  return reject(err)
                }
                resolve()
              })
            })
          })
          .then(() => {
            // Redirect new user to landing page
            res.redirect('/')
          })
        }
      })
      .catch((err) => {
        if (err.message === 'Google Capture Error') {
          res.render('auth/login', {
            registerErrors: {
              capture: 'Rejected'
            },
            registerValues: {
              email: email,
              name: name
            }
          })
        } else {
          res.render('error', {
            error: err
          })
          console.error(err)
        }
      })
    }
  })

  // Reset password
  app.post('/auth/resetPassword', (req, res) => {
    // TODO: Implement Emailing
    res.redirect('/')
  })

  // Logout
  app.all('/auth/logout', (req, res) => {
    req.logout()
    res.redirect('/')
  })

  // Leagues with Public Passwords
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

  // Check public password and if correct store success
  // for 24 hours in session
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

  // Check if a league requires a password, or if it has
  // alredy been entered
  const checkLeaguePassword = (req, res, next) => {
    const leagueShortName = req.params.league_short_name
    db.one('SELECT id, password, owner_id FROM league WHERE short_name=$1', [leagueShortName])
    .then((league) => {
      if (!league.password) {
        // If league has no password set then continue
        return next()
      } else if (req.user && req.user.id === league.owner_id) {
        // If this league is owned by logged in user
        return next()
      } else if (req.session.leaguePublicAccess &&
        req.session.leaguePublicAccess[leagueShortName]) {
        // If user has already validated
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

  const checkLeagueShortNameOwner = (req, res, next) => {
    if (!req.user) {
      req.session.attemptedUrl = req.originalUrl
      res.redirect('/auth/login')
    } else {
      db.oneOrNone('SELECT * FROM league WHERE short_name=$1', [req.params.league_short_name])
      .then((league) => {
        if (!league) {
          res.redirect('/404')
        } else if (league.owner_id !== req.user.id) {
          req.session.attemptedUrl = req.originalUrl
          res.redirect('/auth/login')
        } else {
          return next()
        }
      })
      .catch((err) => {
        res.render('error', {
          error: err
        })
        console.error(err)
      })
    }
  }

  const checkLeagueIdOwner = (req, res, next) => {
    if (!req.user) {
      req.session.attemptedUrl = req.originalUrl
      res.redirect('/auth/login')
    } else {
      db.oneOrNone('SELECT * FROM league WHERE id=$1', [req.params.id])
      .then((league) => {
        if (!league) {
          res.redirect('/404')
        } else if (league.owner_id !== req.user.id) {
          req.session.attemptedUrl = req.originalUrl
          res.redirect('/auth/login')
        } else {
          return next()
        }
      })
      .catch((err) => {
        res.render('error', {
          error: err
        })
        console.error(err)
      })
    }
  }

  const checkAuthenticated = (req, res, next) => {
    if (!req.user) {
      req.session.attemptedUrl = req.originalUrl
      res.redirect('/auth/login')
    } else {
      return next()
    }
  }

  // Public League access
  app.use('/:league_short_name/games', checkLeaguePassword)
  app.use('/:league_short_name/rankings', checkLeaguePassword)

  // League owner access
  app.use('/:league_short_name/players*', checkLeagueShortNameOwner)

  const switchLeagueRegex = /^\/leagues\/[0-9]+\/switch\?page=.*$/
  app.use('/leagues/:id*', (req, res, next) => {
    if (switchLeagueRegex.test(req.originalUrl)) {
      return next()
    } else {
      return checkLeagueIdOwner(req, res, next)
    }
  })

  // Is Authenticated
  app.get('/leagues', checkAuthenticated)
}
