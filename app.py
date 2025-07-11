from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import sqlite3
import json
from datetime import datetime
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'storywriter_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Database configuration
DATABASE = 'storywriter.db'

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with schema"""
    if not os.path.exists(DATABASE):
        print("Creating database...")
        conn = get_db()
        
        # Read SQL schema from file
        with open('schema.sql', 'r') as f:
            schema = f.read()
        
        conn.executescript(schema)
        
        # Create sample data
        create_sample_data(conn)
        
        conn.commit()
        conn.close()
        print("Database initialized with sample data")

def create_sample_data(conn):
    """Create sample entities, states, and relationships"""
    
    # Get base class IDs
    base_classes = {}
    for row in conn.execute("SELECT class_id, type FROM classes WHERE parent_class_id IS NULL"):
        base_classes[row['type']] = row['class_id']
    
    # Create sample entities
    entities = [
        {
            'story_id': '1',
            'class_id': base_classes['actor'],
            'type': 'actor',
            'base_type': 'actor',
            'name': 'Sarah Chen',
            'description': 'Funeral home director with supernatural sensitivity',
            'description_detail': 'A compassionate professional who runs a funeral home while struggling with her ability to perceive supernatural activity around death and grief.',
            'form_description': 'tall woman with burn scars on both hands',
            'form_description_detail': 'Standing nearly six feet tall with an elegant but weathered appearance, Sarah carries herself with quiet dignity despite the prominent burn scars that cover both hands.',
            'form_tags': json.dumps(['humanoid', 'tall', 'female', 'scarred', 'adult']),
            'function_description': 'protects grieving families and guides them through supernatural encounters',
            'function_description_detail': 'Serves as both a practical funeral director helping families navigate loss and as an unofficial guardian against supernatural threats.',
            'function_tags': json.dumps(['protector', 'supernatural_sensitive', 'grief_counselor', 'guardian']),
            'character_description': 'cautious but deeply empathetic',
            'character_description_detail': 'Approaches every situation with careful consideration and emotional intelligence, having learned to balance her natural empathy with protective caution.',
            'character_tags': json.dumps(['cautious', 'empathetic', 'checks_shadows', 'protective']),
            'goal_description': 'prevent others from experiencing supernatural trauma',
            'goal_description_detail': 'Dedicated to ensuring that no one else endures the kind of supernatural terror she experienced as a child.',
            'goal_tags': json.dumps(['prevent_harm', 'help_others_grieve', 'overcome_trauma']),
            'history_description': 'grew up in funeral home witnessing supernatural activity',
            'history_description_detail': 'Raised in her family funeral home after her parents died in a tragic fire, Sarah discovered her supernatural sensitivity at a young age.',
            'history_tags': json.dumps(['grew_up_in_funeral_home', 'witnessed_supernatural_young', 'lost_parents_tragically'])
        },
        {
            'story_id': '1',
            'class_id': base_classes['object'],
            'type': 'object',
            'base_type': 'object',
            'name': 'Golden Fishing Rod',
            'description': 'Grandfather lucky rod with strange properties',
            'description_detail': 'An antique fishing rod passed down through generations, crafted with unusual materials that seem to respond to emotional energy and supernatural activity.',
            'form_description': 'gold-plated steel fishing rod with worn grip',
            'form_description_detail': 'A beautifully crafted fishing rod with genuine gold plating over a steel core, featuring an intricately carved wooden handle worn smooth by decades of use.',
            'form_tags': json.dumps(['metal', 'golden', 'antique', 'fishing_equipment', 'warm_to_touch']),
            'function_description': 'serves as fishing tool and supernatural detector',
            'function_description_detail': 'Functions as an excellent fishing rod for catching various freshwater fish while also acting as an sensitive instrument that responds to supernatural presence.',
            'function_tags': json.dumps(['fishing_tool', 'supernatural_detector', 'family_heirloom', 'luck_bringer']),
            'character_description': 'glows softly near water and vibrates with emotion',
            'character_description_detail': 'Exhibits subtle supernatural behavior including a gentle luminous quality when near bodies of water and empathetic vibrations.',
            'character_tags': json.dumps(['glows_near_water', 'vibrates_with_emotion', 'attracts_fish']),
            'goal_description': 'seeks to reunite family and preserve legacy',
            'goal_description_detail': 'Carries an almost sentient desire to bring family members together and maintain connections across generations.',
            'goal_tags': json.dumps(['reunite_family', 'guide_towards_truth', 'preserve_legacy']),
            'history_description': 'crafted by grandfather and used on countless fishing trips',
            'history_description_detail': 'Hand-crafted by Sarah grandfather using techniques and materials he never fully explained, this rod accompanied him on fishing expeditions.',
            'history_tags': json.dumps(['crafted_by_grandfather', 'used_in_many_fishing_trips', 'present_during_family_secrets'])
        },
        {
            'story_id': '1',
            'class_id': base_classes['location'],
            'type': 'location',
            'base_type': 'location',
            'name': 'Misty Lake Dock',
            'description': 'Old wooden dock where grandfather taught fishing',
            'description_detail': 'A weathered wooden pier extending into a fog-shrouded lake, serving as a sacred family gathering place where important conversations have been shared across generations.',
            'form_description': 'weathered wooden dock extending into fog-covered lake',
            'form_description_detail': 'A sturdy wooden structure built from aged cedar planks, extending approximately fifty feet into the lake with rope railings and worn fishing spots.',
            'form_tags': json.dumps(['outdoor', 'wooden', 'waterside', 'weathered', 'nostalgic']),
            'function_description': 'serves as fishing spot and meeting place for important conversations',
            'function_description_detail': 'Functions as both a practical fishing location with excellent access to deep water fish and as a sacred family space.',
            'function_tags': json.dumps(['fishing_spot', 'memory_trigger', 'meeting_place', 'spiritual_threshold']),
            'character_description': 'fog rolls in during emotional moments and time feels suspended',
            'character_description_detail': 'Possesses an almost supernatural quality where mist appears to respond to the emotional intensity of conversations held there.',
            'character_tags': json.dumps(['fog_rolls_in', 'creaks_with_wind', 'attracts_memories', 'time_feels_suspended']),
            'goal_description': 'preserve family memories and facilitate connections',
            'goal_description_detail': 'Exists to maintain the sacred tradition of family bonding and truth-telling.',
            'goal_tags': json.dumps(['preserve_memories', 'facilitate_connections', 'bridge_past_present']),
            'history_description': 'built by returning soldiers and became grandfather special teaching place',
            'history_description_detail': 'Constructed by World War II veterans as a community project, this dock became the special domain of Sarah grandfather.',
            'history_tags': json.dumps(['built_post_war', 'grandfather_taught_fishing_here', 'witnessed_family_conversations'])
        },
        {
            'story_id': '1',
            'class_id': base_classes['time'],
            'type': 'time',
            'base_type': 'time',
            'name': '3AM Witching Hour',
            'description': 'The hour when barriers thin and truth emerges',
            'description_detail': 'The mystical period between 3 and 4 AM when folklore suggests the veil between worlds is thinnest and supernatural activity peaks.',
            'form_description': 'deep night when streetlights flicker and shadows move differently',
            'form_description_detail': 'The darkest hour of night characterized by an eerie stillness broken only by distant sounds, where artificial lights seem dimmer.',
            'form_tags': json.dumps(['time_of_day', 'supernatural', 'threshold', 'liminal', 'recurring']),
            'function_description': 'amplifies supernatural activity and strips away pretenses',
            'function_description_detail': 'Serves as a temporal catalyst that intensifies psychic phenomena and weakens psychological barriers.',
            'function_tags': json.dumps(['supernatural_amplifier', 'truth_revealer', 'barrier_thinner', 'vulnerability_enhancer']),
            'character_description': 'makes shadows move independently and demands brutal honesty',
            'character_description_detail': 'Characterized by an otherworldly quality that seems to animate the darkness itself while stripping away social masks.',
            'character_tags': json.dumps(['makes_shadows_move', 'amplifies_supernatural', 'strips_pretenses', 'demands_honesty']),
            'goal_description': 'reveal hidden truths that daylight conceals',
            'goal_description_detail': 'Seeks to illuminate secrets and force confrontations that have been avoided in the safety of daylight hours.',
            'goal_tags': json.dumps(['reveal_hidden_truths', 'test_courage', 'force_confrontation']),
            'history_description': 'ancient concept rooted in folklore across cultures',
            'history_description_detail': 'Recognized across numerous cultural traditions as a time of supernatural significance.',
            'history_tags': json.dumps(['ancient_liminal_concept', 'folklore_traditions', 'supernatural_associations'])
        },
        {
            'story_id': '1',
            'class_id': base_classes['thought'],
            'type': 'thought',
            'base_type': 'thought',
            'name': 'Should I Tell Him',
            'description': 'Sarah internal debate about revealing supernatural ability',
            'description_detail': 'The complex internal monologue running through Sarah mind as she wrestles with the decision to reveal her supernatural sensitivity.',
            'form_description': 'racing internal monologue weighing risks and benefits',
            'form_description_detail': 'A rapid-fire mental debate characterized by conflicting impulses, fear-based reasoning, and hope for understanding.',
            'form_tags': json.dumps(['internal', 'conflicted', 'rapid', 'weighing_options']),
            'function_description': 'reveals character internal struggle and builds tension',
            'function_description_detail': 'Provides crucial insight into Sarah psychological state while creating narrative tension through the uncertainty of her decision.',
            'function_tags': json.dumps(['reveals_conflict', 'builds_tension', 'shows_process', 'character_development']),
            'character_description': 'anxious and careful, torn between connection and fear',
            'character_description_detail': 'Marked by the painful tension between Sarah deep desire for authentic human connection and her learned caution.',
            'character_tags': json.dumps(['anxious', 'careful', 'torn', 'vulnerable']),
            'goal_description': 'find courage to share truth while protecting from rejection',
            'goal_description_detail': 'Seeks to discover a way to be honest about her supernatural sensitivity while minimizing the risk of being dismissed.',
            'goal_tags': json.dumps(['find_courage', 'share_truth', 'protect_self', 'connect_safely']),
            'history_description': 'recurring pattern of hiding ability due to childhood trauma',
            'history_description_detail': 'Rooted in painful childhood experiences where early attempts to share her supernatural perceptions resulted in disbelief.',
            'history_tags': json.dumps(['recurring_pattern', 'hiding_ability', 'childhood_trauma', 'fear_based'])
        }
    ]
    
    # Insert entities and collect their IDs
    entity_ids = {}
    for entity in entities:
        cursor = conn.execute('''
            INSERT INTO entities (story_id, class_id, type, base_type, name, description, description_detail,
                                form_description, form_description_detail, form_tags,
                                function_description, function_description_detail, function_tags,
                                character_description, character_description_detail, character_tags,
                                goal_description, goal_description_detail, goal_tags,
                                history_description, history_description_detail, history_tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            entity['story_id'], entity['class_id'], entity['type'], entity['base_type'],
            entity['name'], entity['description'], entity['description_detail'],
            entity['form_description'], entity['form_description_detail'], entity['form_tags'],
            entity['function_description'], entity['function_description_detail'], entity['function_tags'],
            entity['character_description'], entity['character_description_detail'], entity['character_tags'],
            entity['goal_description'], entity['goal_description_detail'], entity['goal_tags'],
            entity['history_description'], entity['history_description_detail'], entity['history_tags']
        ))
        entity_ids[entity['name']] = cursor.lastrowid
    
    # Create sample states
    state_ids = {}
    states = [
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'entity_id': entity_ids['Sarah Chen'],
            'attributes': json.dumps({})
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'entity_id': entity_ids['Golden Fishing Rod'],
            'attributes': json.dumps({})
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'entity_id': entity_ids['Misty Lake Dock'],
            'attributes': json.dumps({})
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'entity_id': entity_ids['3AM Witching Hour'],
            'attributes': json.dumps({})
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'entity_id': entity_ids['Should I Tell Him'],
            'attributes': json.dumps({})
        }
    ]
    
    for i, state in enumerate(states):
        cursor = conn.execute('''
            INSERT INTO states (story_id, timeline_id, scene_id, beat_id, entity_id, attributes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            state['story_id'], state['timeline_id'], state['scene_id'], 
            state['beat_id'], state['entity_id'], state['attributes']
        ))
        state_ids[i] = cursor.lastrowid
    
    # Create sample relationships with LLM-style descriptions
    relationships = [
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'state_id1': state_ids[0],  # Sarah
            'state_id2': state_ids[1],  # Fishing Rod
            'description': 'gripping with nostalgic determination',
            'description_detail': 'Sarah\'s scarred hands wrap around the familiar grip of her grandfather\'s rod with a mixture of reverence and resolve, the warm metal serving as both practical tool and emotional anchor to family memories that give her strength in moments of uncertainty.'
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'state_id1': state_ids[0],  # Sarah
            'state_id2': state_ids[2],  # Dock
            'description': 'standing vulnerably on sacred ground',
            'description_detail': 'Sarah positions herself on the weathered planks with deliberate intention, knowing this dock has witnessed generations of family confessions and that its mystical atmosphere will either support her courage or amplify her fears as she prepares to reveal her deepest secret.'
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'state_id1': state_ids[0],  # Sarah
            'state_id2': state_ids[4],  # Thought
            'description': 'wrestling with internal conflict',
            'description_detail': 'Sarah\'s mind races through the familiar cycle of fear and hope, her supernatural sensitivity making her acutely aware of the emotional weight of potential revelation while her desperate need for authentic connection pushes against years of protective secrecy.'
        },
        {
            'story_id': '1',
            'timeline_id': '1:tl1',
            'scene_id': '1:s1',
            'beat_id': '1:b3',
            'state_id1': state_ids[2],  # Dock
            'state_id2': state_ids[3],  # Time
            'description': 'mystical convergence amplifying supernatural energy',
            'description_detail': 'The ancient dock seems to pulse with otherworldly energy as the witching hour approaches, the mist rolling in with supernatural timing that transforms the familiar fishing spot into a liminal space where truth-telling becomes inevitable and the veil between worlds grows dangerously thin.'
        }
    ]
    
    for relationship in relationships:
        conn.execute('''
            INSERT INTO relationships (story_id, timeline_id, scene_id, beat_id, state_id1, state_id2, description, description_detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            relationship['story_id'], relationship['timeline_id'], relationship['scene_id'],
            relationship['beat_id'], relationship['state_id1'], relationship['state_id2'],
            relationship['description'], relationship['description_detail']
        ))

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    print(f'User connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'User disconnected: {request.sid}')

@socketio.on('load_entities')
def handle_load_entities():
    """Load all entities from database"""
    try:
        conn = get_db()
        entities = conn.execute('''
            SELECT e.*, c.type as class_type, c.details as class_details 
            FROM entities e
            LEFT JOIN classes c ON e.class_id = c.class_id
            WHERE e.story_id = ? 
            ORDER BY e.base_type, e.name
        ''', ('1',)).fetchall()
        conn.close()
        
        result = [dict(entity) for entity in entities]
        emit('entities_loaded', result)
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('user_message')
def handle_user_message(data):
    """Process user message and respond"""
    content = data['content']
    
    response = generate_story_response(content)
    
    emit('story_response', {'content': response})

@socketio.on('update_entity')
def handle_update_entity(data):
    """Update entity in database"""
    entity_id = data['entity_id']
    updates = data['updates']
    
    try:
        conn = get_db()
        
        set_clauses = []
        values = []
        
        for field, value in updates.items():
            set_clauses.append(f'{field} = ?')
            values.append(value)
        
        if set_clauses:
            set_clauses.append('updated_at = ?')
            values.append(datetime.now().isoformat())
            values.append(entity_id)
            
            query = f"UPDATE entities SET {', '.join(set_clauses)} WHERE entity_id = ?"
            conn.execute(query, values)
            conn.commit()
            
            updated_entity = conn.execute('SELECT * FROM entities WHERE entity_id = ?', (entity_id,)).fetchone()
            emit('entity_updated', dict(updated_entity))
        
        conn.close()
        
    except Exception as e:
        emit('error', {'message': str(e)})

def get_class_hierarchy(conn, class_id):
    """Get the full inheritance chain for a class"""
    hierarchy = []
    current_id = class_id
    
    while current_id:
        class_row = conn.execute('SELECT * FROM classes WHERE class_id = ?', (current_id,)).fetchone()
        if class_row:
            hierarchy.append(dict(class_row))
            current_id = class_row['parent_class_id']
        else:
            break
    
    return hierarchy

@socketio.on('get_class_attributes')
def handle_get_class_attributes(data):
    """Get available attributes for an entity's class hierarchy"""
    class_id = data['class_id']
    entity_id = data['entity_id']
    
    try:
        conn = get_db()
        
        # Get merged attributes from class hierarchy (these are the available keys)
        class_hierarchy_attributes = merge_class_attributes(conn, class_id)
        
        # Get current entity's merged attributes (class keys + entity values)
        current_attributes = get_entity_merged_attributes(conn, entity_id)
        
        # Get all possible attribute keys from the class hierarchy
        attribute_keys = list(class_hierarchy_attributes.keys())
        
        emit('class_attributes_loaded', {
            'entity_id': entity_id,
            'available_attributes': attribute_keys,
            'current_attributes': current_attributes
        })
        
        conn.close()
        
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('add_entity_attribute')
def handle_add_entity_attribute(data):
    """Add a new attribute key to an entity's class (propagates to all entities of that class)"""
    entity_id = data['entity_id']
    attribute_key = data['attribute_key']
    attribute_value = data.get('attribute_value', '')  # Default to empty string, not NULL
    
    try:
        conn = get_db()
        
        # Get entity's class info
        entity = conn.execute('SELECT class_id FROM entities WHERE entity_id = ?', (entity_id,)).fetchone()
        if not entity:
            emit('error', {'message': 'Entity not found'})
            return
        
        # Get current class attributes
        current_class_attrs = conn.execute(
            'SELECT attributes FROM classes WHERE class_id = ?', 
            (entity['class_id'],)
        ).fetchone()
        
        if current_class_attrs:
            attrs = json.loads(current_class_attrs['attributes'])
            
            # Add new attribute key to the class if it doesn't exist
            if attribute_key not in attrs:
                attrs[attribute_key] = ''  # Default empty value for the class definition
                
                # Update the class
                conn.execute(
                    'UPDATE classes SET attributes = ?, updated_at = ? WHERE class_id = ?',
                    (json.dumps(attrs), datetime.now().isoformat(), entity['class_id'])
                )
                
                # Propagate to all entities of this class - add the key with empty value
                propagate_class_attribute_to_entities(conn, entity['class_id'], attribute_key)
        
        # Set the value for this specific entity
        if attribute_value:  # Only set if a value was provided
            update_entity_state_attribute(conn, entity_id, attribute_key, attribute_value)
        
        # Get updated attributes for response (merged from class + entity state)
        merged_attributes = get_entity_merged_attributes(conn, entity_id)
        
        emit('attribute_updated', {
            'entity_id': entity_id,
            'attributes': merged_attributes
        })
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        emit('error', {'message': str(e)})

