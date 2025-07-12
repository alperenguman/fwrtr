import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()  # This loads the .env file
except ImportError:
    # dotenv not installed, will use system environment variables
    pass


class BaseAgent:
    """Base class for all agents - loads configuration dynamically from database and manages LLM client"""
    
    def __init__(self, agent_id: str, db_connection):
        self.agent_id = agent_id
        self.db = db_connection
        self.config = self._load_config()
        self.llm_client = self._init_llm_client()
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
    
    def _init_llm_client(self):
        """Initialize LLM client based on environment configuration"""
        try:
            import openai
            
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                print(f"Warning: No OPENAI_API_KEY found for {self.agent_id}")
                return None
            
            base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
            
            client = openai.OpenAI(
                api_key=api_key,
                base_url=base_url
            )
            
            return client
            
        except ImportError:
            print(f"Warning: OpenAI library not installed for {self.agent_id}")
            return None
        except Exception as e:
            print(f"Warning: Failed to initialize LLM client for {self.agent_id}: {e}")
            return None
    
    def call_llm(self, messages: List[Dict], **kwargs) -> str:
        """
        Shared LLM calling method with error handling
        
        Args:
            messages: List of message dicts [{"role": "user", "content": "..."}]
            **kwargs: Additional parameters for the LLM call
            
        Returns:
            String response from LLM
            
        Raises:
            Exception: If LLM client not available or call fails
        """
        if not self.llm_client:
            raise Exception("LLM client not available - check API key and openai installation")
        
        try:
            # Get model from environment variable or fall back to config
            model = os.getenv("OPENAI_MODEL", self.config['model'])
            
            # Set default parameters
            call_params = {
                'model': model,
                'messages': messages,
                'max_tokens': kwargs.get('max_tokens', 1000),
                'temperature': kwargs.get('temperature', 0.3)
            }
            
            # Add any additional parameters
            call_params.update({k: v for k, v in kwargs.items() if k not in ['max_tokens', 'temperature']})
            
            print(f"[{self.agent_id}] Making LLM call:")
            print(f"  Model: {call_params['model']}")
            print(f"  Max tokens: {call_params['max_tokens']}")
            print(f"  Temperature: {call_params['temperature']}")
            print(f"  Message length: {len(str(messages))} chars")
            print(f"  First 200 chars: {str(messages)[:200]}...")
            
            print(f"[{self.agent_id}] Sending request to LLM...")
            response = self.llm_client.chat.completions.create(**call_params)
            
            result = response.choices[0].message.content
            print(f"[{self.agent_id}] LLM response received:")
            print(f"  Response length: {len(result)} chars")
            print(f"  First 200 chars: {result[:200]}...")
            
            return result
            
        except Exception as e:
            print(f"[{self.agent_id}] LLM call failed: {str(e)}")
            raise Exception(f"LLM call failed for {self.agent_id}: {str(e)}")
    
    def call_llm_with_fallback(self, messages: List[Dict], fallback_func, **kwargs) -> str:
        """
        Call LLM with fallback function if LLM fails
        
        Args:
            messages: List of message dicts for LLM
            fallback_func: Function to call if LLM fails (should return string)
            **kwargs: Additional parameters for LLM call
            
        Returns:
            String response from LLM or fallback
        """
        try:
            print(f"[{self.agent_id}] Attempting LLM call with fallback...")
            return self.call_llm(messages, **kwargs)
        except Exception as e:
            print(f"[{self.agent_id}] LLM call failed: {e}, using fallback")
            print(f"[{self.agent_id}] Executing fallback function...")
            result = fallback_func()
            print(f"[{self.agent_id}] Fallback completed, returned: {type(result)} with {len(str(result))} chars")
            return result
    
    def _start_execution(self, story_id: str, story_entry_id: Optional[int] = None, 
                        source_text: str = "") -> str:
        """Start new agent execution and return execution_id"""
        self.execution_id = str(uuid.uuid4())
        
        try:
            cursor = self.db.execute("""
                INSERT INTO agent_executions 
                (agent_id, story_id, story_entry_id, source_text, request_time)
                VALUES (?, ?, ?, ?, ?)
            """, (self.agent_id, story_id, story_entry_id, source_text, datetime.now().isoformat()))
            
            return cursor.lastrowid
        except Exception as e:
            # Graceful fallback if execution tracking fails
            print(f"Warning: Could not start execution tracking for {self.agent_id}: {e}")
            return self.execution_id
    
    def _finish_execution(self, output_text: str, status_message: str = "Success", 
                         tokens: int = 0):
        """Complete agent execution with results"""
        if not self.execution_id:
            return
            
        try:
            processing_duration = 0  # Calculate if needed
            
            # Update most recent execution for this agent
            self.db.execute("""
                UPDATE agent_executions 
                SET output_text = ?, output_time = ?, processing_duration_ms = ?,
                    status_message = ?, tokens = ?
                WHERE agent_id = ? AND request_time >= datetime('now', '-1 minute')
            """, (output_text, datetime.now().isoformat(), processing_duration,
                  status_message, tokens, self.agent_id))
            
            self.db.commit()
        except Exception as e:
            print(f"Warning: Could not finish execution tracking for {self.agent_id}: {e}")
    
    def execute(self, **kwargs) -> Dict[str, Any]:
        """Main execution method - override in subclasses"""
        raise NotImplementedError("Subclasses must implement execute method")