"""LangGraph StateGraph compilation for Vayu agents (Phase 3.3).

```
START → scout → (needs_forecast?) → forecaster → policy → END
                      └─no──────────────────────▲
```
"""

from __future__ import annotations

from typing import Any, Literal

from airsight.agents.nodes import forecaster_agent, policy_agent, scout_agent
from airsight.agents.state import AgentState, empty_state

_HAS_LANGGRAPH = True
_LG_ERR: str | None = None
try:
    from langgraph.graph import END, START, StateGraph
except ImportError as e:  # pragma: no cover
    _HAS_LANGGRAPH = False
    _LG_ERR = str(e)
    StateGraph = None  # type: ignore
    START = END = None  # type: ignore


class InstallError(RuntimeError):
    pass


def require_langgraph() -> None:
    if not _HAS_LANGGRAPH:
        raise InstallError(
            "langgraph is required for the multi-agent graph.\n"
            "  pip install langgraph langchain-core\n"
            f"Original error: {_LG_ERR}"
        )


def _route_after_scout(state: AgentState) -> Literal["forecaster", "policy"]:
    """Conditional edge: run Forecaster only when Scout requests it."""
    if state.get("needs_forecast") or state.get("mode") == "demo":
        return "forecaster"
    return "policy"


def build_vayu_agent_graph():
    """Compile Scout → Forecaster? → Policy graph."""
    require_langgraph()
    assert StateGraph is not None

    g: Any = StateGraph(AgentState)
    g.add_node("scout", scout_agent)
    g.add_node("forecaster", forecaster_agent)
    g.add_node("policy", policy_agent)

    g.add_edge(START, "scout")
    g.add_conditional_edges(
        "scout",
        _route_after_scout,
        {"forecaster": "forecaster", "policy": "policy"},
    )
    g.add_edge("forecaster", "policy")
    g.add_edge("policy", END)
    return g.compile()


# Lazy singleton for FastAPI
_COMPILED = None


def get_compiled_graph():
    global _COMPILED
    if _COMPILED is None:
        _COMPILED = build_vayu_agent_graph()
    return _COMPILED


def run_analysis(
    city_id: str,
    *,
    mode: Literal["live", "demo", "offline"] = "live",
    request_id: str | None = None,
) -> AgentState:
    """Invoke the compiled graph and return the final AgentState."""
    graph = get_compiled_graph()
    init = empty_state(city_id, mode=mode)
    if request_id:
        init["request_id"] = request_id
    result = graph.invoke(init)
    return result  # type: ignore[return-value]


__all__ = [
    "InstallError",
    "build_vayu_agent_graph",
    "get_compiled_graph",
    "require_langgraph",
    "run_analysis",
    "_HAS_LANGGRAPH",
]
