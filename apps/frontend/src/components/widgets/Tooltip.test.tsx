import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tooltip, TooltipVariant } from "./Tooltip.js";
import { boxForSide, fitsViewport, parseCssTimeMs, pickSide } from "./tooltipPlacement.js";

afterEach(() => {
	cleanup();
});

function rect(partial: Partial<DOMRect>): DOMRect {
	return {
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: 0,
		height: 0,
		toJSON: () => ({}),
		...partial,
	};
}

describe("boxForSide", () => {
	const trigger = rect({ top: 100, left: 100, right: 140, bottom: 120, width: 40, height: 20 });
	const bubble = { width: 60, height: 24 };

	it("places bottom below and horizontally centered on the trigger", () => {
		expect(boxForSide("bottom", trigger, bubble)).toEqual({
			top: 128, // trigger.bottom(120) + GAP(8)
			left: 90, // trigger.left(100) + width/2(20) - bubble.width/2(30)
			width: 60,
			height: 24,
		});
	});

	it("places top above and horizontally centered on the trigger", () => {
		expect(boxForSide("top", trigger, bubble)).toEqual({
			top: 68, // trigger.top(100) - GAP(8) - bubble.height(24)
			left: 90,
			width: 60,
			height: 24,
		});
	});

	it("places right beside and vertically centered on the trigger", () => {
		expect(boxForSide("right", trigger, bubble)).toEqual({
			top: 98, // trigger.top(100) + height/2(10) - bubble.height/2(12)
			left: 148, // trigger.right(140) + GAP(8)
			width: 60,
			height: 24,
		});
	});

	it("places left beside and vertically centered on the trigger", () => {
		expect(boxForSide("left", trigger, bubble)).toEqual({
			top: 98,
			left: 32, // trigger.left(100) - GAP(8) - bubble.width(60)
			width: 60,
			height: 24,
		});
	});
});

describe("fitsViewport", () => {
	it("accepts a box fully within the viewport", () => {
		expect(fitsViewport({ top: 10, left: 10, width: 50, height: 20 }, 800, 600)).toBe(true);
	});

	it("rejects a box clipping any single edge", () => {
		expect(fitsViewport({ top: -5, left: 10, width: 50, height: 20 }, 800, 600)).toBe(false);
		expect(fitsViewport({ top: 10, left: -5, width: 50, height: 20 }, 800, 600)).toBe(false);
		expect(fitsViewport({ top: 590, left: 10, width: 50, height: 20 }, 800, 600)).toBe(false);
		expect(fitsViewport({ top: 10, left: 780, width: 50, height: 20 }, 800, 600)).toBe(false);
	});
});

describe("pickSide", () => {
	const bubble = { width: 60, height: 24 };

	it("defaults to bottom when there's room below", () => {
		const trigger = rect({
			top: 100,
			left: 100,
			right: 140,
			bottom: 120,
			width: 40,
			height: 20,
		});
		expect(pickSide(trigger, bubble, 800, 600).side).toBe("bottom");
	});

	it("falls back to top when the trigger is at the bottom of the viewport", () => {
		// Right at the bottom edge -- placing below would push the bubble off-screen.
		const trigger = rect({
			top: 590,
			left: 100,
			right: 140,
			bottom: 600,
			width: 40,
			height: 10,
		});
		expect(pickSide(trigger, bubble, 800, 600).side).toBe("top");
	});

	it("falls back to right when neither top nor bottom fit but there's horizontal room", () => {
		// A viewport too short (30px) for the 24px-tall bubble to clear either above or below the
		// trigger (each needs GAP + bubble.height = 32px of clearance), but tall enough for it to
		// fit centered beside the trigger instead, with room to the right of it.
		const trigger = rect({ top: 8, left: 10, right: 50, bottom: 16, width: 40, height: 8 });
		expect(pickSide(trigger, bubble, 800, 30).side).toBe("right");
	});

	it("falls back to left when nothing else fits to the right either", () => {
		const trigger = rect({ top: 8, left: 750, right: 790, bottom: 16, width: 40, height: 8 });
		expect(pickSide(trigger, bubble, 800, 30).side).toBe("left");
	});
});

describe("parseCssTimeMs", () => {
	it("parses milliseconds", () => {
		expect(parseCssTimeMs("500ms", 0)).toBe(500);
	});

	it("parses seconds", () => {
		expect(parseCssTimeMs("1.5s", 0)).toBe(1500);
	});

	it("falls back on an unparseable value", () => {
		expect(parseCssTimeMs("nonsense", 250)).toBe(250);
	});
});

