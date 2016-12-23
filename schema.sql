CREATE TABLE IF NOT EXISTS player(
  id serial NOT NULL,
  name text NOT NULL,
  color varchar(6) CHECK (color ~ '^[0-9a-fA-F]{6}$') NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(id)
 );

CREATE TABLE IF NOT EXISTS league(
  id serial NOT NULL,
  name text NOT NULL,
  short_name varchar(20) CHECK (short_name ~ '^[a-z]+$') UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS player_to_league(
  id serial NOT NULL,
  player_id integer NOT NULL,
  league_id integer NOT NULL,
  elo_rating smallint NOT NULL DEFAULT 1000,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(id),
  FOREIGN KEY(player_id) REFERENCES player(id),
  FOREIGN KEY(league_id) REFERENCES league(id)
);

CREATE TABLE IF NOT EXISTS game(
  id serial NOT NULL,
  winner_id integer NOT NULL,
  winner_score smallint NOT NULL,
  winner_elo_change smallint NOT NULL,
  loser_id integer NOT NULL,
  loser_score smallint NOT NULL,
  league_id integer NOT NULL,
  loser_elo_change smallint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY(winner_id) REFERENCES player(id),
  FOREIGN KEY(loser_id) REFERENCES player(id),
  FOREIGN KEY(league_id) REFERENCES league(id)
);
