import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class BaseAgent:
    """Base class for all agents - loads configuration dynamically from database and manages LLM client"""
    
    def __init__(self, agent_type: str, agent_task_id: int, db_connection):
        self.agent_type = agent_type
        self.agent_task_id = agent_task_id
        self.db = db_connection
        self.config = self._load_config()
        self.llm_client = self._init_llm_client()
        
        # Execution tracking variables - MUST be initialized
        self.execution_id = None
        self.db_execution_id = None
        self.execution_start_time = None
        self._current_tokens = 0
        
    def _load_config(self) -> Dict[str, Any]:
        """Load agent configuration from database based on type and task_id"""
        cursor = self.db.execute("""
            SELECT agent_id, agent_type, agent_task_id, agent_name, agent_description,
                   agent_instructions, agent_function_calls, model, is_active
            FROM agents WHERE agent_type = ? AND agent_task_id = ? AND is_active = TRUE
        """, (self.agent_type, self.agent_task_id))
        
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Agent {self.agent_type} task {self.agent_task_id} not found or inactive")
            
        return {
            'agent_id': int(row['agent_id']),
            'type': row['agent_type'],
            'task_id': row['agent_task_id'],
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
                print(f"Warning: No OPENAI_API_KEY found for {self.agent_type}:{self.agent_task_id}")
                return None
            
            base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
            
            client = openai.OpenAI(
                api_key=api_key,
                base_url=base_url
            )
            
            return client
            
        except ImportError:
            print(f"Warning: OpenAI library not installed for {self.agent_type}:{self.agent_task_id}")
            return None
        except Exception as e:
            print(f"Warning: Failed to initialize LLM client for {self.agent_type}:{self.agent_task_id}: {e}")
            return None
    
    def _start_execution(self, story_id: str, story_entry_id: Optional[int] = None, 
                    source_text: str = "") -> str:
        """Start new agent execution and return execution_id"""
        print(f"DEBUG: _start_execution called with story_id={story_id}")

        self.execution_id = str(uuid.uuid4())
        self.execution_start_time = datetime.now()

        # Use "test" for story_id when testing
        final_story_id = "test" if story_id in ["1", "test"] else story_id
        final_story_entry_id = story_entry_id 

        print(f"DEBUG: About to insert execution record with agent_id={self.config['agent_id']}")

        # REMOVE THE TRY/CATCH TO SEE THE REAL ERROR
        cursor = self.db.execute("""
            INSERT INTO agent_executions 
            (agent_id, story_id, story_entry_id, source_text, request_time)
            VALUES (?, ?, ?, ?, ?)
        """, (self.config['agent_id'], final_story_id, final_story_entry_id, 
              source_text, self.execution_start_time.isoformat()))

        self.db_execution_id = cursor.lastrowid
        self.db.commit()
        print(f"[{self.agent_type}:{self.agent_task_id}] Started execution tracking (DB ID: {self.db_execution_id})")
        print(f"DEBUG: Successfully set self.db_execution_id = {self.db_execution_id}")
        return self.execution_id
    
    def _finish_execution(self, output_text: str, status_message: str = "Success", 
                         tokens: int = 0):
        """Complete agent execution with results"""
        print(f"DEBUG: _finish_execution called with db_execution_id={getattr(self, 'db_execution_id', 'NOT SET')}")
        
        if not hasattr(self, 'db_execution_id') or self.db_execution_id is None:
            print(f"Warning: No execution ID to finish for {self.agent_type}:{self.agent_task_id}")
            return
            
        try:
            end_time = datetime.now()
            processing_duration = 0
            
            if hasattr(self, 'execution_start_time') and self.execution_start_time:
                duration_delta = end_time - self.execution_start_time
                processing_duration = int(duration_delta.total_seconds() * 1000)
            
            # Use tokens from LLM call if available
            final_tokens = tokens or getattr(self, '_current_tokens', 0)
            
            print(f"DEBUG: Updating execution record {self.db_execution_id}")
            
            # Update the specific execution record
            self.db.execute("""
                UPDATE agent_executions 
                SET output_text = ?, output_time = ?, processing_duration_ms = ?,
                    status_message = ?, tokens = ?, updated_at = ?
                WHERE agent_execution_id = ?
            """, (output_text, end_time.isoformat(), processing_duration,
                  status_message, final_tokens, end_time.isoformat(), self.db_execution_id))
            
            self.db.commit()
            print(f"[{self.agent_type}:{self.agent_task_id}] Finished execution tracking (Duration: {processing_duration}ms, Tokens: {final_tokens})")
            
        except Exception as e:
            print(f"ERROR: Could not finish execution tracking for {self.agent_type}:{self.agent_task_id}: {e}")
            import traceback
            traceback.print_exc()
    
    def call_llm(self, messages: List[Dict], **kwargs) -> str:
        """Shared LLM calling method with error handling and token tracking"""
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
            
            print(f"[{self.agent_type}:{self.agent_task_id}] Making LLM call:")
            print(f"  Model: {call_params['model']}")
            print(f"  Max tokens: {call_params['max_tokens']}")
            print(f"  Temperature: {call_params['temperature']}")
            print(f"  Message length: {len(str(messages))} chars")
            print(f"  First 200 chars: {str(messages)[:200]}...")
            
            print(f"[{self.agent_type}:{self.agent_task_id}] Sending request to LLM...")
            llm_start_time = datetime.now()
            
            response = self.llm_client.chat.completions.create(**call_params)
            
            llm_end_time = datetime.now()
            llm_duration = int((llm_end_time - llm_start_time).total_seconds() * 1000)
            
            result = response.choices[0].message.content
            
            # Extract token usage if available
            tokens_used = 0
            if hasattr(response, 'usage') and response.usage:
                tokens_used = getattr(response.usage, 'total_tokens', 0)
            
            print(f"[{self.agent_type}:{self.agent_task_id}] LLM response received:")
            print(f"  Response length: {len(result)} chars")
            print(f"  First 200 chars: {result[:200]}...")
            print(f"  LLM duration: {llm_duration}ms")
            print(f"  Tokens used: {tokens_used}")
            
            # Store tokens for finish_execution
            self._current_tokens = tokens_used
            
            return result
            
        except Exception as e:
            print(f"[{self.agent_type}:{self.agent_task_id}] LLM call failed: {str(e)}")
            self._current_tokens = 0
            raise Exception(f"LLM call failed for {self.agent_type}:{self.agent_task_id}: {str(e)}")
    
    def call_llm_with_fallback(self, messages: List[Dict], fallback_func, **kwargs) -> str:
        """Call LLM with fallback function if LLM fails"""
        try:
            print(f"[{self.agent_type}:{self.agent_task_id}] Attempting LLM call with fallback...")
            return self.call_llm(messages, **kwargs)
        except Exception as e:
            print(f"[{self.agent_type}:{self.agent_task_id}] LLM call failed: {e}, using fallback")
            print(f"[{self.agent_type}:{self.agent_task_id}] Executing fallback function...")
            
            # Reset tokens since LLM failed
            self._current_tokens = 0
            
            result = fallback_func()
            print(f"[{self.agent_type}:{self.agent_task_id}] Fallback completed, returned: {type(result)} with {len(str(result))} chars")
            return result

    def call_llm_stream(self, messages: List[Dict], stream_callback, fallback_func, **kwargs) -> str:
        """Stream LLM response token by token and invoke callback for each chunk"""
        if not self.llm_client:
            # If client unavailable use fallback at once
            result = fallback_func()
            stream_callback(result)
            return result

        # Build call parameters
        model = os.getenv("OPENAI_MODEL", self.config['model'])
        call_params = {
            'model': model,
            'messages': messages,
            'max_tokens': kwargs.get('max_tokens', 1000),
            'temperature': kwargs.get('temperature', 0.3),
            'stream': True
        }
        call_params.update({k: v for k, v in kwargs.items() if k not in ['max_tokens', 'temperature']})

        try:
            response = self.llm_client.chat.completions.create(**call_params)
            full_text = ""
            for chunk in response:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    stream_callback(delta)
                    full_text += delta

            # token usage may be available in last chunk
            tokens_used = getattr(getattr(response, 'usage', None), 'total_tokens', 0)
            self._current_tokens = tokens_used
            return full_text
        except Exception:
            # Streaming failed - fall back
            self._current_tokens = 0
            result = fallback_func()
            stream_callback(result)
            return result
    
    def execute(self, **kwargs) -> Dict[str, Any]:
        """Main execution method - override in subclasses"""
        raise NotImplementedError("Subclasses must implement execute method")