def get_entity_merged_attributes(conn, entity_id):
    """Get merged attributes for an entity (class hierarchy + entity state)"""
    # Get entity's class
    entity = conn.execute('SELECT class_id FROM entities WHERE entity_id = ?', (entity_id,)).fetchone()
    if not entity:
        return {}
    
    # Get all attributes from class hierarchy
    class_attributes = merge_class_attributes(conn, entity['class_id'])
    
    # Get entity's current state attributes
    current_state = conn.execute('''
        SELECT attributes FROM states 
        WHERE entity_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
    ''', (entity_id,)).fetchone()
    
    entity_attributes = {}
    if current_state and current_state['attributes']:
        entity_attributes = json.loads(current_state['attributes'])
    
    # Merge: class attributes provide the keys, entity attributes provide the values
    merged = {}
    for key in class_attributes.keys():
        merged[key] = entity_attributes.get(key, '')  # Empty string if not set in entity state
    
    return merged

def propagate_class_attribute_to_entities(conn, class_id, attribute_key):
    """Add a new attribute key to all entities of a given class with empty value"""
    # Get all entities of this class
    entities = conn.execute(
        'SELECT entity_id FROM entities WHERE class_id = ?', 
        (class_id,)
    ).fetchall()
    
    # For each entity, ensure they have a state record with the new attribute key
    for entity in entities:
        # Get current state
        current_state = conn.execute('''
            SELECT state_id, attributes FROM states 
            WHERE entity_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        ''', (entity['entity_id'],)).fetchone()
        
        if current_state:
            # Update existing state to include new key
            attributes = json.loads(current_state['attributes']) if current_state['attributes'] else {}
            if attribute_key not in attributes:
                attributes[attribute_key] = ''  # Empty value by default
                
                conn.execute(
                    'UPDATE states SET attributes = ?, updated_at = ? WHERE state_id = ?',
                    (json.dumps(attributes), datetime.now().isoformat(), current_state['state_id'])
                )
        # Note: If no state exists, it will be created when the entity is accessed

