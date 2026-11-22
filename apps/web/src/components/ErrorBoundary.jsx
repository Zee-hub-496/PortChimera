import { Component } from 'react';
import { describeCrash } from '../lib/crashInfo.js';
import { Button, ErrorState, buttonClass } from './ui.jsx';

/**
 * Catches errors thrown while React renders its children and shows a recovery screen instead of
 * a white page. It cannot catch errors in event handlers or in async code; those still need their
 * own try/catch (the pages already show their own error states for failed requests).
 *
 * variant="page": used inside the app layout around the page, so the sidebar and header stay
 *   usable. `resetKey` (the current path) clears the error when the user navigates elsewhere.
 * variant="root": last line of defence around the whole app. It has no router or theme access, so
 *   it only uses plain links and a reload button.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Name and short message only. No user data is logged.
    console.error('ui_crash', {
      ...describeCrash(error),
      componentStack: String(info?.componentStack ?? '').slice(0, 1000),
    });
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.variant === 'root') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-fg">
          <div className="w-full max-w-md">
            <ErrorState
              title="PortChimera hit an unexpected problem"
              message="Your data is safe. Reload the page to continue."
              action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
            />
          </div>
        </div>
      );
    }

    return (
      <ErrorState
        className="mt-2"
        title="This page hit an unexpected problem"
        message="The rest of the app still works. You can try again or go back to the dashboard."
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={this.retry}>Try again</Button>
            <a href="/dashboard" className={buttonClass('secondary')}>
              Go to dashboard
            </a>
          </div>
        }
      />
    );
  }
}
