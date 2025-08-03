# strywrtr

A real-time storytelling playground where every word is a live object. Creators improvise scenes, branch realities, and perfect showpiece moments without ever losing track of their world.


## Classes
Definition of concepts with inheritable attributes.

## Entities
Instances of classes defined by:
Form, Function, Character, Goal, History.

## States
Aspects of an entity at a moment in time. Temporal, dynamic.

## Relationships
State-to-state connections.

## Perceptions
States' interpretations of states. Perspectives.

## Awareness
Weights system to determine what makes it into the finite input context space. Attention decay to clear the palate for new creation.

## Representations
Audio/Visual representations of entities, states, relationships.
Real world to story entity imports are possible using representations.

## Story Nodes
Smallest unit of story in recursive hierarchy, fractal structure. If it advances the plot can be labeled a beat.

## Agents
Agents have clearly defined tasks and store their main prompts in the database, they're subject to revision by the SystemAgent as they adapt to evolving needs of the system.

* PrepAgent

* GeneratorAgent
Raw generator of text.

- EntityAgent
	- Identifies entities in a bound area of text. Creates and manages entity state and relationships.

- ContinuityGuard
	- Preserves continuity of entities across story.

- EvalAgent
	- Evaluates the output, manages story/beat classification and performs assesment of faitfulness to intent/quality.

- SystemAgent
	- Observes and revises the main prompts of other agents, enters them into the database as new versions, as needed. Orchestrator.

- PerceptionAgent

- AwarenessAgent

- RepresentationAgent