@socketio.on('update_entity_attribute')
def handle_update_entity_attribute(data):
    """Update an existing entity attribute value"""
    entity_id = data['entity_id']
    attribute_key = data['attribute_key']
    attribute_value = data['attribute_value']
    
    try:
        conn = get_db()
        
        # Update state attribute
        update_entity_state_attribute(conn, entity_id, attribute_key, attribute_value)
        
        # Get updated merged attributes for response
        merged_attributes = get_entity_merged_attributes(conn, entity_id)
        
        emit('attribute_updated', {
            'entity_id': entity_id,
            'attributes': merged_attributes
        })
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('remove_entity_attribute')
def handle_remove_entity_attribute(data):
    """Remove an attribute from an entity"""
    entity_id = data['entity_id']
    attribute_key = data['attribute_key']
    
    try:
        conn = get_db()
        
        # Get current state attributes
        current_state = conn.execute('''
            SELECT state_id, attributes FROM states 
            WHERE entity_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        ''', (entity_id,)).fetchone()
        
        if current_state and current_state['attributes']:
            attributes = json.loads(current_state['attributes'])
            if attribute_key in attributes:
                del attributes[attribute_key]
                
                # Update state
                conn.execute(
                    'UPDATE states SET attributes = ?, updated_at = ? WHERE state_id = ?',
                    (json.dumps(attributes), datetime.now().isoformat(), current_state['state_id'])
                )
                
                emit('attribute_updated', {
                    'entity_id': entity_id,
                    'attributes': attributes
                })
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        emit('error', {'message': str(e)})

