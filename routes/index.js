module.exports = function (app, db) {
  // Landing page
  app.get('/', (req, res) => {
    if (res.locals.currentLeague) {
      res.redirect(`/${res.locals.currentLeague.short_name}/games`)
    } else {
      // Redirect to first league if one exists
      // otherwise redirect to league management
      db.manyOrNone('SELECT id, short_name FROM league WHERE is_active=true ORDER BY created_at ASC LIMIT 1')
      .then((leagues) => {
        if (leagues.length <= 0) {
          res.redirect('/leagues')
        } else {
          res.redirect(`/${leagues[0].short_name}/games`)
        }
      })
      .catch((err) => {
        res.render('error', {
          error: err
        })
        console.error(err)
      })
    }
  })

  app.get('/health', (req, res) => {
    res.send('OK')
  })
}
