"""Unit tests for bridge/commands.py's COMMANDS registry.

No network required — the registry is pure metadata. These tests guard the invariants the
service layer relies on (e.g. every dict key matches its own command_id) so a typo in a new
entry fails loudly here rather than as a confusing 404 at the API layer.
"""

from revolt_api.bridge.commands import COMMANDS, CommandKind


def test_every_entry_key_matches_its_own_command_id() -> None:
	for key, spec in COMMANDS.items():
		assert key == spec.command_id


def test_service_call_commands_declare_rosapi_service_and_type() -> None:
	for spec in COMMANDS.values():
		if spec.kind is CommandKind.SERVICE_CALL:
			assert spec.rosapi_service is not None
			assert spec.rosapi_type is not None


def test_topic_echo_commands_have_no_rosapi_service() -> None:
	for spec in COMMANDS.values():
		if spec.kind is CommandKind.TOPIC_ECHO:
			assert spec.rosapi_service is None
			assert spec.rosapi_type is None


def test_echo_topic_has_a_required_topic_select_param() -> None:
	spec = COMMANDS["echo_topic"]
	assert len(spec.params) == 1
	param = spec.params[0]
	assert param.name == "topic"
	assert param.kind == "topic_select"
	assert param.required is True


def test_node_details_has_a_required_text_node_param() -> None:
	spec = COMMANDS["node_details"]
	assert len(spec.params) == 1
	param = spec.params[0]
	assert param.name == "node"
	assert param.kind == "text"


def test_get_param_has_a_required_param_select_name_param() -> None:
	spec = COMMANDS["get_param"]
	assert len(spec.params) == 1
	param = spec.params[0]
	assert param.name == "name"
	assert param.kind == "param_select"
	assert param.required is True


def test_list_commands_have_no_params() -> None:
	for command_id in ("list_topics", "list_nodes", "list_services", "get_param_names"):
		assert COMMANDS[command_id].params == ()
