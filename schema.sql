CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT,
    description TEXT,
    description_detail TEXT,
    
    form_description TEXT,
    form_description_detail TEXT,
    form_tags JSON,
    
    function_description TEXT,
    function_description_detail TEXT,
    function_tags JSON,
    
    character_description TEXT,
    character_description_detail TEXT,
    character_tags JSON,
    
    goal_description TEXT,
    goal_description_detail TEXT,
    goal_tags JSON,
    
    history_description TEXT,
    history_description_detail TEXT,
    history_tags JSON,
    
    custom_attributes JSON DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE states (
    state_id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    beat_id TEXT NOT NULL,
    
    location_id TEXT,
    time_id TEXT,
    activity_id TEXT,
    actor_id TEXT,
    action_id TEXT,
    object_id TEXT,
    thought_id TEXT,
    feeling_id TEXT,
    dialogue_id TEXT,
    
    current_custom_attributes JSON DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE relationships (
    relationship_id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    beat_id TEXT NOT NULL,
    state_id1 TEXT NOT NULL,
    state_id2 TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE story_events (
    event_id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    content TEXT,
    entity_ids JSON,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX idx_entities_story ON entities(story_id);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_custom_attributes ON entities(custom_attributes);

CREATE INDEX idx_states_story ON states(story_id);
CREATE INDEX idx_states_scene ON states(scene_id);
CREATE INDEX idx_states_beat ON states(beat_id);
CREATE INDEX idx_states_actor ON states(actor_id);
CREATE INDEX idx_states_object ON states(object_id);
CREATE INDEX idx_states_dialogue ON states(dialogue_id);

CREATE INDEX idx_relationships_story ON relationships(story_id);
CREATE INDEX idx_relationships_scene ON relationships(scene_id);
CREATE INDEX idx_relationships_beat ON relationships(beat_id);

CREATE INDEX idx_story_events_story ON story_events(story_id);
CREATE INDEX idx_story_events_type ON story_events(event_type);