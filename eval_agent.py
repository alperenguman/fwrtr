import json
from typing import Dict, Any
from base_agent import BaseAgent

class EvalAgent(BaseAgent):
    """Evaluates raw generation output and determines scene/beat boundaries."""

    def execute(self, story_id: str, scene_id: str, beat_id: str, text: str) -> Dict[str, Any]:
        execution_id = self._start_execution(story_id, source_text=text)
        try:
            prompt = f"{self.config['instructions']}\n\n{text}"

            def fallback_eval():
                return json.dumps({
                    'processed_text': text,
                    'new_scene': False,
                    'new_beat': False
                })

            messages = [{"role": "user", "content": prompt}]
            result = self.call_llm_with_fallback(messages=messages, fallback_func=fallback_eval, max_tokens=400, temperature=0.2)

            try:
                data = json.loads(result)
                processed_text = data.get('processed_text', text)
                new_scene = bool(data.get('new_scene'))
                new_beat = bool(data.get('new_beat'))
            except Exception:
                processed_text = text
                new_scene = False
                new_beat = False

            self._finish_execution(result, "Evaluation complete", getattr(self, '_current_tokens', 0))
            return {
                'success': True,
                'processed_text': processed_text,
                'new_scene': new_scene,
                'new_beat': new_beat
            }
        except Exception as e:
            self._finish_execution("", f"Error: {str(e)}")
            return {'success': False, 'error': str(e)}
