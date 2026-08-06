import { useCallback, useEffect, useRef, useState } from "react";
import { ObcStepperBox } from "@oicl/openbridge-webcomponents-react/components/stepper-box/stepper-box.js";
import { ObcToggleButtonGroup } from "@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group.js";
import { ObcToggleButtonOption } from "@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option.js";
import { ObcToggleButtonOptionType } from "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import { ObcNumberInputField } from "@oicl/openbridge-webcomponents-react/components/number-input-field/number-input-field.js";
import {
	ObcNumberInputField as ObcNumberInputFieldElement,
	ObcNumberInputFieldSize,
} from "@oicl/openbridge-webcomponents/dist/components/number-input-field/number-input-field.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { ObiHeadingHUpProposal } from "@oicl/openbridge-webcomponents-react/icons/icon-heading-h-up-proposal.js";
import { ObiHeadingNUpProposal } from "@oicl/openbridge-webcomponents-react/icons/icon-heading-n-up-proposal.js";
import { ObiHeadingCUpProposal } from "@oicl/openbridge-webcomponents-react/icons/icon-heading-c-up-proposal.js";
import { ObiCenterIec } from "@oicl/openbridge-webcomponents-react/icons/icon-center-iec.js";
import { ObiCenterOffIec } from "@oicl/openbridge-webcomponents-react/icons/icon-center-off-iec.js";
import { ObiWaypointEditIec } from "@oicl/openbridge-webcomponents-react/icons/icon-waypoint-edit-iec.js";
import { ObiWaypointAddIec } from "@oicl/openbridge-webcomponents-react/icons/icon-waypoint-add-iec.js";
import { ObiVisibilityOnGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-visibility-on-google.js";
import { ObiVisibilityOffGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-visibility-off-google.js";
import { ObiArrowTopRight } from "@oicl/openbridge-webcomponents-react/icons/icon-arrow-top-right.js";
import { ObiArrowBottomLeft } from "@oicl/openbridge-webcomponents-react/icons/icon-arrow-bottom-left.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { useVesselTrack } from "../../hooks/useVesselTrack.js";
import { useWaypointDraft } from "../../hooks/useWaypointDraft.js";
import { useAisTargets } from "../../hooks/useAisTargets.js";
import { useMission } from "../../context/useMission.js";
import { useLegHazards } from "../../context/useLegHazards.js";
import { useApps } from "../../context/useApps.js";
import { useChartSettings } from "../../context/useChartSettings.js";
import { useMapLibreInstance, scaleNmForZoom } from "../../hooks/useMapLibreInstance.js";
import { useOwnShipMarker } from "../../hooks/useOwnShipMarker.js";
import { useVesselTrackLayer } from "../../hooks/useVesselTrackLayer.js";
import { useWaypointMarkers } from "../../hooks/useWaypointMarkers.js";
import { useAisMarkers } from "../../hooks/useAisMarkers.js";
import { inputValue } from "../../lib/dom.js";
import { s52Color } from "../../lib/s52Colors.js";
import styles from "./MapWidget.module.css";
import { Tooltip } from "./Tooltip.js";

type RotationMode = "H" | "N" | "C"; // HEADING-UP || NORTH-UP || COURSE-UP
type EditMode = "edit" | "add";

export function MapWidget() {
	const containerRef = useRef<HTMLDivElement>(null);
	const { activeAppId } = useApps();
	const [rotationMode, setRotationMode] = useState<RotationMode>("N");
	const [cameraLocked, setCameraLocked] = useState(true);
	const [editMode, setEditMode] = useState<EditMode>("edit");
	const [aisVisible, setAisVisible] = useState(true);
	// Whether the map's control bar (range stepper, orientation/camera-lock/edit-mode/AIS toggle
	// groups) is shown at all, not just a "mini-map" zoomed-out view -- the map itself is always
	// full size, this only hides its overlaid controls to get an unobstructed view (e.g. the
	// Conning app's default, where the map is a supporting chart rather than the primary focus).
	const [showControls, setShowControls] = useState(activeAppId !== "conning");

	const { latitude, longitude, headingDeg, courseDeg } = useGnssData();
	const track = useVesselTrack();
	const { waypoints } = useWaypointDraft();
	const { addWaypoint, updateWaypointPosition } = useMission();
	const { legValidation, setLegValidation } = useLegHazards();
	const aisTargets = useAisTargets();
	const { palette, symbolStyle, setSymbolStyle, safetyContourM, setSafetyContourM } =
		useChartSettings();
	const [safetyContourDraft, setSafetyContourDraft] = useState(String(safetyContourM));
	const safetyContourInputRef = useRef<ObcNumberInputFieldElement | null>(null);

	useEffect(() => {
		setSafetyContourDraft(String(safetyContourM));
	}, [safetyContourM]);

	const commitSafetyContour = useCallback(() => {
		const parsed = Number.parseFloat(safetyContourDraft);
		if (Number.isFinite(parsed) && parsed > 0 && parsed !== safetyContourM) {
			setSafetyContourM(parsed);
		} else {
			setSafetyContourDraft(String(safetyContourM));
		}
	}, [safetyContourDraft, safetyContourM, setSafetyContourM]);

	// ObcNumberInputField's onBlur prop is unreliable through @lit/react's wrapper (only onInput is
	// in its events map), so commit-on-blur is wired via a ref + native focusout listener instead;
	// see WaypointRow.tsx's speed input for the same pattern and the full explanation.
	useEffect(() => {
		const el = safetyContourInputRef.current;
		if (!el) return;
		el.addEventListener("focusout", commitSafetyContour);
		return () => {
			el.removeEventListener("focusout", commitSafetyContour);
		};
	}, [commitSafetyContour]);

	// Call order matters: useOwnShipMarker/useVesselTrackLayer/useWaypointMarkers/useAisMarkers
	// all read mapRef.current inside a mount effect of their own, relying on
	// useMapLibreInstance's mount effect (which actually creates the map) having already run
	// earlier in this same commit.
	const { mapRef, zoom } = useMapLibreInstance(containerRef, {
		palette,
		symbolStyle,
		safetyContourM,
	});
	useOwnShipMarker(mapRef, {
		latitude,
		longitude,
		headingDeg,
		color: s52Color(palette, "ships"),
	});
	useVesselTrackLayer(mapRef, track, palette);
	useWaypointMarkers(mapRef, {
		waypoints,
		legValidation,
		editMode,
		addWaypoint,
		updateWaypointPosition,
		setLegValidation,
		safetyContourM,
	});
	useAisMarkers(mapRef, aisVisible ? aisTargets : []);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.getCanvas().style.cursor = editMode === "add" ? "crosshair" : "";
	}, [editMode, mapRef]);

	// Hiding controls hides the route-edit toggle group (see the toolbar below), so there's no way
	// for the operator to switch back out of "add" once hidden; force it back to pan-only "edit"
	// the moment controls hide, rather than leaving a stale add-mode cursor/click-to-place
	// behavior active on a map with no visible affordance to turn it off.
	useEffect(() => {
		if (!showControls) setEditMode("edit");
	}, [showControls]);

	// H/N/C chart orientation: bearing follows true heading, course over
	// ground, or stays fixed at true north depending on the selected mode.
	// dragRotate/touch rotation are disabled (see useMapLibreInstance), so this is the only way
	// the chart's bearing changes. Skip the update while the operator is
	// actively dragging -- same guard the OpenBridge ECDIS demo uses --
	// otherwise every heading/course tick fights the pan gesture and the drag
	// feels like it keeps getting cancelled. Same reasoning extends to scroll-zoom (isZooming):
	// without it, a heading/course tick arriving mid-gesture retargets the camera's bearing via
	// its own easeTo while MapLibre's own zoom interpolation is also actively driving the same
	// camera, and the two fighting over the same transition is what read as jitter specifically
	// while zooming. eased (not snapped) so the rotation itself isn't jarring once it does apply.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || map.dragPan.isActive() || map.isZooming()) return;
		const bearing =
			rotationMode === "H" ? (headingDeg ?? 0) : rotationMode === "C" ? (courseDeg ?? 0) : 0;
		map.easeTo({ bearing, duration: 300 });
	}, [rotationMode, headingDeg, courseDeg, mapRef]);

	// Camera lock: while locked, dragging is disabled and the chart recentres
	// on every fix; "free" hands panning back to the operator. Scroll-zoom follows the same
	// split: MapLibre's default zooms around the cursor, which is the right feel for free
	// camera, but while locked to the vessel that would let the scroll wheel drag the vessel
	// off-center out from under a stationary cursor -- pin the zoom anchor to the map center
	// (i.e. the vessel, since locked mode keeps it centred) instead. scrollZoom.enable() is a
	// no-op if it's already enabled (MapLibre checks isEnabled() and returns early before
	// touching the "around" option) -- it's enabled by default from map creation, so the very
	// first call here would silently do nothing without disabling it first.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.scrollZoom.disable();
		if (cameraLocked) {
			map.dragPan.disable();
			map.scrollZoom.enable({ around: "center" });
		} else {
			map.dragPan.enable();
			map.scrollZoom.enable();
		}
	}, [cameraLocked, mapRef]);

	// Instant, not eased: this runs on every single fix while locked, and
	// easeTo()'s 500ms default animation would otherwise restart on each new
	// fix before the previous one finishes -- the camera ends up perpetually
	// chasing a moving target, with catch-up speed varying with fix timing
	// jitter. Matches the OpenBridge ECDIS demo's own choice of an instant
	// setCenter() for continuous tracking.
	useEffect(() => {
		const map = mapRef.current;
		if (!cameraLocked || !map || latitude === null || longitude === null) return;
		// GNSS fixes (real receiver noise, or the mock backend's simulated drift) jitter by a tiny
		// amount even when the vessel is essentially stationary. Re-centring on every fix regardless
		// turns that sub-pixel noise into a visible 1-2px shimmer across the whole scene -- every
		// static waypoint marker and leg appears to "jump" even though nothing actually moved.
		// Skipping fixes that wouldn't move the camera by a perceptible amount on screen keeps real
		// vessel movement tracked smoothly (it accumulates past the threshold within a fix or two)
		// while filtering out noise that was never going to be visible as movement anyway.
		const current = map.getCenter();
		const currentPx = map.project([current.lng, current.lat]);
		const nextPx = map.project([longitude, latitude]);
		const movedPx = Math.hypot(nextPx.x - currentPx.x, nextPx.y - currentPx.y);
		if (movedPx < 1) return;
		map.jumpTo({ center: [longitude, latitude] });
	}, [cameraLocked, latitude, longitude, mapRef]);

	const handleRotationValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setRotationMode(e.detail.value as RotationMode);
		},
		[],
	);

	const handleCameraLockValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setCameraLocked(e.detail.value === "locked");
		},
		[],
	);

	const handleEditModeValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setEditMode(e.detail.value as EditMode);
		},
		[],
	);

	const handleAisVisibleValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setAisVisible(e.detail.value === "visible");
		},
		[],
	);

	const handleSymbolStyleValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setSymbolStyle(e.detail.value === "traditional" ? "traditional" : "simplified");
		},
		[setSymbolStyle],
	);

	const handleToggleControls = useCallback(() => {
		setShowControls((v) => !v);
	}, []);

	const handleZoomIn = useCallback(() => {
		mapRef.current?.zoomIn();
	}, [mapRef]);

	const handleZoomOut = useCallback(() => {
		mapRef.current?.zoomOut();
	}, [mapRef]);

	return (
		<div className={styles.mapWrapper}>
			<div ref={containerRef} className={styles.mapContainer} aria-label="Oslo Fjord chart" />
			{/* The toggle button is a permanent first child of the bar, not floated separately over
			    the map: that keeps it visually grouped with the bar's own chrome (background,
			    border, shadow) in both states, rather than reading as a stray overlay control. Only
			    the other controls are conditionally rendered; the bar itself shrinks to fit-content
			    (see .toolbar[data-collapsed] below) around just this button when they're hidden,
			    instead of unmounting entirely. Icon shows the action a click performs, same
			    convention as TileCard's view-mode button. */}
			<div className={styles.toolbar} data-collapsed={showControls ? undefined : ""}>
				<Tooltip label={showControls ? "Hide map controls" : "Show map controls"}>
					<ObcIconButton
						className={styles.controlsToggle}
						variant={IconButtonVariant.normal}
						aria-label={showControls ? "Hide map controls" : "Show map controls"}
						onClick={handleToggleControls}
					>
						{showControls ? <ObiArrowBottomLeft /> : <ObiArrowTopRight />}
					</ObcIconButton>
				</Tooltip>
				{showControls && (
					<>
						<ObcStepperBox
							aria-label="Chart range"
							onUp={handleZoomIn}
							onDown={handleZoomOut}
						>
							<div>{scaleNmForZoom(zoom).toFixed(1)}</div>
							<div slot="unit">NM</div>
						</ObcStepperBox>
						<ObcToggleButtonGroup
							aria-label="Chart orientation"
							value={rotationMode}
							type={ObcToggleButtonOptionType.icon}
							onValue={handleRotationValue}
						>
							<Tooltip label="Heading up" asChild>
								<ObcToggleButtonOption value="H" aria-label="Heading up">
									<ObiHeadingHUpProposal slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
							<Tooltip label="North up" asChild>
								<ObcToggleButtonOption value="N" aria-label="North up">
									<ObiHeadingNUpProposal slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
							<Tooltip label="Course up" asChild>
								<ObcToggleButtonOption value="C" aria-label="Course up">
									<ObiHeadingCUpProposal slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
						</ObcToggleButtonGroup>
						<ObcToggleButtonGroup
							aria-label="Camera lock"
							value={cameraLocked ? "locked" : "free"}
							type={ObcToggleButtonOptionType.icon}
							onValue={handleCameraLockValue}
						>
							<Tooltip label="Lock camera to vessel" asChild>
								<ObcToggleButtonOption
									value="locked"
									aria-label="Lock camera on vessel"
								>
									<ObiCenterIec slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
							<Tooltip label="Free camera" asChild>
								<ObcToggleButtonOption value="free" aria-label="Free camera">
									<ObiCenterOffIec slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
						</ObcToggleButtonGroup>
						<ObcToggleButtonGroup
							aria-label="Route edit mode"
							value={editMode}
							type={ObcToggleButtonOptionType.icon}
							onValue={handleEditModeValue}
						>
							<Tooltip label="Edit waypoints" asChild>
								<ObcToggleButtonOption value="edit" aria-label="Edit waypoints">
									<ObiWaypointEditIec slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
							<Tooltip label="Add waypoint" asChild>
								<ObcToggleButtonOption value="add" aria-label="Add waypoint">
									<ObiWaypointAddIec slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
						</ObcToggleButtonGroup>
						<ObcToggleButtonGroup
							aria-label="AIS targets"
							value={aisVisible ? "visible" : "hidden"}
							type={ObcToggleButtonOptionType.icon}
							onValue={handleAisVisibleValue}
						>
							<Tooltip label="Show AIS targets" asChild>
								<ObcToggleButtonOption
									value="visible"
									aria-label="Show AIS targets"
								>
									<ObiVisibilityOnGoogle slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
							<Tooltip label="Hide AIS targets" asChild>
								<ObcToggleButtonOption value="hidden" aria-label="Hide AIS targets">
									<ObiVisibilityOffGoogle slot="icon" />
								</ObcToggleButtonOption>
							</Tooltip>
						</ObcToggleButtonGroup>
						{/* Symbol style and safety contour live here, not in the brilliance panel: those
						    are chart-content/mission-safety settings a mariner adjusts while looking at
						    the chart, not display-preference settings that apply uniformly regardless of
						    what's being planned. */}
						<ObcToggleButtonGroup
							aria-label="Symbol style"
							value={symbolStyle}
							type={ObcToggleButtonOptionType.text}
							onValue={handleSymbolStyleValue}
						>
							<Tooltip label="Simplified symbols" asChild>
								<ObcToggleButtonOption
									value="simplified"
									aria-label="Simplified symbols"
								>
									Simplified
								</ObcToggleButtonOption>
							</Tooltip>
							<Tooltip label="Traditional symbols" asChild>
								<ObcToggleButtonOption
									value="traditional"
									aria-label="Traditional symbols"
								>
									Traditional
								</ObcToggleButtonOption>
							</Tooltip>
						</ObcToggleButtonGroup>
						<ObcNumberInputField
							ref={safetyContourInputRef}
							aria-label="Safety contour depth"
							size={ObcNumberInputFieldSize.Regular}
							unit="m"
							value={safetyContourDraft}
							onInput={(e) => {
								setSafetyContourDraft(inputValue(e));
							}}
						/>
					</>
				)}
			</div>
		</div>
	);
}
