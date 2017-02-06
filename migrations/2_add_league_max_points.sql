ALTER TABLE league
ADD COLUMN max_score smallint NOT NULL default 10 CHECK (max_score > 0 AND max_score <= 20)
