
![alt text](static/logo.png "fractal wrtr" | width=150)

# Fractal Wrtr
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org)
[![GitHub stars](https://img.shields.io/github/stars/alperenguman/fwrtr?style=social)](https://github.com/alperenguman/fwrtr)

A real-time writing playground where every word is a live object.


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

- GeneratorAgent
	- Raw generator of text.

- EntityAgent
	- Identifies entities in a bound area of text. Creates and manages entity state and relationships.

- ContinuityGuard
	- Preserves continuity of entities across story.

- EvalAgent
	- Evaluates the output 
	- Manages story/beat classification 
	- Performs assesment of faitfulness to intent/quality

- SystemAgent
	- Observes and revises the main prompts of other agents 
	- Enters them into the database as new versions, as needed. 
	- Orchestrator of systems

- PerceptionAgent

- AwarenessAgent

- RepresentationAgent