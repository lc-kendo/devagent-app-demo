/**
 * Standalone review-count report page — thin wrapper around the shared widget.
 */
import { renderReport } from './report-widget.js';

document.addEventListener('DOMContentLoaded', () => {
  renderReport(document.getElementById('report-root'));
});
