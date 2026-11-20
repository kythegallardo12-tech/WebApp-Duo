import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import Wordmark from './brand/Wordmark';
import useAuth from '../store/useAuth';
import { ROUTES } from '../lib/routes';

/** Shown on sign-in and workspace routes when the API cannot be reached. */
export default function ServerUnavailable() {
  const bootstrap = useAuth((s) => s.bootstrap);
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-4 bg-canvas">
      <Link to={ROUTES.home} className="text-xl rounded-md">
        <Wordmark />
      </Link>
      <div className="card p-8 max-w-md w-full text-center" role="alert">
        <span className="mx-auto mb-4 flex w-11 h-11 items-center justify-center rounded-full bg-danger-soft text-danger">
          <WifiOff size={22} aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-ink">Cannot reach the StockFlow server</h1>
        <p className="text-sm text-ink-2 mt-2">Check that the server is running and your connection is working, then try again.</p>
        <button type="button" onClick={bootstrap} className="btn btn-primary mt-6">
          Try again
        </button>
      </div>
    </div>
  );
}

