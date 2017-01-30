CREATE TABLE registered_account(
  player_id integer UNIQUE NOT NULL,
  email varchar(255) NOT NULL,
  password varchar(60) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(email),
  FOREIGN KEY(player_id) REFERENCES player(id)
);

CREATE TABLE google_account(
  player_id integer NOT NULL,
  google_id varchar(255) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(google_id),
  FOREIGN KEY(player_id) REFERENCES player(id)
);

CREATE TABLE facebook_account(
  player_id integer NOT NULL,
  facebook_id varchar(255) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(facebook_id),
  FOREIGN KEY(player_id) REFERENCES player(id)
);
