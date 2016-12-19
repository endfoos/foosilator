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

## Docker

`docker build -t foosilator .`

`docker run -d --env-file .env -p 8080:8080 foosilator`

## Author

Lewis Christie
