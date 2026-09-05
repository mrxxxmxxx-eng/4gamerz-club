CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '4Gamerz Club',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO config (id, data) VALUES (1, '{"siteName":"4Gamerz Club","phone":"+201068300677","whatsapp":"201068300677","address":"المنصورة - حي الجامعة","addressLine":"٧ شارع حلواني الرضا","mapsQuery":"7 شارع حلواني الرضا حي الجامعة المنصورة","prices":[{"name":"ساعة","hours":"ساعة لعب PC","price":25},{"name":"3 ساعات","hours":"3 ساعات لعب PC","price":60},{"name":"5 ساعات","hours":"5 ساعات لعب PC","price":100},{"name":"12 ساعة","hours":"12 ساعة لعب PC","price":240}],"announcement":"PC GAMING • المنصورة"}');

INSERT OR IGNORE INTO images (object_key, url, alt) VALUES ('club.jpeg', '/images/club.jpeg', '4Gamerz Club gaming setup');
