CREATE TABLE IF NOT EXISTS session(
  sid varchar(32) NOT NULL,
  data json NOT NULL,
  expires_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(sid)
);
