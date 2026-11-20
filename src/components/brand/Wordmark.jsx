/**
 * The StockFlow wordmark: the name set in type, nothing else.
 * Size is set by the caller through font-size utilities (e.g. text-lg).
 */
const Wordmark = ({ className = '' }) => <span className={`wordmark ${className}`}>StockFlow</span>;

export default Wordmark;
