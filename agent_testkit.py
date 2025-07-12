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
                'agent_instructions': 'Extract ONLY raw entity names from text. Do not classify or define. Return JSON array with name, type, confidence only.',
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
    
    def test_entity_agent(self, story_text: str, story_id: str = "1", extract_only: bool = True):
        """Test EntityAgent with step-by-step options"""
        print("=" * 60)
        print(f"TESTING ENTITY AGENT")
        print(f"Text: '{story_text}'")
        print("-" * 60)
        
        # Ask user which step(s) to run
        print("Available steps:")
        print("  1 - Raw entity extraction (LLM)")
        print("  2 - String matching against aliases")
        print("  3 - LLM disambiguation (not implemented yet)")
        print("  4 - Entity classification (not implemented yet)")
        print("  5 - Entity definitions (not implemented yet)")
        print("  all - Run all implemented steps")
        
        step_choice = input("Which step to run? (1/2/all): ").strip().lower()
        
        try:
            print("Getting EntityAgent instance...")
            agent = self.get_agent('entity', 1)  # Default to task 1 for initial creation
            print(f"Agent created: {agent.agent_type} Task {agent.agent_task_id}")
            
            if step_choice == "1":
                self._test_step1_raw_extraction(agent, story_text, story_id)
            elif step_choice == "2":
                # First need raw entities for step 2
                print("Step 2 requires raw entities. Running step 1 first...")
                raw_entities = self._test_step1_raw_extraction(agent, story_text, story_id)
                if raw_entities:
                    extracted_names = [e['name'] for e in raw_entities]
                    self._test_step2_string_matching(agent, extracted_names, story_id)
            elif step_choice == "all":
                self._test_all_entity_steps(agent, story_text, story_id)
            else:
                print(f"Invalid choice: {step_choice}")
                
        except Exception as e:
            print(f"✗ Exception: {e}")
            import traceback
            traceback.print_exc()
    
    def _test_step1_raw_extraction(self, agent, story_text: str, story_id: str):
        """Test Step 1: Raw entity extraction (names only)"""
        print("\n" + "="*40)
        print("STEP 1: RAW ENTITY EXTRACTION (NAMES ONLY)")
        print("="*40)
        
        try:
            # Get the raw extraction agent (task 1)
            raw_agent = self.get_agent('entity', 1)
            entity_names = raw_agent._extract_entities_with_llm(story_text, story_id)
            print(f"✓ Extracted {len(entity_names)} raw entity names:")
            for name in entity_names:
                print(f"  • {name}")
            return entity_names
        except Exception as e:
            print(f"✗ Step 1 failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _test_step2_string_matching(self, agent, extracted_names: List[str], story_id: str):
        """Test Step 2: String matching against aliases"""
        print("\n" + "="*40)
        print("STEP 2: STRING MATCHING")
        print("="*40)
        print(f"Input entity names: {extracted_names}")
        
        try:
            # Get the string matching agent (task 2)
            string_agent = self.get_agent('entity', 2)
            results = string_agent.resolve_entities_step1_string_matching(extracted_names, story_id)
            print(f"✓ String matching results:")
            for name, result in results.items():
                if result['match_type'] == 'exact':
                    print(f"  • {name} → EXACT match: {result['entity_name']} (ID: {result['entity_id']})")
                elif result['match_type'] == 'substring':
                    print(f"  • {name} → SUBSTRING match: {result['entity_name']} (ID: {result['entity_id']})")
                elif result['match_type'] == 'fuzzy':
                    print(f"  • {name} → FUZZY match: {result['entity_name']} (ID: {result['entity_id']}, score: {result['score']:.2f})")
                elif result['match_type'] == 'ambiguous':
                    print(f"  • {name} → AMBIGUOUS: {len(result['candidates'])} candidates")
                    for candidate in result['candidates']:
                        print(f"    - {candidate['entity_name']} (ID: {candidate['entity_id']})")
                elif result['match_type'] == 'no_match':
                    print(f"  • {name} → NO MATCH (new entity)")
            return results
        except Exception as e:
            print(f"✗ Step 2 failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _test_all_entity_steps(self, agent, story_text: str, story_id: str):
        """Test all entity steps in sequence"""
        print("\n" + "="*40)
        print("RUNNING ALL ENTITY STEPS")
        print("="*40)
        
        # Step 1: Raw extraction (returns list of names)
        entity_names = self._test_step1_raw_extraction(agent, story_text, story_id)
        if not entity_names:
            print("Cannot continue - Step 1 failed")
            return
        
        # Step 2: String matching (takes list of names)
        string_results = self._test_step2_string_matching(agent, entity_names, story_id)
        if not string_results:
            print("Cannot continue - Step 2 failed")
            return
        
        # Future steps would go here
        print("\n" + "="*40)
        print("ALL IMPLEMENTED STEPS COMPLETED")
        print("="*40)
    
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