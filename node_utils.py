import sqlite3
from typing import Optional, Dict, List
import uuid


def create_node(conn: sqlite3.Connection, story_id: str, scene_id: str,
                parent_node_id: Optional[str] = None, title: str = "", content: str = "",
                position: Optional[int] = None) -> str:
    """Create a new node under parent_node_id.

    Automatically assigns position if not provided and returns the new node_id.
    """
    if position is None:
        cur = conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM nodes WHERE story_id = ? AND scene_id = ? AND parent_node_id IS ?",
            (story_id, scene_id, parent_node_id)
        )
        position = cur.fetchone()[0]
    node_id = f"{scene_id}:n{uuid.uuid4().hex[:8]}"
    conn.execute(
        "INSERT INTO nodes (node_id, story_id, scene_id, parent_node_id, title, content, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (node_id, story_id, scene_id, parent_node_id, title, content, position)
    )
    conn.commit()
    return node_id


def get_node(conn: sqlite3.Connection, node_id: str) -> Optional[sqlite3.Row]:
    """Retrieve a node by ID."""
    cur = conn.execute("SELECT * FROM nodes WHERE node_id = ?", (node_id,))
    return cur.fetchone()


def get_children(conn: sqlite3.Connection, parent_node_id: str) -> List[sqlite3.Row]:
    """Retrieve direct children of a node ordered by position."""
    cur = conn.execute(
        "SELECT * FROM nodes WHERE parent_node_id = ? ORDER BY position",
        (parent_node_id,)
    )
    return cur.fetchall()


def reorder_node(conn: sqlite3.Connection, node_id: str, new_position: int) -> None:
    """Update a node's position."""
    conn.execute("UPDATE nodes SET position = ? WHERE node_id = ?", (new_position, node_id))
    conn.commit()


def get_descendant_ids(conn: sqlite3.Connection, node_id: str) -> List[str]:
    """Return list of node_id for node and all its descendants."""
    ids = [node_id]
    queue = [node_id]
    while queue:
        current = queue.pop(0)
        cur = conn.execute(
            "SELECT node_id FROM nodes WHERE parent_node_id = ? ORDER BY position",
            (current,)
        )
        children = [row[0] for row in cur.fetchall()]
        ids.extend(children)
        queue.extend(children)
    return ids
