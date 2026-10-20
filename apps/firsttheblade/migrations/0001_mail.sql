-- The email list: one row an address, and one row a film sent to it.
-- Times are milliseconds since 1970 (UTC).

CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY,
  -- Trimmed and lowercased, so one inbox is one row.
  address TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  created_at INTEGER NOT NULL,
  -- When the newest confirm email was sent: the only confirm link that works.
  confirm_sent_at INTEGER,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER
);

CREATE INDEX subscribers_by_status ON subscribers (status, id);

-- A film's email, once a subscriber has been sent it (or refused by the
-- sender for good), so a film's send never reaches anyone twice.
CREATE TABLE sends (
  film TEXT NOT NULL,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id),
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'refused')),
  at INTEGER NOT NULL,
  PRIMARY KEY (film, subscriber_id)
);
