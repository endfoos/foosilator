/* Loads and runs migrations from ./migrations folder
 * Migrations must be named <id>_<description>.sql where <id>
 * is an integer.
 * Runs a transaction that is returned as a promise - resolved
 * if migrations ran successfully and transaction was comitted
 */
module.exports = function (db) {
  return db.tx((t1) => {
    // Create tracking table if it does not exist
    // Weird bug with pg-promise's nested transactions here.
    // If there isn't a call to t1.none before we sequence the
    // inner transactions we get a pg error.
    return t1.none(`
      CREATE TABLE IF NOT EXISTS migration(
        id bigint NOT NULL,
        name text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY(id)
      )
    `)
    .then(() => {
      // Read migrations directory
      const path = require('path')
      const fs = require('fs')
      return new Promise((resolve, reject) => {
        fs.readdir(path.join('.', 'migrations'), (err, files) => {
          if (err !== null) {
            return reject(err)
          }

          // Filter out any non .sql files
          files = files.filter((file) => {
            return file.split('.').reverse()[0].toLowerCase() === 'sql'
          })

          // Map list of files to promises resolved when file is read from disk
          // with a keyed object of {id, name, sql}
          files = files.map((file) => {
            return new Promise((resolve, reject) => {
              fs.readFile(path.join('.', 'migrations', file), 'utf8', (err, sql) => {
                if (err !== null) {
                  return reject(err)
                }

                resolve({
                  id: file.split('_')[0],
                  name: file,
                  sql: sql
                })
              })
            })
          })

          resolve(Promise.all(files))
        })
      })
    })
    .then((migrations) => {
      // Sort by id
      migrations.sort((a, b) => {
        return a.id - b.id
      })
      // Run each migration in sequence (requires a generator)
      return t1.sequence(function * () {
        // Can't yield from nested functions... wtfjs!
        for (let i = 0; i < migrations.length; i++) {
          let migration = migrations[i]
          // Each migration runs in its own inner transaction t2
          yield t1.tx((t2) => {
            // Test for existing migration with this id
            return t2.oneOrNone('SELECT * FROM migration WHERE id=$1', migration.id)
            .then((existingMigration) => {
              if (!existingMigration) {
                // Apply migration SQL
                return t2.any(migration.sql)
                .then(() => {
                  console.log(`${migration.name} applied`)
                  return t2.none(
                    'INSERT INTO migration(id, name) VALUES($1, $2)',
                    [migration.id, migration.name]
                  )
                })
              } else {
                console.log(`${migration.name} already applied - skipping.`)
              }
            })
            .catch((err) => {
              console.log(`Error applying ${migration.name}`)
              return Promise.reject(err)
            })
          })
        }
      })
    })
  })
}
