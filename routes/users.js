module.exports = (app, db) => {
  // Search Endpoint
  app.get('/users/search', (req, res) => {
    const term = req.query.q ? req.query.q.toLowerCase() : ''
    db.any(`
        SELECT id, name, email, GREATEST(
          DIFFERENCE($1, LOWER(name)), DIFFERENCE($1, LOWER(email))
        ) as similarity
        FROM foosilator_user
        WHERE name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%'
        ORDER BY similarity DESC, name ASC
      `,
      [term]
    )
    .then((results) => {
      res.json(results)
    })
    .catch((err) => {
      res.render('error', {
        error: err
      })
      console.error(err)
    })
  })
}
