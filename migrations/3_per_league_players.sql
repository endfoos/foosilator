CREATE TABLE league_player(
  id SERIAL NOT NULL,
  -- player_id for migrating, dropped later
  player_id integer NOT NULL,
  league_id integer NOT NULL,
  name text NOT NULL,
  elo_rating smallint NOT NULL DEFAULT 1000,
  color varchar(6) CHECK (color ~ '^[0-9a-fA-F]{6}$') NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(id),
  FOREIGN KEY(league_id) REFERENCES league(id)
);

INSERT INTO league_player
  (player_id, league_id, name, elo_rating, color, created_at, is_active)
  SELECT player_id, league_id, name, elo_rating, color, player_to_league.created_at, is_active
    FROM player_to_league
    LEFT JOIN player ON player_to_league.player_id=player.id;

-- Drop foreign key constraints for migration
ALTER TABLE game
  DROP CONSTRAINT game_winner_id_fkey,
  DROP CONSTRAINT game_loser_id_fkey;

-- Point winner and loser id at league_player PK
UPDATE game g
  SET winner_id=(SELECT lp.id FROM league_player lp WHERE player_id=winner_id AND lp.league_id=g.league_id),
      loser_id=(SELECT lp.id FROM league_player lp WHERE player_id=loser_id AND lp.league_id=g.league_id);

-- Add new foreign key constraints
ALTER TABLE game
  ADD FOREIGN KEY(winner_id) REFERENCES league_player(id),
  ADD FOREIGN KEY(loser_id) REFERENCES league_player(id);

-- Drop temporary player_id column
ALTER TABLE league_player
  DROP COLUMN player_id;

-- Drop old tables
DROP TABLE player_to_league;

DROP TABLE player;
