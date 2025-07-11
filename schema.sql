-- STORYWRITER DATABASE WITH EXPLICIT COLUMN RELATIONSHIPS
-- Core principle: Everything is an entity. Relationships connect states of entities.

-- Class system for dynamic entity attributes and constraints
CREATE TABLE classes (
    class_id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'actor', 'object', 'dialogue', 'location', 'time', 'thought', 'feeling', 'action', 'activity'
    parent_class_id INTEGER, -- NULL for base types, class_id for child classes
    details TEXT, -- Description of what this class represents
    attributes JSON DEFAULT '{}', -- Attribute definitions this class adds/overrides
    constraints JSON DEFAULT '{}', -- Constraints this class adds/overrides
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_class_id) REFERENCES classes(class_id) DEFERRABLE INITIALLY DEFERRED
);

-- Everything in the system
CREATE TABLE entities (
    entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    class_id INTEGER NOT NULL, -- References classes table (most specific class)
    type TEXT NOT NULL, -- Most specific class type
    base_type TEXT NOT NULL, -- Base class type (actor, object, dialogue, etc.)
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
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(class_id)
);

-- Create states table for tracking contextual state changes
CREATE TABLE states (
    state_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    beat_id TEXT NOT NULL,
    
    -- Single entity reference - much cleaner!
    entity_id INTEGER NOT NULL,
    
    -- Inherited attributes from class hierarchy merged with instance overrides
    attributes JSON DEFAULT '{}', -- Merged attributes from entire class inheritance chain
    
    -- Current state overrides for this context (with detail fields)
    current_form_description TEXT,
    current_form_description_detail TEXT,
    current_form_tags JSON,
    
    current_function_description TEXT,
    current_function_description_detail TEXT,
    current_function_tags JSON,
    
    current_character_description TEXT,
    current_character_description_detail TEXT,
    current_character_tags JSON,
    
    current_goal_description TEXT,
    current_goal_description_detail TEXT,
    current_goal_tags JSON,
    
    current_history_description TEXT,
    current_history_description_detail TEXT,
    current_history_tags JSON,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id)
);

-- Simplified relationships table with only state references
CREATE TABLE relationships (
    relationship_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    beat_id TEXT NOT NULL,
    state_id1 INTEGER NOT NULL,
    state_id2 INTEGER NOT NULL,
    description TEXT, -- LLM-generated description of how the states relate
    description_detail TEXT, -- LLM-generated detailed explanation of the relationship dynamics
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (state_id1) REFERENCES states(state_id),
    FOREIGN KEY (state_id2) REFERENCES states(state_id)
);

-- Representations for visual/audio assets
CREATE TABLE representations (
    representation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    relationship_id INTEGER,
    state_id INTEGER,
    type TEXT NOT NULL, -- 'visual' or 'audio'
    style TEXT,
    composition TEXT,
    asset_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (relationship_id) REFERENCES relationships(relationship_id),
    FOREIGN KEY (state_id) REFERENCES states(state_id)
);

-- Performance indexes
CREATE INDEX idx_classes_type ON classes(type);
CREATE INDEX idx_classes_parent ON classes(parent_class_id);

CREATE INDEX idx_entities_story ON entities(story_id);
CREATE INDEX idx_entities_class ON entities(class_id);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_base_type ON entities(base_type);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_form_tags ON entities(form_tags);
CREATE INDEX idx_entities_function_tags ON entities(function_tags);

CREATE INDEX idx_states_story ON states(story_id);
CREATE INDEX idx_states_scene ON states(scene_id);
CREATE INDEX idx_states_beat ON states(beat_id);
CREATE INDEX idx_states_entity ON states(entity_id);
CREATE INDEX idx_states_attributes ON states(attributes);

CREATE INDEX idx_relationships_story ON relationships(story_id);
CREATE INDEX idx_relationships_scene ON relationships(scene_id);
CREATE INDEX idx_relationships_beat ON relationships(beat_id);
CREATE INDEX idx_relationships_state1 ON relationships(state_id1);
CREATE INDEX idx_relationships_state2 ON relationships(state_id2);
CREATE INDEX idx_relationships_description ON relationships(description);

CREATE INDEX idx_representations_relationship ON representations(relationship_id);
CREATE INDEX idx_representations_state ON representations(state_id);
CREATE INDEX idx_representations_type ON representations(type);

-- Base classes for entity types
INSERT INTO classes (type, parent_class_id, details, attributes, constraints) VALUES 
('actor', NULL, 'Base class for all character entities', '{}', '{}'),
('object', NULL, 'Base class for all physical and conceptual objects', '{}', '{}'),
('dialogue', NULL, 'Base class for all spoken or thought communication', '{}', '{}'),
('location', NULL, 'Base class for all places and spatial contexts', '{}', '{}'),
('time', NULL, 'Base class for all temporal contexts and moments', '{}', '{}'),
('thought', NULL, 'Base class for all internal mental processes', '{}', '{}'),
('feeling', NULL, 'Base class for all emotional states and reactions', '{}', '{}'),
('action', NULL, 'Base class for all physical and mental actions', '{}', '{}'),
('activity', NULL, 'Base class for all ongoing processes and activities', '{}', '{}');