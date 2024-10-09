-- Table: sessions
CREATE TABLE "sessions" (
  id blob PRIMARY KEY NOT NULL,
  user blob NOT NULL,
  lastChecked timestamp NOT NULL
) WITHOUT ROWID;

-- Index: user
CREATE INDEX user ON sessions (user);
