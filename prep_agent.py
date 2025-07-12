import json
from typing import Dict, List, Any, Optional
from base_agent import BaseAgent


class PrepAgent(BaseAgent):
    """Prepares context and prompts for story generation"""
    
    def execute(self, story_id: str, scene_id: str, beat_id: str, 
                user_input: str = "", prompt_entities: List[Dict] = None) -> Dict[str, Any]:
        """
        Queries entity relationships and states to prepare generation context:
        1. Get all relationships in current beat
        2. Get all relationships in current scene  
        3. For entities mentioned in user prompt, get their full historical context
        4. Build hierarchical context summary for GeneratorAgent
        
        Args:
            prompt_entities: List of entities identified in user prompt by EntityAgent
                Format: [{'entity_id': 123, 'name': 'Sarah', 'mentions': ['Sarah', 'she']}, ...]
        """
        execution_id = self._start_execution(story_id, source_text=f"user_input: {user_input}")
        
        try:
            # 1. Get relationships in current beat (most immediate context)
            beat_relationships = self._get_beat_relationships(story_id, scene_id, beat_id)
            
            # 2. Get relationships in current scene (broader context)
            scene_relationships = self._get_scene_relationships(story_id, scene_id, beat_id)
            
            # 3. For entities mentioned in prompt, get their full historical context
            prompt_entity_ids = [e['entity_id'] for e in (prompt_entities or [])]
            historical_relationships = self._get_historical_relationships(story_id, scene_id, prompt_entity_ids)
            
            # 4. Get all states for entities involved in relationships
            entity_states = self._get_entity_states_for_context(story_id, scene_id, beat_id)
            
            # 5. Get detailed states for prompt entities across all scenes
            prompt_entity_states = self._get_prompt_entity_detailed_states(story_id, prompt_entity_ids)
            
            # 6. Build comprehensive context summary
            context_summary = self._build_context_summary(
                beat_relationships, scene_relationships, historical_relationships, 
                entity_states, prompt_entity_states, prompt_entities or []
            )
            
            # 7. Generate final prompt for GeneratorAgent
            prompt = self._build_generation_prompt(context_summary, user_input)
            
            self._finish_execution(prompt, "Context prepared successfully", len(prompt.split()))
            
            return {
                'success': True,
                'prompt': prompt,
                'beat_relationships': len(beat_relationships),
                'scene_relationships': len(scene_relationships),
                'historical_relationships': len(historical_relationships),
                'prompt_entities': len(prompt_entities or []),
                'total_states': len(entity_states)
            }
            
        except Exception as e:
            self._finish_execution("", f"Error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def _get_beat_relationships(self, story_id: str, scene_id: str, beat_id: str) -> List[Dict]:
        """Get all relationships within the current beat"""
        cursor = self.db.execute("""
            SELECT r.*, 
                   e1.name as entity1_name, e1.base_type as entity1_type,
                   e2.name as entity2_name, e2.base_type as entity2_type,
                   s1.entity_id as entity1_id, s2.entity_id as entity2_id
            FROM relationships r
            JOIN states s1 ON r.state_id1 = s1.state_id
            JOIN states s2 ON r.state_id2 = s2.state_id  
            JOIN entities e1 ON s1.entity_id = e1.entity_id
            JOIN entities e2 ON s2.entity_id = e2.entity_id
            WHERE r.story_id = ? AND r.scene_id = ? AND r.beat_id = ?
            ORDER BY r.created_at DESC
        """, (story_id, scene_id, beat_id))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _get_scene_relationships(self, story_id: str, scene_id: str, beat_id: str) -> List[Dict]:
        """Get all relationships within the current scene (excluding current beat)"""
        cursor = self.db.execute("""
            SELECT r.*, 
                   e1.name as entity1_name, e1.base_type as entity1_type,
                   e2.name as entity2_name, e2.base_type as entity2_type,
                   s1.entity_id as entity1_id, s2.entity_id as entity2_id
            FROM relationships r
            JOIN states s1 ON r.state_id1 = s1.state_id
            JOIN states s2 ON r.state_id2 = s2.state_id  
            JOIN entities e1 ON s1.entity_id = e1.entity_id
            JOIN entities e2 ON s2.entity_id = e2.entity_id
            WHERE r.story_id = ? AND r.scene_id = ? AND r.beat_id != ?
            ORDER BY r.created_at DESC
        """, (story_id, scene_id, beat_id))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _get_historical_relationships(self, story_id: str, current_scene_id: str, 
                                    prompt_entity_ids: List[int]) -> List[Dict]:
        """Get ALL historical relationships for entities mentioned in user prompt"""
        if not prompt_entity_ids:
            return []
        
        placeholders = ','.join(['?' for _ in prompt_entity_ids])
        
        cursor = self.db.execute(f"""
            SELECT r.*, 
                   e1.name as entity1_name, e1.base_type as entity1_type,
                   e2.name as entity2_name, e2.base_type as entity2_type,
                   s1.entity_id as entity1_id, s2.entity_id as entity2_id,
                   r.scene_id as historical_scene,
                   r.beat_id as historical_beat
            FROM relationships r
            JOIN states s1 ON r.state_id1 = s1.state_id
            JOIN states s2 ON r.state_id2 = s2.state_id  
            JOIN entities e1 ON s1.entity_id = e1.entity_id
            JOIN entities e2 ON s2.entity_id = e2.entity_id
            WHERE r.story_id = ? 
            AND r.scene_id != ?
            AND (s1.entity_id IN ({placeholders}) OR s2.entity_id IN ({placeholders}))
            ORDER BY r.scene_id DESC, r.beat_id DESC, r.created_at DESC
        """, [story_id, current_scene_id] + prompt_entity_ids + prompt_entity_ids)
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _get_entity_states_for_context(self, story_id: str, scene_id: str, beat_id: str) -> List[Dict]:
        """Get detailed entity states for all entities involved in current scene relationships"""
        cursor = self.db.execute("""
            SELECT DISTINCT e.*, s.*, 
                   s.current_form_description, s.current_form_description_detail,
                   s.current_function_description, s.current_function_description_detail,
                   s.current_character_description, s.current_character_description_detail,
                   s.current_goal_description, s.current_goal_description_detail,
                   s.current_history_description, s.current_history_description_detail,
                   s.attributes as current_attributes
            FROM entities e
            LEFT JOIN states s ON e.entity_id = s.entity_id 
                AND s.story_id = ? AND s.scene_id = ?
            WHERE e.story_id = ?
            AND e.entity_id IN (
                SELECT DISTINCT s1.entity_id FROM relationships r
                JOIN states s1 ON (r.state_id1 = s1.state_id OR r.state_id2 = s1.state_id)
                WHERE r.story_id = ? AND r.scene_id = ?
            )
            ORDER BY e.name
        """, (story_id, scene_id, story_id, story_id, scene_id))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _get_prompt_entity_detailed_states(self, story_id: str, prompt_entity_ids: List[int]) -> List[Dict]:
        """Get comprehensive state history for entities mentioned in prompt"""
        if not prompt_entity_ids:
            return []
        
        placeholders = ','.join(['?' for _ in prompt_entity_ids])
        
        cursor = self.db.execute(f"""
            SELECT e.*, s.*,
                   s.current_form_description, s.current_form_description_detail,
                   s.current_function_description, s.current_function_description_detail,
                   s.current_character_description, s.current_character_description_detail,
                   s.current_goal_description, s.current_goal_description_detail,
                   s.current_history_description, s.current_history_description_detail,
                   s.attributes as current_attributes,
                   s.scene_id as state_scene,
                   s.beat_id as state_beat
            FROM entities e
            LEFT JOIN states s ON e.entity_id = s.entity_id AND s.story_id = ?
            WHERE e.entity_id IN ({placeholders})
            ORDER BY e.entity_id, s.scene_id DESC, s.beat_id DESC, s.created_at DESC
        """, [story_id] + prompt_entity_ids)
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _build_context_summary(self, beat_relationships: List[Dict], scene_relationships: List[Dict],
                             historical_relationships: List[Dict], entity_states: List[Dict],
                             prompt_entity_states: List[Dict], prompt_entities: List[Dict]) -> Dict[str, Any]:
        """Build comprehensive context summary focusing on prompt entities"""
        
        # Create entity lookup for current scene
        entity_details = {state['entity_id']: state for state in entity_states}
        
        # Create detailed history for prompt entities
        prompt_entity_details = {}
        for state in prompt_entity_states:
            entity_id = state['entity_id']
            if entity_id not in prompt_entity_details:
                prompt_entity_details[entity_id] = {
                    'base_entity': state,
                    'state_history': []
                }
            if state.get('state_scene'):  # Has state data
                prompt_entity_details[entity_id]['state_history'].append(state)
        
        context = {
            'immediate_context': {
                'description': 'Current beat relationships (highest priority)',
                'relationships': beat_relationships
            },
            'scene_context': {
                'description': 'Current scene relationships (medium priority)', 
                'relationships': scene_relationships
            },
            'prompt_entities_context': {
                'description': 'Full historical context for entities mentioned in user prompt',
                'entities': [],
                'historical_relationships': historical_relationships
            },
            'other_scene_entities': {
                'description': 'Other entities active in current scene',
                'entities': []
            }
        }
        
        # Add detailed information for prompt entities
        prompt_entity_ids = [e['entity_id'] for e in prompt_entities]
        
        for entity_id, entity_data in prompt_entity_details.items():
            entity_summary = self._create_detailed_entity_summary(entity_data)
            context['prompt_entities_context']['entities'].append(entity_summary)
        
        # Add other scene entities (not mentioned in prompt)
        for entity_id, entity_data in entity_details.items():
            if entity_id not in prompt_entity_ids:
                entity_summary = self._create_entity_summary(entity_data)
                context['other_scene_entities']['entities'].append(entity_summary)
        
        return context
    
    def _create_detailed_entity_summary(self, entity_data: Dict) -> Dict[str, Any]:
        """Create comprehensive entity summary with full state history"""
        base_entity = entity_data['base_entity']
        state_history = entity_data['state_history']
        
        summary = {
            'entity_id': base_entity['entity_id'],
            'name': base_entity['name'],
            'base_type': base_entity['base_type'],
            'type': base_entity['type'],
            'base_descriptions': {
                'form': base_entity.get('form_description', ''),
                'function': base_entity.get('function_description', ''),
                'character': base_entity.get('character_description', ''),
                'goal': base_entity.get('goal_description', ''),
                'history': base_entity.get('history_description', '')
            },
            'current_state': {},
            'state_evolution': []
        }
        
        # Get most recent state as current
        if state_history:
            latest_state = state_history[0]
            summary['current_state'] = {
                'form': latest_state.get('current_form_description') or base_entity.get('form_description', ''),
                'function': latest_state.get('current_function_description') or base_entity.get('function_description', ''),
                'character': latest_state.get('current_character_description') or base_entity.get('character_description', ''),
                'goal': latest_state.get('current_goal_description') or base_entity.get('goal_description', ''),
                'history': latest_state.get('current_history_description') or base_entity.get('history_description', ''),
                'attributes': json.loads(latest_state.get('current_attributes', '{}'))
            }
            
            # Add state evolution history
            for state in state_history[:5]:  # Last 5 states
                if state.get('state_scene'):
                    summary['state_evolution'].append({
                        'scene': state['state_scene'],
                        'beat': state['state_beat'],
                        'changes': self._identify_state_changes(base_entity, state)
                    })
        
        return summary
    
    def _identify_state_changes(self, base_entity: Dict, state: Dict) -> List[str]:
        """Identify what changed in this state vs base entity"""
        changes = []
        
        state_fields = [
            ('current_form_description', 'form_description', 'form'),
            ('current_function_description', 'function_description', 'function'),
            ('current_character_description', 'character_description', 'character'),
            ('current_goal_description', 'goal_description', 'goal'),
            ('current_history_description', 'history_description', 'history')
        ]
        
        for current_field, base_field, label in state_fields:
            current_val = state.get(current_field, '').strip()
            base_val = base_entity.get(base_field, '').strip()
            
            if current_val and current_val != base_val:
                changes.append(f"{label}: {current_val}")
        
        # Add attribute changes
        current_attrs = json.loads(state.get('current_attributes', '{}'))
        if current_attrs:
            attr_changes = [f"{k}: {v}" for k, v in current_attrs.items() if v]
            if attr_changes:
                changes.append(f"attributes: {', '.join(attr_changes)}")
        
        return changes
    
    def _create_entity_summary(self, entity_data: Dict) -> Dict[str, Any]:
        """Create basic entity summary for non-prompt entities"""
        summary = {
            'entity_id': entity_data['entity_id'],
            'name': entity_data['name'],
            'base_type': entity_data['base_type'],
            'type': entity_data['type'],
            'current_state': {
                'form': entity_data.get('current_form_description') or entity_data.get('form_description', ''),
                'character': entity_data.get('current_character_description') or entity_data.get('character_description', ''),
                'attributes': json.loads(entity_data.get('current_attributes', '{}'))
            }
        }
        
        return summary
    
    def _build_generation_prompt(self, context_summary: Dict[str, Any], user_input: str) -> str:
        """Build the final generation prompt with focus on prompt entities"""
        prompt_parts = [
            self.config['instructions'],
            "\n## STORY GENERATION CONTEXT",
            "\nYou are generating the next part of an ongoing story. Use this context to maintain continuity and consistency.\n"
        ]
        
        # Add immediate context (current beat)
        if context_summary['immediate_context']['relationships']:
            prompt_parts.append("### IMMEDIATE CONTEXT (Current Beat)")
            prompt_parts.append("These relationships are active RIGHT NOW:")
            for rel in context_summary['immediate_context']['relationships']:
                detail = f" - {rel['description_detail']}" if rel.get('description_detail') else ""
                prompt_parts.append(f"• {rel['entity1_name']} {rel['description']} {rel['entity2_name']}{detail}")
            prompt_parts.append("")
        
        # Add detailed context for entities mentioned in prompt
        if context_summary['prompt_entities_context']['entities']:
            prompt_parts.append("### ENTITIES MENTIONED IN USER PROMPT (Full Context)")
            prompt_parts.append("These entities were specifically mentioned - provide detailed context:")
            
            for entity in context_summary['prompt_entities_context']['entities']:
                prompt_parts.append(f"\n**{entity['name']}** ({entity['base_type']}):")
                
                # Current state
                if entity['current_state']:
                    for aspect, desc in entity['current_state'].items():
                        if desc and aspect != 'attributes':
                            prompt_parts.append(f"  {aspect.title()}: {desc}")
                    if entity['current_state'].get('attributes'):
                        attrs = [f"{k}: {v}" for k, v in entity['current_state']['attributes'].items() if v]
                        if attrs:
                            prompt_parts.append(f"  Attributes: {', '.join(attrs)}")
                
                # State evolution
                if entity.get('state_evolution'):
                    prompt_parts.append(f"  Recent changes:")
                    for evolution in entity['state_evolution'][:3]:
                        if evolution['changes']:
                            prompt_parts.append(f"    {evolution['scene']}/{evolution['beat']}: {'; '.join(evolution['changes'])}")
        
        # Add historical relationships for prompt entities
        if context_summary['prompt_entities_context']['historical_relationships']:
            prompt_parts.append("\n### HISTORICAL CONTEXT FOR PROMPT ENTITIES")
            prompt_parts.append("Previous relationships involving mentioned entities:")
            for rel in context_summary['prompt_entities_context']['historical_relationships'][:10]:
                scene_beat = f"{rel['historical_scene']}/{rel['historical_beat']}"
                prompt_parts.append(f"• [{scene_beat}] {rel['entity1_name']} {rel['description']} {rel['entity2_name']}")
        
        # Add scene context
        if context_summary['scene_context']['relationships']:
            prompt_parts.append("\n### SCENE CONTEXT")
            prompt_parts.append("Other relationships active in this scene:")
            for rel in context_summary['scene_context']['relationships'][:8]:
                prompt_parts.append(f"• {rel['entity1_name']} {rel['description']} {rel['entity2_name']}")
        
        # Add other entities (minimal detail)
        if context_summary['other_scene_entities']['entities']:
            prompt_parts.append("\n### OTHER ENTITIES PRESENT")
            entity_names = [e['name'] for e in context_summary['other_scene_entities']['entities']]
            prompt_parts.append(f"Also in scene: {', '.join(entity_names)}")
        
        # Add user direction
        if user_input.strip():
            prompt_parts.append(f"\n### USER DIRECTION")
            prompt_parts.append(user_input)
        
        # Final generation instruction
        prompt_parts.append("\n### GENERATE NEXT STORY SEGMENT")
        prompt_parts.append("Continue the story naturally, maintaining consistency with the above context. Pay special attention to entities mentioned in the user prompt and their full historical context.")
        
        return "\n".join(prompt_parts)