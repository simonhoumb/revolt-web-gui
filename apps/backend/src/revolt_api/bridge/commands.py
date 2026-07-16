import enum
from dataclasses import dataclass
from typing import Literal


class CommandKind(enum.StrEnum):
	SERVICE_CALL = "service_call"
	TOPIC_ECHO = "topic_echo"


@dataclass(frozen=True)
class CommandParamSpec:
	name: str
	label: str
	# topic_select: statically allow-listed against protocol.py's subscribe topics for the live
	# target. param_select: dynamically populated from /rosapi/get_param_names -- unlike
	# topic_select there's no static allow-list to validate against (the whole point is
	# discovering names that can't be known ahead of time), so it's a discoverability aid, not a
	# validated restriction (see ros_command_service._validate_static_params). text: free-form.
	kind: Literal["topic_select", "param_select", "text"]
	required: bool = True


@dataclass(frozen=True)
class CommandSpec:
	command_id: str
	label: str
	description: str
	kind: CommandKind
	rosapi_service: str | None = None  # required iff kind is SERVICE_CALL
	rosapi_type: str | None = None  # required iff kind is SERVICE_CALL
	params: tuple[CommandParamSpec, ...] = ()
	timeout_s: float = 5.0


# v1 is introspection-only: nothing here can move the vessel. Actuation stays exclusively owned
# by Mission Control's start/pause/terminate state machine (services/mission_service.py) -- a
# generic command console must not grow a second path to that safety-critical surface. Field
# names for the rosapi services below (topics/types, nodes, services, subscribing/publishing/
# services, name/default_value -> value/successful/reason, names) are verified against
# RobotWebTools/rosbridge_suite's rosapi_msgs/srv definitions and rosapi_node's actual service
# handlers on the ros2 branch, not assumed -- including get_param_names' "<node>:<param>" name
# format and get_param's matching ":"-split parsing of that same format.
COMMANDS: dict[str, CommandSpec] = {
	"list_topics": CommandSpec(
		command_id="list_topics",
		label="List topics",
		description="List every topic currently active on the ROS2 graph, with its message type.",
		kind=CommandKind.SERVICE_CALL,
		rosapi_service="/rosapi/topics",
		rosapi_type="rosapi_msgs/Topics",
	),
	"list_nodes": CommandSpec(
		command_id="list_nodes",
		label="List nodes",
		description="List every node currently active on the ROS2 graph.",
		kind=CommandKind.SERVICE_CALL,
		rosapi_service="/rosapi/nodes",
		rosapi_type="rosapi_msgs/Nodes",
	),
	"list_services": CommandSpec(
		command_id="list_services",
		label="List services",
		description="List every service currently advertised on the ROS2 graph.",
		kind=CommandKind.SERVICE_CALL,
		rosapi_service="/rosapi/services",
		rosapi_type="rosapi_msgs/Services",
	),
	"node_details": CommandSpec(
		command_id="node_details",
		label="Node details",
		description="Show the publishers, subscribers, and services owned by a specific node.",
		kind=CommandKind.SERVICE_CALL,
		rosapi_service="/rosapi/node_details",
		rosapi_type="rosapi_msgs/NodeDetails",
		params=(CommandParamSpec(name="node", label="Node name", kind="text"),),
	),
	"get_param_names": CommandSpec(
		command_id="get_param_names",
		label="List parameter names",
		description="List every known parameter name, as <node>:<param> pairs.",
		kind=CommandKind.SERVICE_CALL,
		rosapi_service="/rosapi/get_param_names",
		rosapi_type="rosapi_msgs/GetParamNames",
	),
	"get_param": CommandSpec(
		command_id="get_param",
		label="Get parameter",
		description="Read a ROS2 parameter's current value.",
		kind=CommandKind.SERVICE_CALL,
		rosapi_service="/rosapi/get_param",
		rosapi_type="rosapi_msgs/GetParam",
		# Sourced from get_param_names' response (a <node>:<param> string) -- rosapi's own
		# service dispatcher (rosapi_node's _get_node_and_param_name) splits this same "name" on
		# ":" to resolve which node's parameter to read, so the two are designed as a pair.
		params=(CommandParamSpec(name="name", label="Parameter name", kind="param_select"),),
	),
	"echo_topic": CommandSpec(
		command_id="echo_topic",
		label="Echo topic",
		description="Show the latest message received on an already-subscribed topic.",
		kind=CommandKind.TOPIC_ECHO,
		params=(CommandParamSpec(name="topic", label="Topic", kind="topic_select"),),
	),
}