def update_entity_state_attribute(conn, entity_id, attribute_key, attribute_value):
    """Update or create an entity state with the given attribute"""
    # Get the most recent state for this entity
    current_state = conn.execute('''
        SELECT state_id, attributes FROM states 
        WHERE entity_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
    ''', (entity_id,)).fetchone()
    
    if current_state:
        # Update existing state
        attributes = json.loads(current_state['attributes']) if current_state['attributes'] else {}
        attributes[attribute_key] = attribute_value
        
        conn.execute(
            'UPDATE states SET attributes = ?, updated_at = ? WHERE state_id = ?',
            (json.dumps(attributes), datetime.now().isoformat(), current_state['state_id'])
        )
    else:
        # Create new state (this shouldn't normally happen, but handle it)
        attributes = {attribute_key: attribute_value}
        
        conn.execute('''
            INSERT INTO states (story_id, timeline_id, scene_id, beat_id, entity_id, attributes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', ('1', '1:tl1', '1:s1', '1:b3', entity_id, json.dumps(attributes)))

def propagate_class_attribute_to_entities(conn, class_id, attribute_key):
    """Add a new attribute key to all entities of a given class with empty value"""
    # Get all entities of this class
    entities = conn.execute(
        'SELECT entity_id FROM entities WHERE class_id = ?', 
        (class_id,)
    ).fetchall()
    
    # For each entity, ensure they have a state record with the new attribute key
    for entity in entities:
        # Get current state
        current_state = conn.execute('''
            SELECT state_id, attributes FROM states 
            WHERE entity_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        ''', (entity['entity_id'],)).fetchone()
        
        if current_state:
            # Update existing state to include new key
            attributes = json.loads(current_state['attributes']) if current_state['attributes'] else {}
            if attribute_key not in attributes:
                attributes[attribute_key] = ''  # Empty value by default
                
                conn.execute(
                    'UPDATE states SET attributes = ?, updated_at = ? WHERE state_id = ?',
                    (json.dumps(attributes), datetime.now().isoformat(), current_state['state_id'])
                )
        # Note: If no state exists, it will be created when the entity is accessed

def merge_class_attributes(conn, class_id):
    """Merge attributes from entire class inheritance chain"""
    hierarchy = get_class_hierarchy(conn, class_id)
    merged_attributes = {}
    
    # Start from base and work down to most specific
    for class_data in reversed(hierarchy):
        if class_data['attributes']:
            class_attributes = json.loads(class_data['attributes'])
            merged_attributes.update(class_attributes)
    
    return merged_attributes

def generate_story_response(user_input):
    """Generate AI response to user input"""
    user_input_lower = user_input.lower()
    
    if 'sarah' in user_input_lower:
        responses = [
            "Sarah's hands trembled slightly as she adjusted her grip on the fishing rod.",
            "Sarah felt the familiar tingling sensation that meant something supernatural was near.",
            "Sarah's scars began to ache, a sure sign that the veil between worlds was thinning."
        ]
        return responses[hash(user_input) % len(responses)]
    
    elif 'fishing rod' in user_input_lower or 'rod' in user_input_lower:
        responses = [
            "The golden fishing rod grew warm in Sarah's hands, its supernatural charge responding to her emotions.",
            "The fishing rod began to vibrate gently, as if sensing something in the water below.",
            "The antique rod seemed to pulse with its own heartbeat, connecting Sarah to her grandfather's memory."
        ]
        return responses[hash(user_input) % len(responses)]
    
    elif 'dock' in user_input_lower:
        responses = [
            "The old dock creaked beneath her feet, each board holding decades of memories.",
            "Fog began to roll in from the lake, wrapping around the dock like ghostly fingers.",
            "The dock seemed to exist in its own pocket of time, where past and present blurred together."
        ]
        return responses[hash(user_input) % len(responses)]
    
    elif any(word in user_input_lower for word in ['3am', 'witching', 'hour', 'night']):
        responses = [
            "The witching hour approached, and Sarah could feel the boundaries between worlds growing thin.",
            "As 3 AM neared, the shadows seemed to move independently, defying the moonlight.",
            "The supernatural activity always peaked at this hour, when truth could no longer hide."
        ]
        return responses[hash(user_input) % len(responses)]
    
    elif '?' in user_input:
        responses = [
            "Sarah whispered her question into the mist, hoping for an answer she wasn't sure she wanted to hear.",
            "The words hung in the air between them, heavy with unspoken implications.",
            "Her question echoed across the water, disturbing the supernatural silence of the night."
        ]
        return responses[hash(user_input) % len(responses)]
    
    else:
        responses = [
            "The mist swirled around them, carrying secrets from the depths of the lake.",
            "Something stirred in the darkness beyond the dock, just at the edge of perception.",
            "Sarah felt the weight of family history pressing down on this moment.",
            "The night air crackled with potential, as if the story itself was holding its breath.",
            "Time seemed suspended, caught between what was said and what remained hidden."
        ]
        return responses[hash(user_input) % len(responses)]

@app.route('/')
def index():
    """Serve the main HTML page"""
    return render_template('index.html')

# REST API endpoints
@app.route('/api/entities')
def get_entities():
    """Get all entities"""
    try:
        conn = get_db()
        entities = conn.execute('''
            SELECT e.*, c.type as class_type, c.details as class_details 
            FROM entities e
            LEFT JOIN classes c ON e.class_id = c.class_id
            ORDER BY e.base_type, e.name
        ''').fetchall()
        conn.close()
        return [dict(entity) for entity in entities]
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/api/entities/<int:entity_id>')
def get_entity(entity_id):
    """Get specific entity"""
    try:
        conn = get_db()
        entity = conn.execute('SELECT * FROM entities WHERE entity_id = ?', (entity_id,)).fetchone()
        conn.close()
        
        if entity:
            return dict(entity)
        else:
            return {'error': 'Entity not found'}, 404
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/api/relationships')
def get_relationships():
    """Get relationships with entity details"""
    try:
        conn = get_db()
        relationships = conn.execute('''
            SELECT r.*, 
                   e1.name as entity1_name, e1.base_type as entity1_base_type,
                   e2.name as entity2_name, e2.base_type as entity2_base_type
            FROM relationships r
            JOIN states s1 ON r.state_id1 = s1.state_id
            JOIN states s2 ON r.state_id2 = s2.state_id
            JOIN entities e1 ON s1.entity_id = e1.entity_id
            JOIN entities e2 ON s2.entity_id = e2.entity_id
            ORDER BY r.beat_id, r.created_at
        ''').fetchall()
        conn.close()
        return [dict(rel) for rel in relationships]
    except Exception as e:
        return {'error': str(e)}, 500

if __name__ == '__main__':
    init_db()
    print("Starting Storywriter Flask-SocketIO server...")
    print("Visit http://localhost:5000 to view the storytelling application")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)