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
from typing import Dict, List, Any, Optional

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
        """Create test agent configurations with task-based structure"""
        # Create agents table if it doesn't exist (with INTEGER PRIMARY KEY)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                agent_id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_type TEXT NOT NULL,
                agent_task_id INTEGER NOT NULL,
                agent_name TEXT,
                agent_description TEXT,
                agent_instructions TEXT,
                agent_function_calls JSON,
                model TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(agent_type, agent_task_id)
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
                'agent_type': 'EntityAgent',
                'agent_task_id': 1,
                'agent_name': 'Entity Raw Extractor',
                'agent_description': 'Extracts raw entity names from text',
                'agent_instructions': '''Extract ONLY entity names from this text. Return as JSON array of strings.

Do NOT classify, describe, or analyze - just identify the entity names present in the text.

Return format: ["Entity Name 1", "Entity Name 2", "Entity Name 3"]

Focus on:
- Characters/people mentioned
- Objects that are important to the scene
- Locations referenced
- Times/periods mentioned
- Thoughts or feelings that are personified

Be conservative - only include entities that are clearly present or referenced.''',
                'agent_function_calls': '{}',
                'model': 'gpt-4',
                'is_active': True
            },
            {
                'agent_type': 'EntityAgent',
                'agent_task_id': 2,
                'agent_name': 'Entity String Matcher',
                'agent_description': 'Matches entities against database aliases',
                'agent_instructions': 'N/A - no LLM needed for string matching',
                'agent_function_calls': '{}',
                'model': 'N/A',
                'is_active': True
            },
            {
                'agent_type': 'EntityAgent',
                'agent_task_id': 3,
                'agent_name': 'Entity Disambiguator',
                'agent_description': 'Resolves ambiguous entity matches using context',
                'agent_instructions': 'Given ambiguous entity candidates and context, determine which entity is being referenced.',
                'agent_function_calls': '{}',
                'model': 'gpt-3.5-turbo',
                'is_active': True
            },
            {
                'agent_type': 'PrepAgent',
                'agent_task_id': 1,
                'agent_name': 'Context Preparer',
                'agent_description': 'Prepares context for story generation',
                'agent_instructions': 'Prepare comprehensive context from entity relationships and user input.',
                'agent_function_calls': '{}',
                'model': 'gpt-4',
                'is_active': True
            }
        ]
        
        # Check if agents already exist to avoid duplicates
        existing_count = self.db.execute("""
            SELECT COUNT(*) as count FROM agents 
            WHERE agent_type IN ('EntityAgent', 'PrepAgent')
        """).fetchone()['count']
        
        if existing_count >= 4:
            print("Test agents already exist.")
            return
        
        for agent in agents:
            # Use regular INSERT (not INSERT OR REPLACE) with auto-increment
            cursor = self.db.execute("""
                INSERT INTO agents 
                (agent_type, agent_task_id, agent_name, agent_description,
                 agent_instructions, agent_function_calls, model, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (agent['agent_type'], agent['agent_task_id'],
                  agent['agent_name'], agent['agent_description'], agent['agent_instructions'],
                  agent['agent_function_calls'], agent['model'], agent['is_active']))
            
            agent_id = cursor.lastrowid
            print(f"Created {agent['agent_type']} Task {agent['agent_task_id']} with ID: {agent_id}")
        
        self.db.commit()
        print("Test agents created with task-based structure.")
    
    def get_agent(self, agent_type: str, task_id: int = 1):
        """Get agent instance by type and task_id"""
        try:
            # Create agent instance with the type and task_id
            if agent_type == 'prep':
                return PrepAgent('PrepAgent', task_id, self.db)
            elif agent_type == 'entity':
                agent = EntityAgent('EntityAgent', task_id, self.db)
                print(f"Debug - Created agent with agent_type: {agent.agent_type}, task_id: {agent.agent_task_id}")
                print(f"Debug - Agent config: {agent.config}")
                return agent
            else:
                raise ValueError(f"Unknown agent type: {agent_type}")
        except Exception as e:
            print(f"Error creating agent: {e}")
            import traceback
            traceback.print_exc()
            raise
    
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
    
    def test_entity_agent(self, story_text: str, story_id: str = "1", task_id: int = None):
        """Test EntityAgent with task selection"""
        print("=" * 60)
        print(f"TESTING ENTITY AGENT")
        print(f"Text: '{story_text}'")
        print("-" * 60)
        
        if task_id is None:
            # Ask user which task to run
            print("Available tasks:")
            print("  1 - Raw entity extraction (LLM)")
            print("  2 - String matching against aliases")
            print("  3 - LLM disambiguation (not implemented yet)")
            
            task_choice = input("Which task to run? (1/2/3): ").strip()
            try:
                task_id = int(task_choice)
            except ValueError:
                print(f"Invalid choice: {task_choice}")
                return
        
        self.test_specific_task(task_id, story_text, story_id)
    
    def test_specific_task(self, task_id: int, story_text: str, story_id: str = "test"):
        """Test a specific EntityAgent task"""
        print("=" * 60)
        print(f"TESTING ENTITY AGENT TASK {task_id}")
        print(f"Text: '{story_text}'")
        print("-" * 60)
        
        try:
            agent = self.get_agent('entity', task_id)
            print(f"Created EntityAgent Task {task_id}")
            print(f"Agent config: {agent.config['name']}")
            print(f"Instructions: {agent.config['instructions'][:200]}...")
            
            result = agent.execute(
                story_text=story_text,
                story_context={'story_id': story_id, 'scene_id': 'test:s1', 'beat_id': 'test:b1', 'timeline_id': 'test:tl1'},
                extract_only=True
            )
            
            if result['success']:
                print(f"✓ Task {task_id} Success:")
                print(f"  Task type: {result.get('task', 'unknown')}")
                if 'raw_names' in result:
                    print(f"  Raw names: {result['raw_names']}")
                if 'matching_results' in result:
                    print(f"  Matching results: {len(result['matching_results'])} items")
                    for name, match in result['matching_results'].items():
                        print(f"    {name} -> {match['match_type']}")
                        if match['match_type'] == 'exact':
                            print(f"      Matched: {match['entity_name']} (ID: {match['entity_id']})")
                        elif match['match_type'] in ['substring', 'fuzzy']:
                            print(f"      Matched: {match['entity_name']} (ID: {match['entity_id']})")
                            if 'score' in match:
                                print(f"      Score: {match['score']:.2f}")
                        elif match['match_type'] == 'ambiguous':
                            print(f"      Candidates: {len(match['candidates'])}")
                            for candidate in match['candidates'][:3]:  # Show first 3
                                print(f"        - {candidate['entity_name']} (ID: {candidate['entity_id']})")
            else:
                print(f"✗ Task {task_id} Failed: {result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"✗ Exception in Task {task_id}: {e}")
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
        
        # Entity aliases
        aliases = self.db.execute("""
            SELECT ea.alias_name, e.name as entity_name 
            FROM entity_aliases ea
            JOIN entities e ON ea.entity_id = e.entity_id
            WHERE e.story_id = ?
            ORDER BY e.name, ea.alias_name
        """, (story_id,)).fetchall()
        print(f"Aliases ({len(aliases)}):")
        current_entity = None
        for alias in aliases:
            if alias['entity_name'] != current_entity:
                current_entity = alias['entity_name']
                print(f"  {current_entity}:")
            print(f"    - {alias['alias_name']}")
        
        # Relationships  
        relationships = self.db.execute("""
            SELECT COUNT(*) as count FROM relationships WHERE story_id = ?
        """, (story_id,)).fetchone()['count']
        print(f"Relationships: {relationships}")
        
        # Recent executions
        executions = self.db.execute("""
            SELECT a.agent_type, a.agent_task_id, COUNT(*) as count 
            FROM agent_executions ae
            JOIN agents a ON ae.agent_id = a.agent_id
            GROUP BY a.agent_type, a.agent_task_id 
            ORDER BY a.agent_type, a.agent_task_id
        """).fetchall()
        print(f"Agent executions:")
        for execution in executions:
            print(f"  {execution[0]} Task {execution[1]}: {execution[2]} runs")
        
        # Show agents
        agents = self.db.execute("""
            SELECT agent_type, agent_task_id, agent_name FROM agents 
            WHERE is_active = TRUE ORDER BY agent_type, agent_task_id
        """).fetchall()
        print(f"Active agents:")
        for agent in agents:
            print(f"  {agent[0]} Task {agent[1]}: {agent[2]}")
    
    def show_agent_details(self, agent_type: str = None, task_id: int = None):
        """Show detailed agent configuration"""
        print("=" * 60)
        print("AGENT DETAILS")
        print("-" * 60)
        
        query = "SELECT * FROM agents WHERE is_active = TRUE"
        params = []
        
        if agent_type:
            query += " AND agent_type = ?"
            params.append(agent_type)
        
        if task_id:
            query += " AND agent_task_id = ?"
            params.append(task_id)
        
        query += " ORDER BY agent_type, agent_task_id"
        
        agents = self.db.execute(query, params).fetchall()
        
        for agent in agents:
            print(f"\n{agent['agent_type']} Task {agent['agent_task_id']}:")
            print(f"  Name: {agent['agent_name']}")
            print(f"  Description: {agent['agent_description']}")
            print(f"  Model: {agent['model']}")
            print(f"  Instructions: {agent['agent_instructions'][:300]}...")
            print(f"  Function calls: {agent['agent_function_calls']}")
    
    def interactive_mode(self):
        """Interactive CLI"""
        print("=" * 60)
        print("STORYWRITER AGENT TESTKIT")
        print("Commands:")
        print("  prep <text>        - Test PrepAgent")
        print("  entity <text>      - Test EntityAgent (with task selection)")
        print("  entity1 <text>     - Test EntityAgent Task 1 (raw extraction)")
        print("  entity2 <text>     - Test EntityAgent Task 2 (string matching)")
        print("  db                 - Show database state")
        print("  agents             - Show agent details")
        print("  agents <type>      - Show specific agent type details")
        print("  quit               - Exit")
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
                elif cmd == 'entity1':
                    self.test_specific_task(1, args)
                elif cmd == 'entity2':
                    self.test_specific_task(2, args)
                elif cmd == 'db':
                    self.show_database_state()
                elif cmd == 'agents':
                    if args:
                        self.show_agent_details(agent_type=args.upper() + 'Agent')
                    else:
                        self.show_agent_details()
                else:
                    print(f"Unknown command: {cmd}")
                    
            except KeyboardInterrupt:
                break


def main():
    parser = argparse.ArgumentParser(description='Test Storywriter agents')
    parser.add_argument('--agent', choices=['prep', 'entity'], help='Agent to test')
    parser.add_argument('--task', type=int, help='Task ID for EntityAgent (1, 2, 3)')
    parser.add_argument('--input', help='Input text')
    parser.add_argument('--db', default='storywriter.db', help='Database path')
    
    args = parser.parse_args()
    
    with AgentTestKit(args.db) as testkit:
        if args.agent and args.input:
            if args.agent == 'prep':
                testkit.test_prep_agent(user_input=args.input)
            elif args.agent == 'entity':
                task_id = args.task or 1
                testkit.test_specific_task(task_id, args.input)
        else:
            testkit.interactive_mode()


if __name__ == "__main__":
    main()