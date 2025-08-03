-- Migration script to introduce nodes table and replace beat_id with node_id.
-- Assumes the existing schema uses beat_id to reference beats.
-- Steps:
-- 1. Create the new nodes table.
-- 2. Copy distinct beat identifiers into nodes and capture generated node_ids.
-- 3. Add node_id columns with foreign key references.
-- 4. Backfill node_id values from existing beat_id references.
-- 5. Drop old beat_id columns.
-- This script targets SQLite 3.35+ where DROP COLUMN is supported.
BEGIN TRANSACTION;

-- 1. Create nodes table
CREATE TABLE IF NOT EXISTS nodes (
    node_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    parent_node_id INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_node_id) REFERENCES nodes(node_id)
);

-- 2. Populate nodes from existing beat identifiers
INSERT INTO nodes (story_id, title, content)
SELECT DISTINCT story_id, beat_id, ''
FROM stories;

-- 3. Add node_id columns with foreign key references
ALTER TABLE stories ADD COLUMN node_id INTEGER REFERENCES nodes(node_id);
ALTER TABLE states ADD COLUMN node_id INTEGER REFERENCES nodes(node_id);
ALTER TABLE relationships ADD COLUMN node_id INTEGER REFERENCES nodes(node_id);
ALTER TABLE perceptions ADD COLUMN node_id INTEGER REFERENCES nodes(node_id);
ALTER TABLE awareness ADD COLUMN node_id INTEGER REFERENCES nodes(node_id);
ALTER TABLE representations ADD COLUMN node_id INTEGER REFERENCES nodes(node_id);

-- 4. Backfill node_id values
UPDATE stories SET node_id = (
    SELECT n.node_id FROM nodes n
    WHERE n.story_id = stories.story_id AND n.title = stories.beat_id
);
UPDATE states SET node_id = (
    SELECT n.node_id FROM nodes n
    WHERE n.story_id = states.story_id AND n.title = states.beat_id
);
UPDATE relationships SET node_id = (
    SELECT n.node_id FROM nodes n
    WHERE n.story_id = relationships.story_id AND n.title = relationships.beat_id
);
UPDATE perceptions SET node_id = (
    SELECT n.node_id FROM nodes n
    WHERE n.story_id = perceptions.story_id AND n.title = perceptions.beat_id
);
UPDATE awareness SET node_id = (
    SELECT n.node_id FROM nodes n
    WHERE n.story_id = awareness.story_id AND n.title = awareness.beat_id
);
-- Representations derive node_id from related state or relationship when available
UPDATE representations SET node_id = (
    SELECT COALESCE(
        (SELECT node_id FROM relationships r WHERE r.relationship_id = representations.relationship_id),
        (SELECT node_id FROM states s WHERE s.state_id = representations.state_id)
    )
);

-- 5. Drop old beat_id columns
ALTER TABLE stories DROP COLUMN beat_id;
ALTER TABLE states DROP COLUMN beat_id;
ALTER TABLE relationships DROP COLUMN beat_id;
ALTER TABLE perceptions DROP COLUMN beat_id;
ALTER TABLE awareness DROP COLUMN beat_id;

COMMIT;
