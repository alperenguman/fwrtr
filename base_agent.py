import sqlite3
import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any


class BaseAgent:
    """Base class for all agents - loads configuration dynamically from database"""
    
    def __init__(self, agent_id: str, db_connection):
        self.agent_id = agent_id
        self.db = db_connection
        self.config = self._load_config()
        self.execution_id = None
        
    def _load_config(self) -> Dict[str, Any]:
        """Load agent configuration from database"""
        cursor = self.db.execute("""
            SELECT agent_type, agent_version, agent_name, agent_description,
                   agent_instructions, agent_function_calls, model, is_active
            FROM agents WHERE agent_id = ? AND is_active = TRUE
        """, (self.agent_id,))
        
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Agent {self.agent_id} not found or inactive")
            
        return {
            'type': row['agent_type'],
            'version': row['agent_version'],
            'name': row['agent_name'],
            'description': row['agent_description'],
            'instructions': row['agent_instructions'],
            'function_calls': json.loads(row['agent_function_calls'] or '{}'),
            'model': row['model'],
            'is_active': row['is_active']
        }
    
    def _start_execution(self, story_id: str, story_entry_id: Optional[int] = None, 
                        source_text: str = "") -> str:
        """Start new agent execution and return execution_id"""
        self.execution_id = str(uuid.uuid4())
        
        cursor = self.db.execute("""
            INSERT INTO agent_executions 
            (agent_id, story_id, story_entry_id, source_text, request_time)
            VALUES (?, ?, ?, ?, ?)
        """, (self.agent_id, story_id, story_entry_id, source_text, datetime.now().isoformat()))
        
        return cursor.lastrowid
    
    def _finish_execution(self, output_text: str, status_message: str = "Success", 
                         tokens: int = 0):
        """Complete agent execution with results"""
        if not self.execution_id:
            return
            
        processing_duration = 0  # Calculate if needed
        
        self.db.execute("""
            UPDATE agent_executions 
            SET output_text = ?, output_time = ?, processing_duration_ms = ?,
                status_message = ?, tokens = ?
            WHERE agent_execution_id = ?
        """, (output_text, datetime.now().isoformat(), processing_duration,
              status_message, tokens, self.execution_id))
        
        self.db.commit()
    
    def execute(self, **kwargs) -> Dict[str, Any]:
        """Main execution method - override in subclasses"""
        raise NotImplementedError("Subclasses must implement execute method")