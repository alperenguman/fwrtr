#!/usr/bin/env python3
"""
Agent Testing Toolkit for Storywriter
Simple CLI testing of agents with existing database/schema
"""

import os
import sys
import json
import sqlite3
import argparse
from datetime import datetime

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from base_agent import BaseAgent
from prep_agent import PrepAgent
from entity_agent import EntityAgent


class AgentTestKit:
    """Simple testing toolkit for Storywriter agents"""
    
    def __init__(self, db_path: str = "storywriter.db"):
        self.db_path = db_path
        self.db = None
        self.agents = {}
        
    def __enter__(self):
        # Initialize database if it doesn't exist
        if not os.path.exists(self.db_path):
            print(f"Database {self.db_path} not found, creating from schema.sql...")
            self._create_database_from_schema()
        
        self.db = sqlite3.connect(self.db_path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        
        # Ensure test agents exist
        self._ensure_test_agents()
        
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.db:
            self.db.close()
    
    def _create_database_from_schema(self):
        """Create database from schema.sql"""
        if not os.path.exists('schema.sql'):
            raise FileNotFoundError("schema.sql not found. Run from storywriter directory.")
        
        conn = sqlite3.connect(self.db_path)
        try:
            with open('schema.sql', 'r') as f:
                conn.executescript(f.read())
            conn.commit()
            print(f"Database created from schema.sql")
        finally:
            conn.close()
    
    def _ensure_test_agents(self):
        """Create test agents if they don't exist"""
        try:
            # Check if agents table exists
            table_exists = self.db.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='agents'
            """).fetchone()
            
            if not table_exists:
                self._create_test_agents()
                return
            
            # Check if we have test agents (look for PrepAgent and EntityAgent types)
            existing = self.db.execute("""
                SELECT COUNT(*) as count FROM agents 
                WHERE agent_type IN ('PrepAgent', 'EntityAgent')
            """).fetchone()['count']
            
            if existing < 2:
                self._create_test_agents()
                
        except Exception as e:
            print(f"Error with agents table: {e}")
            self._create_test_agents()
    
    def _create_test_agents(self):
        """Create test agent configurations"""
        # Create agents table if it doesn't exist (with INTEGER PRIMARY KEY)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                agent_id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_type TEXT NOT NULL,
                agent_version TEXT NOT NULL,
                agent_name TEXT,
                agent_description TEXT,
                agent_instructions TEXT,
                agent_function_calls JSON,
                model TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create agent_executions table if it doesn't exist (with INTEGER agent_id reference)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS agent_executions (
                agent_execution_id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id INTEGER NOT NULL,
                story_id TEXT NOT NULL,
                story_entry_id INTEGER,
                source_text TEXT,
                output_text TEXT,
                request_time TIMESTAMP NOT NULL,
                output_time TIMESTAMP,
                processing_duration_ms INTEGER,
                status_message TEXT,
                tokens INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
            )
        """)
        
        agents = [
            {
                'agent_type': 'PrepAgent',
                'agent_version': 'v1.0',
                'agent_name': 'Prep Agent Test',
                'agent_description': 'Prepares context for story generation',
                'agent_instructions': 'Prepare comprehensive context from entity relationships and user input.',
                'agent_function_calls': '{}',
                'model': 'gpt-4',
                'is_active': True
            },
            {
                'agent_type': 'EntityAgent',
                'agent_version': 'v1.0', 
                'agent_name': 'Entity Agent Test',
                'agent_description': 'Extracts and manages entities from text',
                'agent_instructions': 'Extract entities and classify them properly.',
                'agent_function_calls': '{}',
                'model': 'gpt-3.5-turbo',
                'is_active': True
            }
        ]
        
        # Check if agents already exist to avoid duplicates
        existing_count = self.db.execute("""
            SELECT COUNT(*) as count FROM agents 
            WHERE agent_type IN ('PrepAgent', 'EntityAgent')
        """).fetchone()['count']
        
        if existing_count >= 2:
            print("Test agents already exist.")
            return
        
        for agent in agents:
            # Use regular INSERT (not INSERT OR REPLACE) with auto-increment
            cursor = self.db.execute("""
                INSERT INTO agents 
                (agent_type, agent_version, agent_name, agent_description,
                 agent_instructions, agent_function_calls, model, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (agent['agent_type'], agent['agent_version'],
                  agent['agent_name'], agent['agent_description'], agent['agent_instructions'],
                  agent['agent_function_calls'], agent['model'], agent['is_active']))
            
            agent_id = cursor.lastrowid
            print(f"Created {agent['agent_type']} with ID: {agent_id}")
        
        self.db.commit()
        print("Test agents created with auto-incremented IDs.")
    
    def get_agent(self, agent_type: str):
        """Get agent instance by finding the agent ID from database"""
        # Find agent by type
        cursor = self.db.execute("""
            SELECT agent_id FROM agents 
            WHERE agent_type = ? AND is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 1
        """, (agent_type.title() + 'Agent',))
        
        result = cursor.fetchone()
        if not result:
            raise ValueError(f"No active {agent_type} agent found in database")
        
        agent_id = result['agent_id']
        
        # Create agent instance with the database ID
        if agent_id not in self.agents:
            if agent_type == 'prep':
                self.agents[agent_id] = PrepAgent(agent_id, self.db)
            elif agent_type == 'entity':
                self.agents[agent_id] = EntityAgent(agent_id, self.db)
            else:
                raise ValueError(f"Unknown agent type: {agent_type}")
        
        return self.agents[agent_id]
    
    def test_prep_agent(self, user_input: str = "", story_id: str = "1", 
                       scene_id: str = "1:s1", beat_id: str = "1:b3"):
        """Test PrepAgent"""
        print("=" * 60)
        print(f"TESTING PREP AGENT")
        print(f"User Input: '{user_input}'")
        print("-" * 60)
        
        try:
            # Extract entities from user input first
            prompt_entities = []
            if user_input.strip():
                entity_agent = self.get_agent('entity')
                entity_result = entity_agent.execute(
                    story_text=user_input,
                    story_context={'story_id': story_id, 'scene_id': scene_id, 'beat_id': beat_id, 'timeline_id': '1:tl1'},
                    extract_only=True
                )
                if entity_result['success']:
                    prompt_entities = entity_result['entities']
                    print(f"Found {len(prompt_entities)} entities: {[e['name'] for e in prompt_entities]}")
            
            # Run PrepAgent
            agent = self.get_agent('prep')
            result = agent.execute(
                story_id=story_id, scene_id=scene_id, beat_id=beat_id,
                user_input=user_input, prompt_entities=prompt_entities
            )
            
            if result['success']:
                print(f"✓ Success - Found {result['beat_relationships']} beat rels, {result['scene_relationships']} scene rels")
                print("\nGENERATED PROMPT:")
                print("-" * 60)
                print(result['prompt'])
            else:
                print(f"✗ Error: {result['error']}")
                
        except Exception as e:
            print(f"✗ Exception: {e}")
    
    def test_entity_agent(self, story_text: str, story_id: str = "1", extract_only: bool = True):
        """Test EntityAgent"""
        print("=" * 60)
        print(f"TESTING ENTITY AGENT")
        print(f"Text: '{story_text}'")
        print("-" * 60)
        
        try:
            print("Getting EntityAgent instance...")
            agent = self.get_agent('entity')
            print(f"Agent created with ID: {agent.agent_id}")
            
            story_context = {
                'story_id': story_id, 'scene_id': '1:s1', 
                'beat_id': '1:b3', 'timeline_id': '1:tl1'
            }
            
            print("Starting EntityAgent execution...")
            result = agent.execute(
                story_text=story_text,
                story_context=story_context,
                extract_only=extract_only
            )
            print("EntityAgent execution completed.")
            
            if result['success']:
                print(f"✓ Success - Found {result['entities_found']} entities")
                if 'entities' in result:
                    for entity in result['entities']:
                        print(f"  • {entity['name']} ({entity['type']}) - confidence: {entity['confidence']}")
            else:
                print(f"✗ Error: {result['error']}")
                
        except Exception as e:
            print(f"✗ Exception: {e}")
            import traceback
            traceback.print_exc()
    
    def show_database_state(self, story_id: str = "1"):
        """Show database state"""
        print("=" * 60)
        print("DATABASE STATE")
        print("-" * 60)
        
        # Entities
        entities = self.db.execute("""
            SELECT name, base_type FROM entities WHERE story_id = ? ORDER BY name
        """, (story_id,)).fetchall()
        print(f"Entities ({len(entities)}): {', '.join([f'{e[0]} ({e[1]})' for e in entities])}")
        
        # Relationships  
        relationships = self.db.execute("""
            SELECT COUNT(*) as count FROM relationships WHERE story_id = ?
        """, (story_id,)).fetchone()['count']
        print(f"Relationships: {relationships}")
        
        # Recent executions
        executions = self.db.execute("""
            SELECT agent_id, COUNT(*) as count FROM agent_executions 
            GROUP BY agent_id ORDER BY agent_id
        """).fetchall()
        print(f"Agent executions: {dict(executions)}")
    
    def interactive_mode(self):
        """Interactive CLI"""
        print("=" * 60)
        print("STORYWRITER AGENT TESTKIT")
        print("Commands: prep <text> | entity <text> | db | quit")
        print("=" * 60)
        
        while True:
            try:
                command = input("\n> ").strip()
                if not command or command.lower() in ['quit', 'exit']:
                    break
                
                parts = command.split(' ', 1)
                cmd, args = parts[0].lower(), parts[1] if len(parts) > 1 else ""
                
                if cmd == 'prep':
                    self.test_prep_agent(user_input=args)
                elif cmd == 'entity':
                    self.test_entity_agent(story_text=args)
                elif cmd == 'db':
                    self.show_database_state()
                else:
                    print(f"Unknown command: {cmd}")
                    
            except KeyboardInterrupt:
                break


def main():
    parser = argparse.ArgumentParser(description='Test Storywriter agents')
    parser.add_argument('--agent', choices=['prep', 'entity'], help='Agent to test')
    parser.add_argument('--input', help='Input text')
    parser.add_argument('--db', default='storywriter.db', help='Database path')
    
    args = parser.parse_args()
    
    with AgentTestKit(args.db) as testkit:
        if args.agent and args.input:
            if args.agent == 'prep':
                testkit.test_prep_agent(user_input=args.input)
            elif args.agent == 'entity':
                testkit.test_entity_agent(story_text=args.input)
        else:
            testkit.interactive_mode()


if __name__ == "__main__":
    main()