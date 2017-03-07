-- Nuke existing data
TRUNCATE game, league_player, league, session RESTART IDENTITY;

CREATE TABLE foosilator_user(
  id SERIAL NOT NULL,
  name text NOT NULL,
  email varchar(255) UNIQUE,
  password varchar(60),
  google_id varchar(255) UNIQUE,
  facebook_id varchar(255) UNIQUE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(id)
);

ALTER TABLE league
  ADD COLUMN owner_id integer NOT NULL,
  ADD FOREIGN KEY(owner_id) REFERENCES foosilator_user(id);
