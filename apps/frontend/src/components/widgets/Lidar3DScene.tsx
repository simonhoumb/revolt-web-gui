import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { PointCloudPoint } from "../../hooks/usePointCloudData.js";
import { rosPointsToThreeBufferPositions } from "../../lib/lidarPointCloud.js";
import { MOUNTING_YAW_DEG } from "./Lidar2DCanvas.js";
import styles from "./LidarWidget.module.css";

interface Lidar3DSceneProps {
	points: PointCloudPoint[];
}

const YAW_RAD = (MOUNTING_YAW_DEG * Math.PI) / 180;

// Default camera placement: a "chase cam" positioned behind the bow and looking toward it,
// rather than a fixed world-space spot. The bow marker points along local +X before the group's
// yaw rotation is applied (see the <mesh> below), so world-space forward is
// (cos(YAW_RAD), 0, -sin(YAW_RAD)); placing the camera at the opposite of that (scaled by
// CHASE_DISTANCE) and elevated by CHASE_HEIGHT means OrbitControls -- whose target defaults to
// the origin -- ends up looking the same direction the vessel is heading, not just at it.
const CHASE_DISTANCE = 40;
const CHASE_HEIGHT = 25;
const DEFAULT_CAMERA_POSITION: [number, number, number] = [
	-Math.cos(YAW_RAD) * CHASE_DISTANCE,
	CHASE_HEIGHT,
	Math.sin(YAW_RAD) * CHASE_DISTANCE,
];

export function Lidar3DScene({ points }: Lidar3DSceneProps) {
	const positions = useMemo(() => rosPointsToThreeBufferPositions(points), [points]);

	return (
		<div className={styles.canvas3d}>
			<Canvas camera={{ position: DEFAULT_CAMERA_POSITION, fov: 50 }}>
				<ambientLight intensity={0.6} />
				{/* Same MOUNTING_YAW_DEG correction Lidar2DCanvas applies to its own rotation, so both
				views agree on which way the vessel's bow faces. */}
				<group rotation={[0, YAW_RAD, 0]}>
					<points>
						<bufferGeometry key={points.length}>
							<bufferAttribute attach="attributes-position" args={[positions, 3]} />
						</bufferGeometry>
						<pointsMaterial size={0.3} color="#4fd1ff" sizeAttenuation />
					</points>
					{/* Vessel bow marker, tip pointing toward +X (forward) once yaw-rotated. */}
					<mesh rotation={[0, 0, -Math.PI / 2]}>
						<coneGeometry args={[0.8, 2, 8]} />
						<meshBasicMaterial color="orange" />
					</mesh>
				</group>
				<gridHelper args={[100, 20]} />
				<OrbitControls
					enableDamping
					dampingFactor={0.75}
					minDistance={5}
					maxDistance={150}
				/>
			</Canvas>
		</div>
	);
}
