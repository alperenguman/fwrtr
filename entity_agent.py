import json
import re
from typing import Dict, List, Any, Optional
from base_agent import BaseAgent


class EntityAgent(BaseAgent):
    """Identifies and manages entities from text using task-based configuration"""
    
    # Replace the execute method in your entity_agent.py with this:
    def execute(self, story_text: str, story_context: Dict, extract_only: bool = False, 
                entity_names: List[str] = None) -> Dict[str, Any]:
        """Main execution entry point - delegates to specific task methods based on agent_task_id"""
        
        print(f"DEBUG: EntityAgent.execute called with task_id={self.agent_task_id}")
        print(f"DEBUG: story_context={story_context}")
        
        # START execution tracking here for ALL tasks
        execution_id = self._start_execution(
            story_context['story_id'], 
            None,
            f"Task {self.agent_task_id}: {story_text[:100]}..."
        )
        
        print(f"DEBUG: After _start_execution - execution_id={execution_id}, db_execution_id={getattr(self, 'db_execution_id', 'NOT SET')}")
        
        try:
            # Route to specific task method based on agent_task_id
            if self.agent_task_id == 1:
                result = self._task1_raw_extraction(story_text, story_context, extract_only)
            elif self.agent_task_id == 2:
                # Task 2 receives entity names from Task 1 or manual input
                result = self._task2_string_matching(story_text, story_context, extract_only, entity_names)
            elif self.agent_task_id == 3:
                result = self._task3_disambiguation(story_text, story_context, extract_only)
            else:
                raise ValueError(f"Unknown task_id: {self.agent_task_id}")
            
            print(f"DEBUG: Task completed successfully, returning result")
            return result
                
        except Exception as e:
            print(f"DEBUG: Exception in execute: {e}")
            self._finish_execution("", f"Error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def _task1_raw_extraction(self, story_text: str, story_context: Dict, extract_only: bool) -> Dict[str, Any]:
       """Task 1: Extract raw entity names from text using LLM"""
       print(f"[EntityAgent:1] Starting raw entity extraction")
       
       try:
           # Build the actual prompt first
           existing_entities = self._get_existing_entities(story_context['story_id'])
           existing_names = [e['name'] for e in existing_entities]
           extraction_prompt = self._build_database_prompt(story_text, existing_names)
           
           # NOW start execution tracking with the actual LLM prompt
           execution_id = self._start_execution(
               story_context['story_id'], 
               None,
               extraction_prompt  # ✅ Full LLM prompt as source_text
           )
           
           # Extract entity names using LLM with database prompt
           entity_names = self._extract_entities_with_database_prompt(story_text, story_context['story_id'])
           
           # Get tokens used from LLM call
           tokens_used = getattr(self, '_current_tokens', 0)
           
           if extract_only:
               # Return simple list for other agents
               prompt_entities = [{'entity_id': None, 'name': name, 'mentions': [name]} for name in entity_names]
               
               print(f"DEBUG: About to call _finish_execution with {len(entity_names)} entities")
               # Store the raw LLM response for debugging
               raw_llm_response = getattr(self, '_last_llm_response', 'No LLM response captured')
               self._finish_execution(
                   raw_llm_response,  # ✅ Raw LLM response
                   "Raw extraction completed successfully", 
                   tokens_used
               )
               
               return {
                   'success': True,
                   'entities': prompt_entities,
                   'raw_names': entity_names,
                   'task': 'raw_extraction'
               }
           
           # Full mode: continue with string matching and entity creation
           return self._continue_full_processing(entity_names, story_context)
           
       except Exception as e:
           print(f"DEBUG: Exception in _task1_raw_extraction: {e}")
           self._finish_execution("", f"Task 1 Error: {str(e)}", 0)
           return {'success': False, 'error': str(e)}
    
    def _task2_string_matching(self, story_text: str, story_context: Dict, extract_only: bool, entity_names: List[str] = None) -> Dict[str, Any]:
        """Task 2: Enhanced string matching against database aliases"""
        print(f"[EntityAgent:2] Starting enhanced string matching")
        
        try:
            # Task 2 ONLY does string matching - requires entity names from Task 1
            if entity_names is None:
                error_msg = "Task 2 requires entity names from Task 1. No entity extraction performed."
                self._finish_execution("", error_msg)
                return {
                    'success': False, 
                    'error': error_msg,
                    'task': 'string_matching',
                    'requires': 'entity_names_from_task1'
                }
            
            print(f"[EntityAgent:2] Matching {len(entity_names)} entity names: {entity_names}")
            
            if not entity_names:
                self._finish_execution(
                    "Empty entity names list provided",
                    "String matching completed - no entities to match"
                )
                return {
                    'success': True,
                    'matching_results': {},
                    'entity_names': [],
                    'task': 'string_matching',
                    'strategy_stats': {'no_entities': True}
                }
            
            # Get all entity aliases for matching
            entity_aliases = self._get_entity_aliases_for_matching(story_context['story_id'])
            
            # Perform enhanced string matching
            matching_results = {}
            strategy_stats = {'exact': 0, 'normalized': 0, 'fuzzy': 0, 'ambiguous': 0, 'no_match': 0}
            
            for entity_name in entity_names:
                match_result = self._find_best_string_match(entity_name, entity_aliases)
                matching_results[entity_name] = match_result
                
                # Track strategy usage
                match_type = match_result.get('match_type', 'no_match')
                if match_type in strategy_stats:
                    strategy_stats[match_type] += 1
                else:
                    strategy_stats['no_match'] += 1
            
            # Build result summary
            total_matches = sum(v for k, v in strategy_stats.items() if k != 'no_match')
            result_summary = f"Matched {len(entity_names)} entities: {total_matches} found, {strategy_stats['no_match']} unmatched"
            
            self._finish_execution(
                result_summary,
                "Enhanced string matching completed successfully"
            )
            
            return {
                'success': True,
                'matching_results': matching_results,
                'entity_names': entity_names,
                'task': 'string_matching',
                'strategy_stats': strategy_stats,
                'total_entities': len(entity_names)
            }
            
        except Exception as e:
            error_msg = f"Task 2 Error: {str(e)}"
            self._finish_execution("", error_msg, 0)
            return {'success': False, 'error': error_msg}

    # Task 2 does NOT extract entities - that's Task 1's job
    # Remove _enhanced_simple_extraction method

    def _get_entity_aliases_for_matching(self, story_id: str) -> List[Dict]:
        """Get entity aliases with metadata for matching"""
        cursor = self.db.execute("""
            SELECT ea.alias_name, ea.entity_id, ea.alias_type,
                   e.name as entity_name, e.base_type, e.type
            FROM entity_aliases ea
            JOIN entities e ON ea.entity_id = e.entity_id
            WHERE e.story_id = ?
            ORDER BY ea.alias_type, ea.alias_name
        """, (story_id,))
        
        return [dict(row) for row in cursor.fetchall()]

    def _find_best_string_match(self, entity_name: str, entity_aliases: List[Dict]) -> Dict:
        """Find best string match using multiple strategies"""
        if not entity_aliases:
            return {'match_type': 'no_match', 'reason': 'no aliases in database'}
        
        name_lower = entity_name.lower().strip()
        
        # Strategy 1: Exact match (case-insensitive)
        exact_matches = [alias for alias in entity_aliases 
                        if alias['alias_name'].lower().strip() == name_lower]
        
        if len(exact_matches) == 1:
            match = exact_matches[0]
            return {
                'entity_id': match['entity_id'],
                'match_type': 'exact',
                'matched_alias': match['alias_name'],
                'entity_name': match['entity_name'],
                'confidence': 1.0
            }
        elif len(exact_matches) > 1:
            return {
                'match_type': 'ambiguous',
                'candidates': [
                    {
                        'entity_id': m['entity_id'],
                        'entity_name': m['entity_name'],
                        'matched_alias': m['alias_name'],
                        'confidence': 1.0
                    } for m in exact_matches
                ],
                'reason': f'"{entity_name}" exactly matches multiple aliases'
            }
        
        # Strategy 2: Normalized match (remove articles, punctuation)
        normalized_name = self._normalize_for_matching(entity_name)
        normalized_matches = []
        
        for alias in entity_aliases:
            normalized_alias = self._normalize_for_matching(alias['alias_name'])
            if normalized_alias == normalized_name:
                normalized_matches.append(alias)
        
        if len(normalized_matches) == 1:
            match = normalized_matches[0]
            return {
                'entity_id': match['entity_id'],
                'match_type': 'normalized',
                'matched_alias': match['alias_name'],
                'entity_name': match['entity_name'],
                'confidence': 0.9
            }
        elif len(normalized_matches) > 1:
            return {
                'match_type': 'ambiguous',
                'candidates': [
                    {
                        'entity_id': m['entity_id'],
                        'entity_name': m['entity_name'],
                        'matched_alias': m['alias_name'],
                        'confidence': 0.9
                    } for m in normalized_matches
                ],
                'reason': f'"{entity_name}" matches multiple aliases after normalization'
            }
        
        # Strategy 3: Fuzzy matching
        from difflib import SequenceMatcher
        fuzzy_matches = []
        threshold = 0.8
        
        for alias in entity_aliases:
            similarity = SequenceMatcher(None, name_lower, alias['alias_name'].lower()).ratio()
            if similarity >= threshold:
                fuzzy_matches.append((alias, similarity))
        
        if fuzzy_matches:
            # Sort by similarity
            fuzzy_matches.sort(key=lambda x: x[1], reverse=True)
            
            # Check if top match is significantly better
            if len(fuzzy_matches) == 1 or fuzzy_matches[0][1] > fuzzy_matches[1][1] + 0.1:
                best_match, score = fuzzy_matches[0]
                return {
                    'entity_id': best_match['entity_id'],
                    'match_type': 'fuzzy',
                    'matched_alias': best_match['alias_name'],
                    'entity_name': best_match['entity_name'],
                    'confidence': score,
                    'similarity_score': score
                }
            else:
                # Multiple similar matches
                return {
                    'match_type': 'ambiguous',
                    'candidates': [
                        {
                            'entity_id': match[0]['entity_id'],
                            'entity_name': match[0]['entity_name'],
                            'matched_alias': match[0]['alias_name'],
                            'confidence': match[1],
                            'similarity_score': match[1]
                        } for match in fuzzy_matches[:5]
                    ],
                    'reason': f'"{entity_name}" has multiple fuzzy matches'
                }
        
        # No match found
        return {
            'match_type': 'no_match',
            'reason': f'No suitable matches found for "{entity_name}"'
        }

    def _normalize_for_matching(self, text: str) -> str:
        """Normalize text for better matching"""
        import re
        import unicodedata
        
        # Convert to lowercase and remove diacritics
        text = unicodedata.normalize('NFD', text.lower())
        text = ''.join(c for c in text if not unicodedata.combining(c))
        
        # Remove punctuation except spaces and hyphens
        text = re.sub(r'[^\w\s-]', ' ', text)
        
        # Remove common articles and words
        articles = {'the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their'}
        words = text.split()
        filtered_words = [word for word in words if word not in articles and len(word) > 1]
        
        return ' '.join(filtered_words).strip()
    
    def _task3_disambiguation(self, story_text: str, story_context: Dict, extract_only: bool) -> Dict[str, Any]:
        """Task 3: LLM-based disambiguation of ambiguous matches"""
        print(f"[EntityAgent:3] Starting disambiguation")
        
        try:
            self._finish_execution("Disambiguation not yet implemented", "Task 3 placeholder")
            
            return {
                'success': False,
                'error': 'Disambiguation task not yet implemented',
                'task': 'disambiguation'
            }
            
        except Exception as e:
            self._finish_execution("", f"Task 3 Error: {str(e)}", 0)
            return {'success': False, 'error': str(e)}
    
    def _extract_entities_with_database_prompt(self, text: str, story_id: str) -> List[str]:
        """Extract entity names using prompt from database configuration"""
        print(f"[EntityAgent:1] Using database prompt for extraction")
        
        try:
            # Get existing entities for context
            existing_entities = self._get_existing_entities(story_id)
            existing_names = [e['name'] for e in existing_entities]
            
            # Build prompt using database instructions + context
            extraction_prompt = self._build_database_prompt(text, existing_names)
            
            print(f"[EntityAgent:1] Built prompt with {len(extraction_prompt)} characters")
            print(f"[EntityAgent:1] Database instructions: {self.config['instructions'][:100]}...")
            
            # Prepare fallback function
            def fallback_extraction():
                print(f"[EntityAgent:1] Using fallback extraction")
                return self._fallback_raw_extraction(text, existing_entities)
            
            messages = [{"role": "user", "content": extraction_prompt}]
            
            # Use LLM with fallback
            llm_response = self.call_llm_with_fallback(
                messages=messages,
                fallback_func=fallback_extraction,
                max_tokens=500,
                temperature=0.3
            )
            
            print(f"[EntityAgent:1] LLM response received: {len(str(llm_response))} chars")
            
            # Parse response to extract entity names AND preserve raw data
            # After getting llm_response, store it for debugging
            if isinstance(llm_response, str) and llm_response.strip():
                self._last_llm_response = llm_response  # Store raw response
                entity_names, raw_entities = self._parse_entity_names_with_metadata(llm_response)
                if entity_names:
                    print(f"[EntityAgent:1] Successfully extracted {len(entity_names)} entities: {entity_names}")
                    if raw_entities:
                        print(f"[EntityAgent:1] Raw entity data: {raw_entities}")
                    return entity_names
            
            # Fall back if parsing failed
            print(f"[EntityAgent:1] LLM parsing failed, using fallback")
            return fallback_extraction()
            
        except Exception as e:
            print(f"[EntityAgent:1] LLM extraction failed: {e}, falling back")
            return self._fallback_raw_extraction(text, self._get_existing_entities(story_id))
    
    def _build_database_prompt(self, text: str, existing_names: List[str]) -> str:
        """Build prompt using database instructions plus context"""
        context_parts = []
        
        # Add existing entities context if available
        if existing_names:
            context_parts.append(f"Existing entities in story: {', '.join(existing_names[:10])}")
        else:
            context_parts.append("No existing entities in story yet.")
        
        # Add the text to analyze
        context_parts.append(f"Text to analyze: {text}")
        
        context_str = "\n\n".join(context_parts)
        
        # Combine database instructions with context
        full_prompt = f"{self.config['instructions']}\n\n{context_str}"
        
        return full_prompt
    
    def _parse_entity_names_with_metadata(self, llm_response: str) -> tuple[List[str], List[Dict]]:
        """Parse LLM response to extract entity names AND preserve raw metadata"""
        entity_names = []
        raw_entities = []
        
        try:
            # First try to find JSON array
            json_match = re.search(r'\[.*?\]', llm_response, re.DOTALL)
            if json_match:
                try:
                    parsed_data = json.loads(json_match.group())
                    if isinstance(parsed_data, list):
                        for item in parsed_data:
                            if isinstance(item, dict):
                                # Preserve the full raw entity data
                                raw_entities.append(item)
                                
                                # Extract just the name for processing
                                if 'name' in item:
                                    entity_names.append(str(item['name']).strip())
                                elif 'entity' in item:
                                    entity_names.append(str(item['entity']).strip())
                                elif 'entity_name' in item:
                                    entity_names.append(str(item['entity_name']).strip())
                            elif isinstance(item, str):
                                # Handle simple string arrays
                                entity_names.append(str(item).strip())
                                raw_entities.append({'name': str(item).strip(), 'confidence': None})
                            else:
                                # Handle other types
                                name = str(item).strip()
                                entity_names.append(name)
                                raw_entities.append({'name': name, 'confidence': None})
                        
                        # Filter out empty names
                        filtered_names = [name for name in entity_names if name]
                        return filtered_names, raw_entities
                        
                except json.JSONDecodeError as e:
                    print(f"[EntityAgent:1] JSON parsing failed: {e}")
            
            # Fall back to simple parsing method
            entity_names = self._parse_entity_names_from_response(llm_response)
            raw_entities = [{'name': name, 'confidence': None} for name in entity_names]
            return entity_names, raw_entities
            
        except Exception as e:
            print(f"[EntityAgent:1] Error parsing response with metadata: {e}")
            return [], []
    
    def _parse_entity_names_from_response(self, llm_response: str) -> List[str]:
        """Parse LLM response to extract entity names - handles various formats"""
        try:
            # First try to find JSON array
            json_match = re.search(r'\[.*?\]', llm_response, re.DOTALL)
            if json_match:
                try:
                    parsed_data = json.loads(json_match.group())
                    if isinstance(parsed_data, list):
                        entity_names = []
                        for item in parsed_data:
                            if isinstance(item, dict):
                                # Handle objects with 'name' field: {"name": "Tom", "confidence": 1.0}
                                if 'name' in item:
                                    entity_names.append(str(item['name']).strip())
                                # Handle other possible field names
                                elif 'entity' in item:
                                    entity_names.append(str(item['entity']).strip())
                                elif 'entity_name' in item:
                                    entity_names.append(str(item['entity_name']).strip())
                            elif isinstance(item, str):
                                # Handle simple string arrays: ["Tom", "golfing"]
                                entity_names.append(str(item).strip())
                            else:
                                # Handle other types by converting to string
                                entity_names.append(str(item).strip())
                        
                        # Filter out empty names
                        return [name for name in entity_names if name]
                except json.JSONDecodeError as e:
                    print(f"[EntityAgent:1] JSON parsing failed: {e}")
            
            # Try to find quoted strings
            quoted_entities = re.findall(r'"([^"]+)"', llm_response)
            if quoted_entities:
                return [name.strip() for name in quoted_entities if name.strip()]
            
            # Try to find entities in bullet points or lines
            lines = llm_response.split('\n')
            entities = []
            for line in lines:
                line = line.strip()
                # Remove bullet points, numbers, dashes
                cleaned = re.sub(r'^[-•*\d\.\)]+\s*', '', line)
                if cleaned and len(cleaned.split()) <= 4:  # Reasonable entity name length
                    entities.append(cleaned)
            
            if entities:
                return entities
            
        except Exception as e:
            print(f"[EntityAgent:1] Error parsing response: {e}")
        
        return []
    
    def _simple_entity_extraction(self, text: str, story_id: str) -> List[str]:
        """Simple extraction for non-LLM tasks"""
        existing_entities = self._get_existing_entities(story_id)
        entity_names = []
        
        # Look for existing entities mentioned in text
        for existing in existing_entities:
            if existing['name'].lower() in text.lower():
                entity_names.append(existing['name'])
        
        # Simple pattern matching for new entities (proper nouns)
        proper_nouns = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        
        for noun in set(proper_nouns):
            if noun not in entity_names:
                entity_names.append(noun)
        
        return entity_names
    
    def _fallback_raw_extraction(self, text: str, existing_entities: List[Dict]) -> List[str]:
        """Fallback extraction when LLM fails"""
        entity_names = []
        
        # Look for existing entities mentioned in text
        for existing in existing_entities:
            if existing['name'].lower() in text.lower():
                entity_names.append(existing['name'])
        
        # Simple pattern matching for new entities (proper nouns only)
        proper_nouns = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        
        for noun in set(proper_nouns):
            if noun not in entity_names:
                entity_names.append(noun)
        
        return entity_names
    
    def _continue_full_processing(self, entity_names: List[str], story_context: Dict) -> Dict[str, Any]:
        """Continue with full entity processing after raw extraction"""
        entity_mappings = []
        story_id = story_context['story_id']
        
        for name in entity_names:
            # Check if entity exists
            existing = self._find_existing_entity_by_name(name, story_id)
            
            if existing:
                entity_mappings.append({
                    'entity_id': existing['entity_id'],
                    'name': existing['name'],
                    'created': False,
                    'type': existing['base_type']
                })
            else:
                # Create new entity with default type
                entity_id = self._create_simple_entity(name, story_id)
                entity_mappings.append({
                    'entity_id': entity_id,
                    'name': name,
                    'created': True,
                    'type': 'object'
                })
        
        self._finish_execution(
            f"Processed {len(entity_names)} entities",
            "Full processing completed"
        )
        
        return {
            'success': True,
            'entities_found': len(entity_names),
            'entities_created': len([e for e in entity_mappings if e['created']]),
            'entities_existing': len([e for e in entity_mappings if not e['created']]),
            'entity_mappings': entity_mappings,
            'task': 'full_processing'
        }
    
    def _get_existing_entities(self, story_id: str) -> List[Dict]:
        """Get all existing entities in the story"""
        cursor = self.db.execute("""
            SELECT entity_id, name, type, base_type, description
            FROM entities 
            WHERE story_id = ?
            ORDER BY name
        """, (story_id,))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _find_existing_entity_by_name(self, name: str, story_id: str) -> Optional[Dict]:
        """Find existing entity by exact name match"""
        cursor = self.db.execute("""
            SELECT * FROM entities 
            WHERE story_id = ? AND LOWER(name) = LOWER(?)
        """, (story_id, name))
        
        existing = cursor.fetchone()
        return dict(existing) if existing else None
    
    def _create_simple_entity(self, name: str, story_id: str) -> int:
        """Create simple entity with default class"""
        # Get default object class
        cursor = self.db.execute("""
            SELECT class_id FROM classes 
            WHERE type = 'object' AND parent_class_id IS NULL
        """)
        
        class_row = cursor.fetchone()
        if not class_row:
            raise ValueError("No object class found")
        
        class_id = class_row['class_id']
        
        # Create entity
        cursor = self.db.execute("""
            INSERT INTO entities 
            (story_id, class_id, type, base_type, name, description)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (story_id, class_id, 'object', 'object', name, f'Entity: {name}'))
        
        entity_id = cursor.lastrowid
        
        # Create alias entry
        self.db.execute("""
            INSERT INTO entity_aliases (entity_id, alias_name, alias_type)
            VALUES (?, ?, ?)
        """, (entity_id, name, 'primary'))
        
        self.db.commit()
        return entity_id
    
    # String matching methods (used by Task 2)
    def resolve_entities_step1_string_matching(self, extracted_names: List[str], story_id: str) -> Dict[str, Any]:
        """String-based entity resolution against aliases table"""
        # Get all entity aliases
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
    
    def _find_string_match_in_aliases(self, name: str, entity_aliases) -> Optional[Dict]:
        """Find best string match using exact, substring, and fuzzy matching"""
        name_lower = name.lower()
        
        # 1. Exact matches
        exact_matches = [alias for alias in entity_aliases if name_lower == alias['alias_name'].lower()]
        
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
                'reason': f'"{name}" exactly matches multiple aliases'
            }
        elif len(exact_matches) == 1:
            match = exact_matches[0]
            return {
                'entity_id': match['entity_id'], 
                'match_type': 'exact',
                'matched_alias': match['alias_name'],
                'entity_name': match['entity_name']
            }
        
        # 2. Substring matches
        substring_matches = [alias for alias in entity_aliases 
                           if name_lower in alias['alias_name'].lower() or alias['alias_name'].lower() in name_lower]
        
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
                'reason': f'"{name}" matches multiple aliases'
            }
        elif len(substring_matches) == 1:
            match = substring_matches[0]
            return {
                'entity_id': match['entity_id'], 
                'match_type': 'substring',
                'matched_alias': match['alias_name'],
                'entity_name': match['entity_name']
            }
        
        # 3. Fuzzy matches
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
        
        if len(fuzzy_matches) > 1:
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
                'reason': f'"{name}" has multiple fuzzy matches'
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
        
        return None