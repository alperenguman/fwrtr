from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import sqlite3
import json
from datetime import datetime
import os
import re
from werkzeug.utils import secure_filename

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
    """Initialize database with schema only"""
    if not os.path.exists(DATABASE):
        print("Creating database...")
        conn = get_db()
        
        # Read SQL schema from file
        with open('schema.sql', 'r') as f:
            schema = f.read()
        
        conn.executescript(schema)
        conn.commit()
        conn.close()
        print("Database initialized with schema only")
        print("To add sample data, run: sqlite3 storywriter.db < sample_data.sql")

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

@socketio.on('evaluate_entry')
def handle_evaluate_entry(data):
    """Manually evaluate a story entry using EvalAgent"""
    story_entry_id = data.get('story_entry_id')
    if not story_entry_id:
        emit('evaluation_result', {'success': False, 'error': 'No story_entry_id provided'})
        return

    conn = get_db()
    entry = conn.execute('SELECT story_id, scene_id, beat_id, raw_text FROM stories WHERE story_entry_id = ?', (story_entry_id,)).fetchone()
    if not entry:
        emit('evaluation_result', {'success': False, 'error': 'Entry not found'})
        return

    from eval_agent import EvalAgent
    eval_agent = EvalAgent('EvalAgent', 1, conn)
    res = eval_agent.execute(entry['story_id'], entry['scene_id'], entry['beat_id'], entry['raw_text'])

    if res.get('success'):
        conn.execute(
            'UPDATE stories SET text_content = ?, updated_at = ? WHERE story_entry_id = ?',
            (res['processed_text'], datetime.now().isoformat(), story_entry_id)
        )
        conn.commit()

    res['story_entry_id'] = story_entry_id
    res['raw_text'] = entry['raw_text']
    emit('evaluation_result', res)

@socketio.on('user_message')
def handle_user_message(data):
    """Process user message and respond with immediate generation"""
    content = data['content']
    story_id = data.get('story_id', '1')
    scene_id = data.get('scene_id', '1:s1')
    beat_id = data.get('beat_id', '1:b3')
    skip_eval = data.get('skip_eval', False)
    skip_eval = data.get('skip_eval', False)
    
    print(f"=== USER MESSAGE REQUEST ===")
    print(f"User input: {content}")
    print(f"Story ID: {story_id}, Scene: {scene_id}, Beat: {beat_id}")
    
    try:
        # Import and create GeneratorAgent
        from generator_agent import GeneratorAgent
        
        print("Creating GeneratorAgent for user message...")
        generator = GeneratorAgent('GeneratorAgent', 1, get_db())
        print(f"GeneratorAgent created successfully")
        
        # Generate story content using immediate mode
        print("Calling generator.execute for user message with streaming...")
        result = generator.execute(
            story_id=story_id,
            scene_id=scene_id,
            beat_id=beat_id,
            user_input=content,
            generation_mode="immediate",
            stream_callback=lambda chunk: socketio.emit('generation_stream', {'chunk': chunk}, to=request.sid)
        )

        if not skip_eval:
            # Evaluate with EvalAgent
            from eval_agent import EvalAgent
            eval_agent = EvalAgent('EvalAgent', 1, get_db())
            eval_res = eval_agent.execute(story_id, scene_id, beat_id, result['generated_text'])
            if eval_res.get('success'):
                processed_text = eval_res['processed_text']
                generator.update_story_entry_text(result['story_entry_id'], processed_text)
                result['generated_text'] = processed_text
                result['segments'] = eval_res.get('segments')
                result['new_scene'] = eval_res.get('new_scene')
                result['new_beat'] = eval_res.get('new_beat')
        
        print(f"User message generation result: {result}")
        
        if result['success']:
            print("✓ User message generation successful, sending response...")
            emit('story_response', {
                'content': result['generated_text'],
                'success': True,
                'generation_mode': 'chat',
                'story_entry_id': result.get('story_entry_id'),
                'new_scene': result.get('new_scene'),
                'new_beat': result.get('new_beat'),
                'raw_text': result.get('raw_text'),
                'segments': result.get('segments')
            })
        else:
            print(f"✗ User message generation failed: {result['error']}")
            emit('story_response', {
                'success': False,
                'error': result['error']
            })
            
    except Exception as e:
        print(f"✗ Exception in handle_user_message: {e}")
        import traceback
        traceback.print_exc()
        emit('story_response', {
            'success': False,
            'error': f"Server error: {str(e)}"
        })

