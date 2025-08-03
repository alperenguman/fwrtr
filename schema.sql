-- STORYWRITER DATABASE WITH EXPLICIT COLUMN RELATIONSHIPS
-- Core principle: Everything is an entity. Relationships connect states of entities.
-- Extended with story generation, AI agent tracking, PERCEPTIONS, and AWARENESS system

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

-- Entity aliases for name resolution (Michael -> Mike, Tom -> The Accountant, etc.)
CREATE TABLE entity_aliases (
    alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    alias_name TEXT NOT NULL,
    alias_type TEXT DEFAULT 'manual', -- 'manual', 'auto_generated', 'nickname', 'title', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    UNIQUE(entity_id, alias_name) -- Prevent duplicate aliases for same entity
);

-- Hierarchical story nodes replacing beats
CREATE TABLE nodes (
    node_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    parent_node_id INTEGER,
    position INTEGER NOT NULL,
    title TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_node_id) REFERENCES nodes(node_id)
);

-- Create states table for tracking contextual state changes
CREATE TABLE states (
    state_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    node_id INTEGER NOT NULL,
    
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
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id),
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

-- Simplified relationships table with only state references
CREATE TABLE relationships (
    relationship_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    node_id INTEGER NOT NULL,
    state_id1 INTEGER NOT NULL,
    state_id2 INTEGER NOT NULL,
    description TEXT, -- LLM-generated description of how the states relate
    description_detail TEXT, -- LLM-generated detailed explanation of the relationship dynamics
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (state_id1) REFERENCES states(state_id),
    FOREIGN KEY (state_id2) REFERENCES states(state_id),
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

-- PERCEPTIONS - How states interpret other states based on their goals and history
CREATE TABLE perceptions (
    perception_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    node_id INTEGER NOT NULL,
    
    -- WHO is perceiving: a state perceiving another state
    perceiver_state_id INTEGER NOT NULL, -- The state doing the perceiving
    perceived_state_id INTEGER NOT NULL, -- The state being perceived
    
    -- THE INTERPRETATION (mirroring state table structure but from perceiver's perspective)
    perception_description TEXT, -- How perceiver sees the perceived state
    perception_description_detail TEXT, -- Detailed explanation of the interpretation
    
    perception_form_description TEXT, -- How perceiver sees the perceived state's form
    perception_form_description_detail TEXT,
    perception_form_tags JSON,
    
    perception_function_description TEXT, -- How perceiver sees the perceived state's function
    perception_function_description_detail TEXT,
    perception_function_tags JSON,
    
    perception_character_description TEXT, -- How perceiver sees the perceived state's character
    perception_character_description_detail TEXT,
    perception_character_tags JSON,
    
    perception_goal_description TEXT, -- How perceiver sees the perceived state's goals
    perception_goal_description_detail TEXT,
    perception_goal_tags JSON,
    
    perception_history_description TEXT, -- How perceiver sees the perceived state's history
    perception_history_description_detail TEXT,
    perception_history_tags JSON,
    
    -- PERCEPTION METADATA
    confidence_level REAL DEFAULT 0.5, -- How certain they are (0.0-1.0)
    emotional_valence REAL DEFAULT 0.0, -- How they feel about it (-1.0 to 1.0)
    attention_priority REAL DEFAULT 0.5, -- How much mental focus this gets (0.0-1.0)
    
    -- CONTEXTUAL INFLUENCE
    goal_alignment_score REAL DEFAULT 0.0, -- How much this perception supports perceiver's goals (-1.0 to 1.0)
    historical_context TEXT, -- How past experiences shape this interpretation
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (perceiver_state_id) REFERENCES states(state_id),
    FOREIGN KEY (perceived_state_id) REFERENCES states(state_id),
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

-- NEW: AWARENESS - Finite attention/context management system
-- This table manages what gets included in story generation context based on weighted importance
CREATE TABLE awareness (
    awareness_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    node_id INTEGER NOT NULL,
    
    -- CONTEXT REFERENCE - exactly one of these will be non-null
    state_id INTEGER, -- Reference to a state that's in awareness
    relationship_id INTEGER, -- Reference to a relationship that's in awareness  
    perception_id INTEGER, -- Reference to a perception that's in awareness
    
    -- AWARENESS METRICS
    weight REAL NOT NULL DEFAULT 0.5, -- Current awareness weight (0.0-1.0)
    decay_rate REAL NOT NULL DEFAULT 0.95, -- How fast weight decays without attention (0.0-1.0)
    
    -- ATTENTION TRACKING
    last_user_mention TIMESTAMP, -- When user last directly mentioned this context
    last_story_mention TIMESTAMP, -- When this was last included in generated story
    mention_count INTEGER DEFAULT 0, -- Total times user has mentioned this
    story_inclusion_count INTEGER DEFAULT 0, -- Total times included in story generation
    
    -- STATUS AND LIFECYCLE
    status TEXT DEFAULT 'active', -- 'active', 'fading', 'dormant', 'archived'
    
    -- CONTEXT METADATA
    context_type TEXT NOT NULL, -- 'state', 'relationship', 'perception' (derived from which ID is set)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_weight_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- CONSTRAINTS
    FOREIGN KEY (state_id) REFERENCES states(state_id) ON DELETE CASCADE,
    FOREIGN KEY (relationship_id) REFERENCES relationships(relationship_id) ON DELETE CASCADE,
    FOREIGN KEY (perception_id) REFERENCES perceptions(perception_id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id) ON DELETE CASCADE,
    
    -- Ensure exactly one context reference is set
    CHECK (
        (state_id IS NOT NULL AND relationship_id IS NULL AND perception_id IS NULL) OR
        (state_id IS NULL AND relationship_id IS NOT NULL AND perception_id IS NULL) OR
        (state_id IS NULL AND relationship_id IS NULL AND perception_id IS NOT NULL)
    ),
    
    -- Ensure context_type matches the set reference
    CHECK (
        (context_type = 'state' AND state_id IS NOT NULL) OR
        (context_type = 'relationship' AND relationship_id IS NOT NULL) OR
        (context_type = 'perception' AND perception_id IS NOT NULL)
    )
);

-- Representations for visual/audio assets
CREATE TABLE representations (
    representation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    relationship_id INTEGER,
    state_id INTEGER,
    node_id INTEGER,
    type TEXT NOT NULL, -- 'visual' or 'audio'
    style TEXT,
    composition TEXT,
    asset_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (relationship_id) REFERENCES relationships(relationship_id),
    FOREIGN KEY (state_id) REFERENCES states(state_id),
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

-- Stories table for generated story content with versioning
CREATE TABLE stories (
    story_entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    node_id INTEGER NOT NULL,
    
    -- Story content and metadata
    raw_text TEXT NOT NULL, -- Raw generated text before any processing
    text_content TEXT NOT NULL, -- The final processed story text
    variant TEXT NOT NULL, -- 'roll1', 'roll2', 'roll3', 'user_input', 'final', etc.
    revision TEXT NOT NULL, -- 'rev1', 'rev2', 'rev3', etc.
    
    -- Quality metrics
    quality_score REAL, -- Evaluated quality score (0.0-1.0)
    continuity_score REAL, -- How well it maintains story continuity
    
    -- Metadata
    character_count INTEGER,
    
    -- Status and workflow
    status TEXT DEFAULT 'draft', -- 'draft', 'reviewed', 'approved', 'published'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

-- Agents table for agent definitions and configuration
CREATE TABLE agents (
    agent_id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL, -- 'PrepAgent', 'GeneratorAgent', 'EvalAgent', 'ContinuityGuard', 'EntityAgent', 'AwarenessAgent'
    agent_task_id INTEGER NOT NULL, -- Task ID within the agent type (1=raw extraction, 2=classification, etc.)
    agent_name TEXT, -- Human-readable name
    agent_description TEXT, -- What this specific task does
    
    -- Agent configuration
    agent_instructions TEXT, -- Core instructions/prompt for this specific task
    agent_function_calls JSON, -- Available function calls/tools for this task
    model TEXT, -- Which AI model this specific task uses
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE, -- Is this agent task currently active?
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(agent_type, agent_task_id) -- Prevent duplicate task IDs for same agent type
);

-- Agent executions table for execution tracking
CREATE TABLE agent_executions (
    agent_execution_id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Agent reference
    agent_id INTEGER NOT NULL,
    
    -- Execution context
    story_id TEXT NOT NULL,
    story_entry_id INTEGER, -- Which story entry this relates to
    
    -- Input/Output
    source_text TEXT, -- Input text/prompt the agent received
    output_text TEXT, -- Text output produced by the agent
    
    -- Timing
    request_time TIMESTAMP NOT NULL,
    output_time TIMESTAMP, -- When output was received (NULL if still processing)
    processing_duration_ms INTEGER, -- How long processing took in milliseconds
    
    -- Results and metrics
    status_message TEXT, -- Success message or error details
    
    -- Cost tracking
    tokens INTEGER, -- Number of tokens consumed
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
    FOREIGN KEY (story_entry_id) REFERENCES stories(story_entry_id)
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

CREATE INDEX idx_entity_aliases_entity_id ON entity_aliases(entity_id);
CREATE INDEX idx_entity_aliases_alias_name ON entity_aliases(alias_name);
CREATE INDEX idx_entity_aliases_type ON entity_aliases(alias_type);

CREATE INDEX idx_nodes_story ON nodes(story_id);
CREATE INDEX idx_nodes_parent ON nodes(parent_node_id);

CREATE INDEX idx_states_story ON states(story_id);
CREATE INDEX idx_states_scene ON states(scene_id);
CREATE INDEX idx_states_node ON states(node_id);
CREATE INDEX idx_states_entity ON states(entity_id);
CREATE INDEX idx_states_attributes ON states(attributes);

CREATE INDEX idx_relationships_story ON relationships(story_id);
CREATE INDEX idx_relationships_scene ON relationships(scene_id);
CREATE INDEX idx_relationships_node ON relationships(node_id);
CREATE INDEX idx_relationships_state1 ON relationships(state_id1);
CREATE INDEX idx_relationships_state2 ON relationships(state_id2);
CREATE INDEX idx_relationships_description ON relationships(description);

-- Indexes for perceptions table
CREATE INDEX idx_perceptions_story ON perceptions(story_id);
CREATE INDEX idx_perceptions_scene ON perceptions(scene_id);
CREATE INDEX idx_perceptions_node ON perceptions(node_id);
CREATE INDEX idx_perceptions_perceiver_state ON perceptions(perceiver_state_id);
CREATE INDEX idx_perceptions_perceived_state ON perceptions(perceived_state_id);
CREATE INDEX idx_perceptions_confidence ON perceptions(confidence_level);
CREATE INDEX idx_perceptions_valence ON perceptions(emotional_valence);
CREATE INDEX idx_perceptions_goal_alignment ON perceptions(goal_alignment_score);
CREATE INDEX idx_perceptions_created ON perceptions(created_at);

-- NEW: Indexes for awareness table - critical for performance
CREATE INDEX idx_awareness_story ON awareness(story_id);
CREATE INDEX idx_awareness_scene ON awareness(scene_id);
CREATE INDEX idx_awareness_node ON awareness(node_id);
CREATE INDEX idx_awareness_weight ON awareness(weight);
CREATE INDEX idx_awareness_status ON awareness(status);
CREATE INDEX idx_awareness_context_type ON awareness(context_type);
CREATE INDEX idx_awareness_state_id ON awareness(state_id);
CREATE INDEX idx_awareness_relationship_id ON awareness(relationship_id);
CREATE INDEX idx_awareness_perception_id ON awareness(perception_id);
CREATE INDEX idx_awareness_last_mention ON awareness(last_user_mention);
CREATE INDEX idx_awareness_weight_status ON awareness(weight, status); -- Composite for active context queries
CREATE INDEX idx_awareness_story_weight ON awareness(story_id, weight DESC); -- For top-weighted context retrieval
CREATE INDEX idx_awareness_last_weight_update ON awareness(last_weight_update);

CREATE INDEX idx_representations_relationship ON representations(relationship_id);
CREATE INDEX idx_representations_state ON representations(state_id);
CREATE INDEX idx_representations_node ON representations(node_id);
CREATE INDEX idx_representations_type ON representations(type);

-- Indexes for stories table
CREATE INDEX idx_stories_story_id ON stories(story_id);
CREATE INDEX idx_stories_scene ON stories(scene_id);
CREATE INDEX idx_stories_node ON stories(node_id);
CREATE INDEX idx_stories_variant ON stories(variant);
CREATE INDEX idx_stories_revision ON stories(revision);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_stories_created_at ON stories(created_at);

-- Indexes for agents table
CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_task_id ON agents(agent_task_id);
CREATE INDEX idx_agents_type_task ON agents(agent_type, agent_task_id);
CREATE INDEX idx_agents_is_active ON agents(is_active);

-- Indexes for agent_executions table
CREATE INDEX idx_agent_executions_agent_id ON agent_executions(agent_id);
CREATE INDEX idx_agent_executions_story_id ON agent_executions(story_id);
CREATE INDEX idx_agent_executions_request_time ON agent_executions(request_time);
CREATE INDEX idx_agent_executions_story_entry ON agent_executions(story_entry_id);

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

-- NEW: Triggers for maintaining awareness context_type consistency
-- Automatically set context_type based on which reference is populated
CREATE TRIGGER set_awareness_context_type_insert
AFTER INSERT ON awareness
WHEN NEW.context_type IS NULL OR NEW.context_type = ''
BEGIN
    UPDATE awareness 
    SET context_type = CASE 
        WHEN NEW.state_id IS NOT NULL THEN 'state'
        WHEN NEW.relationship_id IS NOT NULL THEN 'relationship' 
        WHEN NEW.perception_id IS NOT NULL THEN 'perception'
        ELSE 'unknown'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE awareness_id = NEW.awareness_id;
END;

CREATE TRIGGER set_awareness_context_type_update
AFTER UPDATE ON awareness
WHEN (OLD.state_id != NEW.state_id OR OLD.relationship_id != NEW.relationship_id OR OLD.perception_id != NEW.perception_id)
BEGIN
    UPDATE awareness 
    SET context_type = CASE 
        WHEN NEW.state_id IS NOT NULL THEN 'state'
        WHEN NEW.relationship_id IS NOT NULL THEN 'relationship'
        WHEN NEW.perception_id IS NOT NULL THEN 'perception'
        ELSE 'unknown'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE awareness_id = NEW.awareness_id;
END;

-- Trigger to update last_weight_update timestamp when weight changes
CREATE TRIGGER update_awareness_weight_timestamp
AFTER UPDATE OF weight ON awareness
BEGIN
    UPDATE awareness 
    SET last_weight_update = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE awareness_id = NEW.awareness_id;
END;
-- Default agent instructions
INSERT INTO agents (agent_type, agent_task_id, agent_name, agent_description, agent_instructions, agent_function_calls, model, is_active)
VALUES (
    'EvalAgent',
    1,
    'Beat/Scene Evaluator',
    'Determines if new text starts a new beat or scene and returns processed text broken into segments.',
    'Given raw story text, break it into logical segments representing beats. Indicate if any segment starts a new scene. Respond with JSON: {"processed_text":"text","segments":[{"text":"segment","new_scene":false}]}.',
    '{}',
    'gpt-3.5-turbo',
    1
);

INSERT INTO agents (agent_type, agent_task_id, agent_name, agent_description, agent_instructions, agent_function_calls, model, is_active)
VALUES (
    'GeneratorAgent',
    1,
    'Story Generator',
    'Produces new story text from scene context and user direction.',
    'Continue the story in an engaging style using the provided context. Keep paragraphs short and descriptive.',
    '{}',
    'gpt-3.5-turbo',
    1
);

