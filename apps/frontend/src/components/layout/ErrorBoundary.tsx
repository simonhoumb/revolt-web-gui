import { Component, type ErrorInfo, type ReactNode } from "react";
import { ObcButton } from "@oicl/openbridge-webcomponents-react/components/button/button.js";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
	children: ReactNode;
}

interface ErrorBoundaryState {
	error: Error | null;
}

// Class component is required here -- componentDidCatch/getDerivedStateFromError have no hook
// equivalent, this is the one place React still needs a class. Without this, any render-phase
// error (a real bug, or a Vite Fast Refresh module invalidation landing the tree in an
// inconsistent state mid-edit -- see LayoutContext.tsx's comment) unmounts the entire app down to
// a blank #root with nothing on screen, since React 18 has no other default recovery for an
// uncaught error during render.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Uncaught render error:", error, info.componentStack);
	}

	handleReload = () => {
		window.location.reload();
	};

	render() {
		if (this.state.error) {
			return (
				<div className={styles.wrapper}>
					<h1>Something went wrong</h1>
					<p>{this.state.error.message}</p>
					<ObcButton onClick={this.handleReload}>Reload</ObcButton>
				</div>
			);
		}
		return this.props.children;
	}
}
