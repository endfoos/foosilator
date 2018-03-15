# Endfoos Foosilator

A Middle-out Foosball Platform

## Installation

Create a database and populate with `schema.sql`

`npm install`

`cp .env-example .env`

Update .env

## Usage

`npm start`

Navigate to http://localhost:8888/ or another port as specified in .env

`npm start-dev` - Runs the app and watches templates for changes

`npm run watch-styles` - Watches for changes to any `.scss` files and recompiles
the `main.css` stylesheet

## Migrations

Migrations are run automatically on app start.

Create a new migration by placing it in the migrations folder with a name matching `<id>_description.sql` where id is a unique number, description is a short description and only .sql files are matched. E.g. if the last migration was 14_add_player_statistics.sql you would create a new migration with id 15 e.g. 15_add_tournaments_table.sql. The id must be followed by an underscore.

All migrations are raw SQL - there is no support for higher level programming.

Migrations are checked in numeric order of id and will be skipped if already run. The migration process runs in a transaction - if any error occurs the transaction is rolled back and the app exits.

There are no down migrations.

If there is conflict in ids between developers then switch from manual ids to unix timestamps.

## Docker

`docker build -t foosilator .`

`docker run -d --env-file .env -p 8080:8080 foosilator`

### Compose

`docker compose up -d`

## Author

Lewis Christie