@socketio.on('generate_immediate')
def handle_immediate_generation(data):
    """Handle immediate story generation (red flash)"""
    user_input = data.get('content', '')
    story_id = data.get('story_id', '1')
    scene_id = data.get('scene_id', '1:s1')
    beat_id = data.get('beat_id', '1:b3')
    skip_eval = data.get('skip_eval', False)
    
    print(f"=== IMMEDIATE GENERATION REQUEST ===")
    print(f"User input: {user_input}")
    print(f"Story ID: {story_id}, Scene: {scene_id}, Beat: {beat_id}")
    
    try:
        # Import and create GeneratorAgent
        from generator_agent import GeneratorAgent
        
        print("Creating GeneratorAgent...")
        generator = GeneratorAgent('GeneratorAgent', 1, get_db())
        print(f"GeneratorAgent created successfully")
        print(f"Agent config: {generator.config['name']}")
        
        # Generate story content with streaming
        print("Calling generator.execute with streaming...")
        result = generator.execute(
            story_id=story_id,
            scene_id=scene_id,
            beat_id=beat_id,
            user_input=user_input,
            generation_mode="immediate",
            stream_callback=lambda chunk: socketio.emit('generation_stream', {'chunk': chunk}, to=request.sid)
        )

        if not skip_eval:
            # Evaluate the generated text for beat/scene boundaries
            from eval_agent import EvalAgent
            eval_agent = EvalAgent('EvalAgent', 1, get_db())
            eval_res = eval_agent.execute(story_id, scene_id, beat_id, result['generated_text'])
            if eval_res.get('success'):
                processed_text = eval_res['processed_text']
                generator.update_story_entry_text(result['story_entry_id'], processed_text)
                result['generated_text'] = processed_text
                result['segments'] = eval_res.get('segments')
                result['new_scene'] = eval_res.get('new_scene')
                result['new_beat'] = eval_res.get('new_beat')
        
        print(f"Generation result: {result}")
        
        if result['success']:
            print("✓ Generation successful, sending response...")
            emit('generation_complete', {
                'success': True,
                'generated_text': result['generated_text'],
                'generation_mode': 'immediate',
                'story_entry_id': result.get('story_entry_id'),
                'flash_color': 'red',
                'new_scene': result.get('new_scene'),
                'new_beat': result.get('new_beat'),
                'raw_text': result.get('raw_text'),
                'segments': result.get('segments')
            })
        else:
            print(f"✗ Generation failed: {result['error']}")
            emit('generation_error', {
                'success': False,
                'error': result['error'],
                'flash_color': 'red'
            })
            
    except Exception as e:
        print(f"✗ Exception in handle_immediate_generation: {e}")
        import traceback
        traceback.print_exc()
        emit('generation_error', {
            'success': False,
            'error': f"Server error: {str(e)}",
            'flash_color': 'red'
        })

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


@app.route('/api/representations', methods=['POST'])
def upload_representation():
    """Upload a media representation with accompanying text and create nodes."""
    try:
        media = request.files.get('media')
        text = request.form.get('text', '')
        rep_type = request.form.get('type', 'visual')
        style = request.form.get('style')
        composition = request.form.get('composition')
        relationship_id = request.form.get('relationship_id')
        state_id = request.form.get('state_id')
        story_id = request.form.get('story_id', '1')
        scene_id = request.form.get('scene_id', '1:s1')
        beat_id = request.form.get('beat_id', '1:b1')

        asset_link = None
        if media:
            filename = secure_filename(media.filename)
            upload_dir = os.path.join('static', 'uploads')
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, filename)
            media.save(file_path)
            asset_link = file_path

        conn = get_db()
        cur = conn.execute(
            'INSERT INTO representations (relationship_id, state_id, type, style, composition, asset_link) '
            'VALUES (?, ?, ?, ?, ?, ?)',
            (relationship_id, state_id, rep_type, style, composition, asset_link)
        )
        representation_id = cur.lastrowid

        created_nodes = []

        if text:
            story_context = {
                'story_id': story_id,
                'scene_id': scene_id,
                'beat_id': beat_id
            }
            from entity_agent import EntityAgent
            agent = EntityAgent('EntityAgent', 1, conn)
            res = agent.execute(text, story_context, extract_only=True)
            if res.get('success'):
                entities = res.get('entities', [])
                for ent in entities:
                    cur = conn.execute(
                        'INSERT INTO nodes (representation_id, entity_id, node_type, content) '
                        'VALUES (?, ?, ?, ?)',
                        (representation_id, ent.get('entity_id'), 'entity', ent['name'])
                    )
                    created_nodes.append({'node_id': cur.lastrowid, 'type': 'entity', 'content': ent['name']})

                # Simple relationship node using first two entities if available
                if len(entities) >= 2:
                    rel_content = f"{entities[0]['name']} related to {entities[1]['name']}"
                    cur = conn.execute(
                        'INSERT INTO nodes (representation_id, node_type, content) VALUES (?, ?, ?)',
                        (representation_id, 'relationship', rel_content)
                    )
                    created_nodes.append({'node_id': cur.lastrowid, 'type': 'relationship', 'content': rel_content})

            # Basic state nodes - split text into sentences
            sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
            for s in sentences:
                cur = conn.execute(
                    'INSERT INTO nodes (representation_id, node_type, content) VALUES (?, ?, ?)',
                    (representation_id, 'state', s)
                )
                created_nodes.append({'node_id': cur.lastrowid, 'type': 'state', 'content': s})

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'representation_id': representation_id, 'nodes': created_nodes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    print("Starting Storywriter Flask-SocketIO server...")
    print("Visit http://localhost:5000 to view the storytelling application")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
