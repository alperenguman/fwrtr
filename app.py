from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import sqlite3
import json
from datetime import datetime
import os
import uuid

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
        
        # Insert sample data
        with open('sample_data.sql', 'r') as f:
            sample_data = f.read()
        
        conn.executescript(sample_data)
        conn.commit()
        conn.close()
        print("Database initialized with sample data")

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
        entities = conn.execute('SELECT * FROM entities WHERE story_id = ? ORDER BY type, name', ('1',)).fetchall()
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
    
    # Store the interaction
    event_id = str(uuid.uuid4())
    conn = get_db()
    conn.execute('''
        INSERT INTO story_events (event_id, story_id, event_type, content, metadata)
        VALUES (?, ?, ?, ?, ?)
    ''', (event_id, '1', 'user_message', content, json.dumps({'timestamp': datetime.now().isoformat()})))
    
    conn.execute('''
        INSERT INTO story_events (event_id, story_id, event_type, content, metadata)
        VALUES (?, ?, ?, ?, ?)
    ''', (str(uuid.uuid4()), '1', 'ai_response', response, json.dumps({'timestamp': datetime.now().isoformat()})))
    
    conn.commit()
    conn.close()
    
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
            if field == 'custom_attributes':
                current = conn.execute('SELECT custom_attributes FROM entities WHERE id = ?', (entity_id,)).fetchone()
                if current:
                    custom_attrs = json.loads(current['custom_attributes'] or '{}')
                    custom_attrs.update(value)
                    set_clauses.append('custom_attributes = ?')
                    values.append(json.dumps(custom_attrs))
            else:
                set_clauses.append(f'{field} = ?')
                values.append(value)
        
        if set_clauses:
            set_clauses.append('updated_at = ?')
            values.append(datetime.now().isoformat())
            values.append(entity_id)
            
            query = f"UPDATE entities SET {', '.join(set_clauses)} WHERE id = ?"
            conn.execute(query, values)
            conn.commit()
            
            updated_entity = conn.execute('SELECT * FROM entities WHERE id = ?', (entity_id,)).fetchone()
            emit('entity_updated', dict(updated_entity))
        
        conn.close()
        
    except Exception as e:
        emit('error', {'message': str(e)})

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
        entities = conn.execute('SELECT * FROM entities ORDER BY type, name').fetchall()
        conn.close()
        return [dict(entity) for entity in entities]
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/api/entities/<entity_id>')
def get_entity(entity_id):
    """Get specific entity"""
    try:
        conn = get_db()
        entity = conn.execute('SELECT * FROM entities WHERE id = ?', (entity_id,)).fetchone()
        conn.close()
        
        if entity:
            return dict(entity)
        else:
            return {'error': 'Entity not found'}, 404
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/api/story-events')
def get_story_events():
    """Get story event history"""
    try:
        conn = get_db()
        events = conn.execute('SELECT * FROM story_events ORDER BY created_at DESC LIMIT 50').fetchall()
        conn.close()
        return [dict(event) for event in events]
    except Exception as e:
        return {'error': str(e)}, 500

if __name__ == '__main__':
    init_db()
    print("Starting Storywriter Flask-SocketIO server...")
    print("Visit http://localhost:5000 to view the storytelling application")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)