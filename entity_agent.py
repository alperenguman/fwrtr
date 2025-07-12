import json
import re
from typing import Dict, List, Any
from base_agent import BaseAgent


class EntityAgent(BaseAgent):
    """Identifies and manages entities from text"""
    
    def __init__(self, agent_type: str, agent_task_id: int, db_connection):
        super().__init__(agent_type, agent_task_id, db_connection)
    
    def execute(self, story_text: str, story_context: Dict, extract_only: bool = False) -> Dict[str, Any]:
        """
        Extract and manage entities from text:
        1. Extract entities from text using LLM or fallback
        2. Create/update entities with proper class hierarchy
        3. Optionally create states in current context
        4. Return entity information for other agents
        
        Args:
            story_text: Text to analyze for entities
            story_context: Context info (story_id, scene_id, beat_id, etc.)
            extract_only: If True, only extract/identify entities without creating states
        """
        execution_id = self._start_execution(
            story_context['story_id'], 
            None,  # No story_entry_id for entity extraction
            f"Extracting entities from: {story_text[:100]}..."
        )
        
        try:
            # 1. Extract entities from text using LLM with fallback
            extracted_entities = self._extract_entities_with_llm(story_text, story_context['story_id'])
            
            # 2. Create/update entities in database with class confirmation
            entity_mappings = self._create_or_update_entities(extracted_entities, story_context['story_id'])
            
            if extract_only:
                # Return just entity information for other agents (like PrepAgent)
                prompt_entities = self._format_entities_for_agents(entity_mappings, story_text)
                
                self._finish_execution(
                    f"Extracted {len(prompt_entities)} entities from text",
                    "Entity extraction completed successfully"
                )
                
                return {
                    'success': True,
                    'extract_only': True,
                    'entities': prompt_entities,
                    'entities_found': len(extracted_entities),
                    'entities_created': len([e for e in entity_mappings if e['created']]),
                    'entities_existing': len([e for e in entity_mappings if not e['created']])
                }
            
            # 3. Create states for entities in this context (full mode)
            entity_states = self._create_entity_states(entity_mappings, story_context)
            
            self._finish_execution(
                f"Processed {len(extracted_entities)} entities, created {len(entity_states)} states",
                "Entity processing completed successfully"
            )
            
            return {
                'success': True,
                'entities_found': len(extracted_entities),
                'entities_created': len([e for e in entity_mappings if e['created']]),
                'entities_existing': len([e for e in entity_mappings if not e['created']]),
                'states_created': len(entity_states),
                'entity_mappings': entity_mappings
            }
            
        except Exception as e:
            self._finish_execution("", f"Error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def resolve_entities_step1_string_matching(self, extracted_names: List[str], story_id: str) -> Dict[str, any]:
        """
        Step 1: String-based entity resolution against aliases table
        Returns mapping of extracted_name -> result dict
        """
        # Get all entity aliases (includes main names + aliases)
        entity_aliases = self.db.execute("""
            SELECT ea.alias_name, ea.entity_id, e.name as entity_name 
            FROM entity_aliases ea
            JOIN entities e ON ea.entity_id = e.entity_id
            WHERE e.story_id = ?
        """, (story_id,)).fetchall()
        
        results = {}
        
        for extracted_name in extracted_names:
            match = self._find_string_match_in_aliases(extracted_name, entity_aliases)
            if match:
                results[extracted_name] = match
            else:
                results[extracted_name] = {'match_type': 'no_match'}
        
        return results

    def _find_string_match_in_aliases(self, name: str, entity_aliases) -> Dict:
        """Find best string match using exact, substring, and fuzzy matching against aliases"""
        name_lower = name.lower()
        
        # 1. Exact matches - collect ALL exact matches first
        exact_matches = []
        for alias_row in entity_aliases:
            if name_lower == alias_row['alias_name'].lower():
                exact_matches.append(alias_row)
        
        # If multiple exact matches, return ambiguous
        if len(exact_matches) > 1:
            return {
                'match_type': 'ambiguous',
                'candidates': [
                    {
                        'entity_id': row['entity_id'], 
                        'entity_name': row['entity_name'],
                        'matched_alias': row['alias_name']
                    } for row in exact_matches
                ],
                'reason': f'"{name}" exactly matches multiple aliases: {", ".join([row["alias_name"] for row in exact_matches])}'
            }
        elif len(exact_matches) == 1:
            match = exact_matches[0]
            return {
                'entity_id': match['entity_id'], 
                'match_type': 'exact',
                'matched_alias': match['alias_name'],
                'entity_name': match['entity_name']
            }
        
        # 2. Substring matches - collect all matches
        substring_matches = []
        for alias_row in entity_aliases:
            alias_name_lower = alias_row['alias_name'].lower()
            if name_lower in alias_name_lower or alias_name_lower in name_lower:
                substring_matches.append(alias_row)
        
        # If multiple substring matches, return ambiguous
        if len(substring_matches) > 1:
            return {
                'match_type': 'ambiguous', 
                'candidates': [
                    {
                        'entity_id': row['entity_id'], 
                        'entity_name': row['entity_name'],
                        'matched_alias': row['alias_name']
                    } for row in substring_matches
                ],
                'reason': f'"{name}" matches multiple aliases: {", ".join([row["alias_name"] for row in substring_matches])}'
            }
        elif len(substring_matches) == 1:
            match = substring_matches[0]
            return {
                'entity_id': match['entity_id'], 
                'match_type': 'substring',
                'matched_alias': match['alias_name'],
                'entity_name': match['entity_name']
            }
        
        # 3. Fuzzy matches - collect all high-scoring matches
        from difflib import SequenceMatcher
        fuzzy_matches = []
        threshold = 0.8
        
        for alias_row in entity_aliases:
            similarity = SequenceMatcher(None, name_lower, alias_row['alias_name'].lower()).ratio()
            if similarity >= threshold:
                fuzzy_matches.append({
                    'alias_row': alias_row,
                    'score': similarity
                })
        
        # If multiple fuzzy matches, return ambiguous
        if len(fuzzy_matches) > 1:
            # Sort by score descending
            fuzzy_matches.sort(key=lambda x: x['score'], reverse=True)
            return {
                'match_type': 'ambiguous',
                'candidates': [
                    {
                        'entity_id': m['alias_row']['entity_id'], 
                        'entity_name': m['alias_row']['entity_name'],
                        'matched_alias': m['alias_row']['alias_name'],
                        'score': m['score']
                    } for m in fuzzy_matches
                ],
                'reason': f'"{name}" has multiple fuzzy matches with high similarity'
            }
        elif len(fuzzy_matches) == 1:
            match = fuzzy_matches[0]
            return {
                'entity_id': match['alias_row']['entity_id'], 
                'match_type': 'fuzzy', 
                'score': match['score'],
                'matched_alias': match['alias_row']['alias_name'],
                'entity_name': match['alias_row']['entity_name']
            }
        
        return None  # No matches found
    
    def _extract_entities_with_llm(self, text: str, story_id: str) -> List[str]:
        """Step 1: Extract ONLY raw entity names from text - no classification"""
        
        print(f"DEBUG: Step 1 - Raw entity extraction only")
        
        try:
            # Get existing entities for context only
            existing_entities = self._get_existing_entities(story_id)
            existing_names = [e['name'] for e in existing_entities]
            
            # Build raw extraction prompt using task-specific instructions
            extraction_prompt = self._build_raw_extraction_prompt(text, existing_names)
            
            # Prepare fallback function that returns just names
            def fallback_extraction():
                return self._fallback_raw_extraction(text, existing_entities)
            
            messages = [{"role": "user", "content": extraction_prompt}]
            
            llm_response = self.call_llm_with_fallback(
                messages=messages,
                fallback_func=fallback_extraction,
                max_tokens=500,
                temperature=0.3
            )
            
            # Parse response to extract just the names
            if isinstance(llm_response, str) and llm_response.strip():
                entity_names = self._parse_raw_names_response(llm_response)
                if entity_names:
                    return entity_names
            
            # Fall back to keyword extraction
            print("LLM response parsing failed, using fallback extraction")
            return fallback_extraction()
            
        except Exception as e:
            print(f"LLM extraction failed: {e}, falling back to keyword extraction")
            return self._fallback_raw_extraction(text, existing_entities)

    def _build_raw_extraction_prompt(self, text: str, existing_names: List[str]) -> str:
        """Build prompt for raw name extraction only"""
        prompt_parts = [
            "Extract ONLY the entity names from this text. Return just the names, nothing else.",
            "Do NOT classify, describe, or analyze - just list the entity names.",
            "",
            f"Text: {text}",
            "",
            "Return as simple JSON array of strings:",
            '["Entity Name 1", "Entity Name 2", "Entity Name 3"]',
            "",
            f"Reference (existing entities): {', '.join(existing_names[:5]) if existing_names else 'None'}"
        ]
        
        return "\n".join(prompt_parts)

    def _parse_raw_names_response(self, llm_response: str) -> List[str]:
        """Parse LLM response to extract just entity names"""
        try:
            import re
            # Try to find JSON array in the response
            json_match = re.search(r'\[.*?\]', llm_response, re.DOTALL)
            if json_match:
                entity_names = json.loads(json_match.group())
                # Validate it's a list of strings
                if isinstance(entity_names, list):
                    return [str(name).strip() for name in entity_names if str(name).strip()]
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse raw names response: {e}")
        
        return []

    def _fallback_raw_extraction(self, text: str, existing_entities: List[Dict]) -> List[str]:
        """Fallback: extract just raw entity names using patterns"""
        entity_names = []
        
        # Look for existing entities mentioned in text
        for existing in existing_entities:
            if existing['name'].lower() in text.lower():
                entity_names.append(existing['name'])
        
        # Simple pattern matching for new entities (proper nouns only)
        import re
        proper_nouns = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        
        for noun in set(proper_nouns):
            if noun not in entity_names:  # Avoid duplicates
                entity_names.append(noun)
        
        return entity_names
    
    def _build_extraction_prompt(self, text: str, existing_names: List[str]) -> str:
        """Build prompt for LLM entity extraction"""
        prompt_parts = [
            "Extract all entities (characters, objects, locations, times, thoughts, feelings, actions) from this text.",
            "For each entity provide: name, type, brief description, and any mentions/aliases.",
            "",
            "Entity types: actor, object, location, time, thought, feeling, action, activity",
            "",
            "Existing entities in this story: " + ", ".join(existing_names[:20]) if existing_names else "None yet",
            "",
            f"Text to analyze: {text}",
            "",
            "Return as JSON array with format:",
            '[{"name": "Entity Name", "type": "actor", "description": "Brief description", "mentions": ["name", "alias"], "confidence": 0.9}]',
            "",
            "Only include entities that are clearly present or referenced in the text."
        ]
        
        return "\n".join(prompt_parts)
    
    def _parse_extraction_response(self, llm_response: str, original_text: str) -> List[Dict[str, Any]]:
        """Parse LLM response to extract structured entity data"""
        try:
            # Try to find JSON in the response
            json_match = re.search(r'\[.*\]', llm_response, re.DOTALL)
            if json_match:
                entities_data = json.loads(json_match.group())
                
                # Validate and clean entity data
                validated_entities = []
                for entity in entities_data:
                    if isinstance(entity, dict) and 'name' in entity and 'type' in entity:
                        # Ensure required fields
                        validated_entity = {
                            'name': entity['name'].strip(),
                            'type': entity.get('type', 'object').lower(),
                            'description': entity.get('description', '').strip(),
                            'mentions': entity.get('mentions', [entity['name']]),
                            'confidence': float(entity.get('confidence', 0.8))
                        }
                        
                        # Validate type is one of our base types
                        valid_types = ['actor', 'object', 'location', 'time', 'thought', 'feeling', 'action', 'activity']
                        if validated_entity['type'] not in valid_types:
                            validated_entity['type'] = 'object'  # Default fallback
                        
                        validated_entities.append(validated_entity)
                
                return validated_entities
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Failed to parse LLM extraction response: {e}")
        
        # Return empty list if parsing fails - fallback will be used
        return []
    
    def _fallback_entity_extraction(self, text: str, existing_entities: List[Dict]) -> List[Dict[str, Any]]:
        """Fallback entity extraction using keywords and patterns"""
        entities = []
        
        # Look for existing entities mentioned in text
        for existing in existing_entities:
            if existing['name'].lower() in text.lower():
                entities.append({
                    'name': existing['name'],
                    'type': existing['base_type'],
                    'description': existing.get('description', ''),
                    'mentions': [existing['name']],
                    'confidence': 0.9,
                    'existing_id': existing['entity_id']
                })
        
        # Simple pattern matching for new entities
        # Proper nouns (capitalized words)
        proper_nouns = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        
        for noun in set(proper_nouns):
            # Skip if already found
            if any(e['name'].lower() == noun.lower() for e in entities):
                continue
                
            # Simple heuristics for type classification
            entity_type = 'actor'  # Default to actor for proper nouns
            if any(word in noun.lower() for word in ['street', 'road', 'building', 'house', 'room']):
                entity_type = 'location'
            elif any(word in noun.lower() for word in ['rod', 'book', 'car', 'phone', 'gun']):
                entity_type = 'object'
                
            entities.append({
                'name': noun,
                'type': entity_type,
                'description': f'Entity mentioned in text',
                'mentions': [noun],
                'confidence': 0.6
            })
        
        return entities
    
    def _get_existing_entities(self, story_id: str) -> List[Dict]:
        """Get all existing entities in the story"""
        cursor = self.db.execute("""
            SELECT entity_id, name, type, base_type, description
            FROM entities 
            WHERE story_id = ?
            ORDER BY name
        """, (story_id,))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _create_or_update_entities(self, extracted_entities: List[Dict], story_id: str) -> List[Dict]:
        """Create new entities or update existing ones with class hierarchy"""
        entity_mappings = []
        
        for entity_data in extracted_entities:
            # Check if entity already exists
            existing_entity = self._find_existing_entity(entity_data, story_id)
            
            if existing_entity:
                # Entity exists, return mapping
                entity_mappings.append({
                    'extracted': entity_data,
                    'entity_id': existing_entity['entity_id'],
                    'created': False,
                    'entity_name': existing_entity['name'],
                    'entity_type': existing_entity['base_type']
                })
            else:
                # Create new entity
                entity_id = self._create_new_entity(entity_data, story_id)
                entity_mappings.append({
                    'extracted': entity_data,
                    'entity_id': entity_id,
                    'created': True,
                    'entity_name': entity_data['name'],
                    'entity_type': entity_data['type']
                })
        
        return entity_mappings
    
    def _find_existing_entity(self, entity_data: Dict, story_id: str) -> Dict:
        """Find existing entity by name or aliases"""
        # Check exact name match first
        cursor = self.db.execute("""
            SELECT * FROM entities 
            WHERE story_id = ? AND LOWER(name) = LOWER(?)
        """, (story_id, entity_data['name']))
        
        existing = cursor.fetchone()
        if existing:
            return dict(existing)
        
        # Check mentions/aliases
        for mention in entity_data.get('mentions', []):
            cursor = self.db.execute("""
                SELECT * FROM entities 
                WHERE story_id = ? AND LOWER(name) = LOWER(?)
            """, (story_id, mention))
            
            existing = cursor.fetchone()
            if existing:
                return dict(existing)
        
        return None
    
    def _create_new_entity(self, entity_data: Dict, story_id: str) -> int:
        """Create new entity with proper class hierarchy"""
        # Determine class hierarchy
        class_id = self._determine_entity_class(entity_data)
        
        # Create entity
        cursor = self.db.execute("""
            INSERT INTO entities 
            (story_id, class_id, type, base_type, name, description)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            story_id, class_id, entity_data['type'], 
            entity_data['type'], entity_data['name'], 
            entity_data.get('description', '')
        ))
        
        self.db.commit()
        return cursor.lastrowid
    
    def _determine_entity_class(self, entity_data: Dict) -> int:
        """Determine appropriate class for entity"""
        # Get base class
        cursor = self.db.execute("""
            SELECT class_id FROM classes 
            WHERE type = ? AND parent_class_id IS NULL
        """, (entity_data['type'],))
        
        base_class = cursor.fetchone()
        if not base_class:
            # Default to object class if type not found
            cursor = self.db.execute("""
                SELECT class_id FROM classes 
                WHERE type = 'object' AND parent_class_id IS NULL
            """)
            base_class = cursor.fetchone()
        
        if not base_class:
            raise ValueError(f"No base class found for type: {entity_data['type']}")
        
        # For now, use base class - later implement subclass logic
        # This is where you'd check for subclasses like clothing->pants->jeans
        # and potentially ask user for confirmation
        
        return base_class['class_id']
    
    def _create_entity_states(self, entity_mappings: List[Dict], story_context: Dict) -> List[int]:
        """Create states for entities in this story context"""
        state_ids = []
        
        for mapping in entity_mappings:
            # Create state for this entity in current context
            cursor = self.db.execute("""
                INSERT INTO states 
                (story_id, timeline_id, scene_id, beat_id, entity_id, attributes)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                story_context['story_id'],
                story_context['timeline_id'],
                story_context['scene_id'],
                story_context['beat_id'],
                mapping['entity_id'],
                json.dumps({})  # Empty attributes initially
            ))
            
            state_ids.append(cursor.lastrowid)
        
        self.db.commit()
        return state_ids
    
    def _format_entities_for_agents(self, entity_mappings: List[Dict], original_text: str) -> List[Dict]:
        """Format entity mappings for other agents (like PrepAgent)"""
        entities = []
        
        for mapping in entity_mappings:
            extracted = mapping['extracted']
            entities.append({
                'entity_id': mapping['entity_id'],
                'name': mapping['entity_name'],
                'mentions': extracted.get('mentions', [extracted['name']]),
                'type': mapping['entity_type'],
                'confidence': extracted.get('confidence', 0.8),
                'created': mapping['created']
            })
        
        return entities