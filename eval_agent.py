import json
import re
from typing import Dict, Any, List
from base_agent import BaseAgent

class EvalAgent(BaseAgent):
    """Evaluates raw generation output and determines scene/node boundaries."""

    def execute(self, story_id: str, scene_id: str, node_id: str, text: str) -> Dict[str, Any]:
        """Evaluate raw text and determine node/scene boundaries."""
        execution_id = self._start_execution(story_id, source_text=text)
        try:
            prompt = f"{self.config['instructions']}\n\n{text}"

            def heuristic_eval() -> str:
                """Local evaluation fallback breaking text into paragraphs."""
                paragraphs: List[str] = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
                segments = []
                for para in paragraphs:
                    is_scene = bool(re.match(r"^(scene|\#\s*scene)\b", para, re.IGNORECASE))
                    segments.append({"text": para, "new_scene": is_scene})
                processed = "\n\n".join(seg["text"] for seg in segments)
                return json.dumps({
                    "processed_text": processed,
                    "segments": segments,
                    "new_scene": segments[0]["new_scene"] if segments else False,
                    "new_node": len(segments) > 1
                })

            messages = [{"role": "user", "content": prompt}]
            result = self.call_llm_with_fallback(
                messages=messages,
                fallback_func=heuristic_eval,
                max_tokens=400,
                temperature=0.2,
            )

            try:
                data = json.loads(result)
                processed_text = data.get("processed_text", text)
                new_scene = bool(data.get("new_scene"))
                new_node = bool(data.get("new_node"))
                segments = data.get("segments")
            except Exception:
                processed_text = text
                new_scene = False
                new_node = False
                segments = None

            self._finish_execution(result, "Evaluation complete", getattr(self, "_current_tokens", 0))
            return {
                "success": True,
                "processed_text": processed_text,
                "new_scene": new_scene,
                "new_node": new_node,
                "segments": segments,
            }
        except Exception as e:
            self._finish_execution("", f"Error: {str(e)}")
            return {"success": False, "error": str(e)}