describe("Tooltip", () => {
	it("renders its children", () => {
		render(
			<Tooltip label="Hello">
				<button>Trigger</button>
			</Tooltip>,
		);
		expect(screen.getByText("Trigger")).toBeInTheDocument();
	});

	it("renders an obc-tooltip with the given label, defaulting to the normal variant", () => {
		render(
			<Tooltip label="Some info">
				<span>Trigger</span>
			</Tooltip>,
		);
		const tooltip = document.querySelector("obc-tooltip") as HTMLElement & {
			label: string;
			variant: string;
			showIcon: boolean;
		};
		expect(tooltip.label).toBe("Some info");
		expect(tooltip.variant).toBe("normal");
		expect(tooltip.showIcon).toBe(false);
	});

	it("passes through a non-default variant", () => {
		render(
			<Tooltip label="Careful" variant={TooltipVariant.warning}>
				<span>Trigger</span>
			</Tooltip>,
		);
		const tooltip = document.querySelector("obc-tooltip") as HTMLElement & { variant: string };
		expect(tooltip.variant).toBe("warning");
	});

	it("shows the icon slot only when an icon is provided", () => {
		const { rerender } = render(
			<Tooltip label="No icon">
				<span>Trigger</span>
			</Tooltip>,
		);
		let tooltip = document.querySelector("obc-tooltip") as HTMLElement & { showIcon: boolean };
		expect(tooltip.showIcon).toBe(false);
		expect(document.querySelector('[slot="icon"]')).toBeNull();

		rerender(
			<Tooltip label="With icon" icon={<span data-testid="icon" />}>
				<span>Trigger</span>
			</Tooltip>,
		);
		tooltip = document.querySelector("obc-tooltip") as HTMLElement & { showIcon: boolean };
		expect(tooltip.showIcon).toBe(true);
		expect(document.querySelector('[slot="icon"]')).not.toBeNull();
	});

	it("picks a side (and positions the bubble) on hover, based on the trigger's actual position", () => {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
		Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });

		const { container } = render(
			<Tooltip label="Info">
				<button>Trigger</button>
			</Tooltip>,
		);
		const anchor = container.querySelector<HTMLElement>("span");
		// Portaled to document.body (see Tooltip.tsx), so it's no longer a DOM descendant of anchor.
		const bubble = document.querySelector<HTMLElement>('[class*="bubble"]');
		if (!anchor || !bubble) throw new Error("expected anchor and bubble to be in the DOM");

		// jsdom never lays anything out, so getBoundingClientRect() has to be mocked to exercise
		// the actual flip logic -- a trigger sitting flush against the bottom of the viewport, like
		// the top bar's own tooltips would need the opposite (flush against the top).
		anchor.getBoundingClientRect = () => rect({ top: 590, left: 100, right: 140, bottom: 600 });
		bubble.getBoundingClientRect = () => rect({ width: 60, height: 24 });

		act(() => {
			fireEvent.mouseEnter(anchor);
		});

		expect(bubble.dataset.side).toBe("top");
		expect(bubble.style.top).toBe("558px"); // 590 - GAP(8) - bubble.height(24)
	});

	it("reveals only after the show delay elapses, and hides after the hide delay elapses", () => {
		// jsdom doesn't implement real CSS custom-property inheritance for getComputedStyle, so this
		// exercises the JS timer fallback path (DEFAULT_SHOW_DELAY_MS/DEFAULT_HIDE_DELAY_MS in
		// Tooltip.tsx) rather than a --tooltip-show-delay/--tooltip-hide-delay override, which isn't
		// reliably testable outside a real browser.
		vi.useFakeTimers();
		try {
			const { container } = render(
				<Tooltip label="Info">
					<button>Trigger</button>
				</Tooltip>,
			);
			const anchor = container.querySelector<HTMLElement>("span");
			const bubble = document.querySelector<HTMLElement>('[class*="bubble"]');
			if (!anchor || !bubble) throw new Error("expected anchor and bubble to be in the DOM");

			act(() => {
				fireEvent.mouseEnter(anchor);
			});
			expect(bubble.dataset.visible).toBeUndefined();

			act(() => {
				vi.advanceTimersByTime(499);
			});
			expect(bubble.dataset.visible).toBeUndefined();

			act(() => {
				vi.advanceTimersByTime(1);
			});
			expect(bubble.dataset.visible).toBe("true");

			act(() => {
				fireEvent.mouseLeave(anchor);
				vi.advanceTimersByTime(0);
			});
			expect(bubble.dataset.visible).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	describe("asChild", () => {
		it("renders the child directly with no wrapping element", () => {
			const { container } = render(
				<Tooltip label="Info" asChild>
					<button>Trigger</button>
				</Tooltip>,
			);
			expect(container.querySelector('[class*="anchor"]')).toBeNull();
			expect(container.firstElementChild?.tagName).toBe("BUTTON");
		});

		it("attaches placement handlers directly to the child and still positions the bubble", () => {
			Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
			Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });

			const { container } = render(
				<Tooltip label="Info" asChild>
					<button>Trigger</button>
				</Tooltip>,
			);
			const button = container.querySelector("button");
			const bubble = document.querySelector<HTMLElement>('[class*="bubble"]');
			if (!button || !bubble) throw new Error("expected button and bubble to be in the DOM");

			button.getBoundingClientRect = () =>
				rect({ top: 100, left: 100, right: 140, bottom: 120 });
			bubble.getBoundingClientRect = () => rect({ width: 60, height: 24 });

			act(() => {
				fireEvent.mouseEnter(button);
			});

			expect(bubble.dataset.side).toBe("bottom");
			expect(bubble.style.top).toBe("128px"); // trigger.bottom(120) + GAP(8)
		});

		it("still calls the child's own handler alongside its own", () => {
			const onMouseEnter = vi.fn();
			const { container } = render(
				<Tooltip label="Info" asChild>
					<button onMouseEnter={onMouseEnter}>Trigger</button>
				</Tooltip>,
			);
			const button = container.querySelector("button");
			if (!button) throw new Error("expected button in the DOM");

			act(() => {
				fireEvent.mouseEnter(button);
			});

			expect(onMouseEnter).toHaveBeenCalledTimes(1);
		});
	});
});
