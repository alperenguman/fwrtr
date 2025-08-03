import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from base_agent import BaseAgent
from node_utils import get_descendant_ids


class GeneratorAgent(BaseAgent):
    """Generates story content using context from PrepAgent or direct scene context"""
    
    def execute(self, story_id: str, scene_id: str, node_id: str,
                user_input: str = "", context_prompt: str = "",
                generation_mode: str = "immediate", stream_callback=None) -> Dict[str, Any]:
        """
        Generate story content:
        
        Args:
            generation_mode: 'immediate' (red flash) or 'simulation' (yellow flash)
            context_prompt: Pre-built prompt from PrepAgent, or empty for immediate mode
            user_input: User's story direction
        """
        execution_id = self._start_execution(story_id, source_text=f"Mode: {generation_mode}, Input: {user_input}")
        
        try:
            if generation_mode == "immediate":
                result = self._immediate_generation(story_id, scene_id, node_id, user_input, stream_callback)
            elif generation_mode == "simulation":
                result = self._simulation_generation(story_id, scene_id, node_id, user_input, context_prompt, stream_callback)
            else:
                raise ValueError(f"Unknown generation mode: {generation_mode}")
            
            if result['success']:
                raw_text = result.get('raw_text', result['generated_text'])
                # Store the generated story (processed text may be updated later)
                story_entry_id = self._store_story_entry(
                story_id, scene_id, node_id,
                    raw_text,
                    raw_text,
                    generation_mode
                )
                result['story_entry_id'] = story_entry_id
                
                self._finish_execution(
                    result['generated_text'], 
                    f"{generation_mode.title()} generation completed", 
                    result.get('tokens', 0)
                )
            else:
                self._finish_execution("", f"Generation failed: {result['error']}")
            
            return result
            
        except Exception as e:
            self._finish_execution("", f"Error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def _immediate_generation(self, story_id: str, scene_id: str, node_id: str,
                              user_input: str, stream_callback=None) -> Dict[str, Any]:
        """Quick generation with minimal context (red flash)"""
        print(f"[GeneratorAgent] Starting immediate generation")
        
        try:
            # Get basic scene context without heavy processing
            scene_context = self._get_basic_scene_context(story_id, scene_id, node_id)
            
            # Build simple prompt
            prompt = self._build_immediate_prompt(scene_context, user_input)
            
            # Generate with fallback
            def fallback_generation():
                return self._fallback_immediate_generation(user_input, scene_context)
            
            messages = [{"role": "user", "content": prompt}]
            
            if stream_callback:
                generated_text = self.call_llm_stream_with_fallback(
                    messages=messages,
                    on_chunk=stream_callback,
                    fallback_func=fallback_generation,
                    max_tokens=800,
                    temperature=0.7
                )
            else:
                generated_text = self.call_llm_with_fallback(
                    messages=messages,
                    fallback_func=fallback_generation,
                    max_tokens=800,
                    temperature=0.7
                )
            
            return {
                'success': True,
                'generated_text': generated_text,
                'raw_text': generated_text,
                'generation_mode': 'immediate',
                'context_size': len(prompt),
                'tokens': getattr(self, '_current_tokens', 0)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _simulation_generation(self, story_id: str, scene_id: str, node_id: str,
                             user_input: str, context_prompt: str, stream_callback=None) -> Dict[str, Any]:
        """Full generation with PrepAgent context (yellow flash)"""
        print(f"[GeneratorAgent] Starting simulation generation")
        
        try:
            # Use the context prompt from PrepAgent
            if not context_prompt:
                return {'success': False, 'error': 'No context prompt provided for simulation mode'}
            
            # Add user input to the prepared context
            full_prompt = self._build_simulation_prompt(context_prompt, user_input)
            
            # Generate with fallback
            def fallback_generation():
                return self._fallback_simulation_generation(user_input, context_prompt)
            
            messages = [{"role": "user", "content": full_prompt}]
            
            if stream_callback:
                generated_text = self.call_llm_stream_with_fallback(
                    messages=messages,
                    on_chunk=stream_callback,
                    fallback_func=fallback_generation,
                    max_tokens=1200,
                    temperature=0.6
                )
            else:
                generated_text = self.call_llm_with_fallback(
                    messages=messages,
                    fallback_func=fallback_generation,
                    max_tokens=1200,
                    temperature=0.6
                )
            
            return {
                'success': True,
                'generated_text': generated_text,
                'raw_text': generated_text,
                'generation_mode': 'simulation',
                'context_size': len(full_prompt),
                'tokens': getattr(self, '_current_tokens', 0)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _get_basic_scene_context(self, story_id: str, scene_id: str, node_id: str) -> Dict[str, Any]:
        """Get minimal scene context for immediate generation"""
        
        # Get entities in current scene
        entities = self.db.execute("""
            SELECT DISTINCT e.entity_id, e.name, e.base_type, e.description,
                   e.form_description, e.character_description
            FROM entities e
            JOIN states s ON e.entity_id = s.entity_id
            WHERE s.story_id = ? AND s.scene_id = ?
            ORDER BY e.base_type, e.name
        """, (story_id, scene_id)).fetchall()
        
        # Get recent relationships in this node/scene
        node_ids = get_descendant_ids(self.db, node_id)
        placeholders = ",".join(["?" for _ in node_ids])
        relationships = self.db.execute(f"""
            SELECT r.description, e1.name as entity1_name, e2.name as entity2_name
            FROM relationships r
            JOIN states s1 ON r.state_id1 = s1.state_id
            JOIN states s2 ON r.state_id2 = s2.state_id
            JOIN entities e1 ON s1.entity_id = e1.entity_id
            JOIN entities e2 ON s2.entity_id = e2.entity_id
            WHERE r.story_id = ? AND r.node_id IN ({placeholders})
            ORDER BY r.created_at DESC
            LIMIT 10
        """, [story_id] + node_ids).fetchall()
        
        return {
            'entities': [dict(row) for row in entities],
            'relationships': [dict(row) for row in relationships],
            'scene_id': scene_id,
            'node_id': node_id
        }
    
    def _build_immediate_prompt(self, scene_context: Dict, user_input: str) -> str:
        """Build simple prompt for immediate generation"""
        prompt_parts = [
            self.config['instructions'],
            "\n## SCENE CONTEXT",
            f"Scene: {scene_context['scene_id']}, Node: {scene_context['node_id']}"
        ]
        
        # Add entities present
        if scene_context['entities']:
            prompt_parts.append("\n### ENTITIES PRESENT")
            for entity in scene_context['entities'][:8]:  # Limit for immediate mode
                desc = entity.get('description') or entity.get('form_description') or ''
                prompt_parts.append(f"• **{entity['name']}** ({entity['base_type']}): {desc}")
        
        # Add recent relationships
        if scene_context['relationships']:
            prompt_parts.append("\n### RECENT RELATIONSHIPS")
            for rel in scene_context['relationships'][:5]:  # Limit for immediate mode
                prompt_parts.append(f"• {rel['entity1_name']} {rel['description']} {rel['entity2_name']}")
        
        # Add user direction
        if user_input.strip():
            prompt_parts.append(f"\n### USER DIRECTION")
            prompt_parts.append(user_input)
        
        # Generation instruction
        prompt_parts.append("\n### GENERATE STORY")
        prompt_parts.append("Continue the story naturally, focusing on the immediate scene. Keep it concise and engaging.")
        
        return "\n".join(prompt_parts)
    
    def _build_simulation_prompt(self, context_prompt: str, user_input: str) -> str:
        """Build prompt for simulation generation using PrepAgent context"""
        if user_input.strip():
            return f"{context_prompt}\n\n### ADDITIONAL USER DIRECTION\n{user_input}\n\n### GENERATE STORY\nContinue the story incorporating all the above context and user direction."
        else:
            return f"{context_prompt}\n\n### GENERATE STORY\nContinue the story naturally based on the above context."
    
    def _fallback_immediate_generation(self, user_input: str, scene_context: Dict) -> str:
        """Fallback generation for immediate mode"""
        print(f"[GeneratorAgent] WARNING: Using fallback generation - LLM call failed!")
        print(f"[GeneratorAgent] This means OpenAI API is not working properly")
        
        entities = scene_context.get('entities', [])
        entity_names = [e['name'] for e in entities[:3]]
        
        if user_input.strip():
            return f"[FALLBACK] The story continues as {user_input}. {', '.join(entity_names)} are present in this scene."
        else:
            if entity_names:
                return f"[FALLBACK] The scene unfolds with {', '.join(entity_names)} as the focus shifts to new developments."
            else:
                return "[FALLBACK] The story continues, new elements entering the narrative as events unfold."
    
    def _fallback_simulation_generation(self, user_input: str, context_prompt: str) -> str:
        """Fallback generation for simulation mode"""
        if user_input.strip():
            return f"Following the established context and incorporating the user's direction: {user_input}"
        else:
            return "The story progresses naturally, building on the established context and character relationships."
    
    def _store_story_entry(self, story_id: str, scene_id: str, node_id: str,
                          raw_text: str, processed_text: str,
                          generation_mode: str) -> int:
        """Store generated story in database with raw and processed text"""
        
        # Determine variant based on generation mode
        variant = 'immediate' if generation_mode == 'immediate' else 'simulation'
        
        # Insert story entry
        cursor = self.db.execute("""
            INSERT INTO stories
            (story_id, timeline_id, scene_id, node_id, raw_text, text_content, variant, revision, character_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            story_id, '1:tl1', scene_id, node_id,
            raw_text, processed_text, variant, 'rev1', len(processed_text)
        ))
        
        story_entry_id = cursor.lastrowid
        self.db.commit()

        return story_entry_id

    def update_story_entry_text(self, story_entry_id: int, processed_text: str):
        """Update processed text for an existing story entry"""
        self.db.execute(
            'UPDATE stories SET text_content = ?, character_count = ?, updated_at = ? WHERE story_entry_id = ?',
            (processed_text, len(processed_text), datetime.now().isoformat(), story_entry_id)
        )
        self.db.commit()
